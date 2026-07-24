/*
 * Rectangular conformal tetrahedral projections based on L. P. Lee's
 * conformal face transform.
 *
 * Lee transform and tetrahedral net adapted from d3-geo-polygon:
 * Copyright 2017-2024 Mike Bostock, ISC license.
 * https://github.com/d3/d3-geo-polygon/blob/main/src/tetrahedralLee.js
 *
 * The rectangular layout below is derived from Markley's repeated-face
 * construction: four affine copies of the triangular Lee net are clipped to
 * a 4/sqrt(3) frame. See F. Landis Markley, "Tetrahedral Map Projection"
 * (2020), and https://blog.map-projections.net/lee-markley-calm-and-grieger.
 */

import {
  createPolyhedralProjection,
  rotateSphericalRadians
} from './mapshaper-polyhedral-projection';

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var SQRT2 = Math.sqrt(2);
var SQRT3 = Math.sqrt(3);
var ASIN_ONE_THIRD = Math.asin(1 / 3);
var MARKLEY_LATITUDE = Math.acos(1 / 3) * 0.5 * R2D;
var LAYOUT_PERIOD = 8;
var MARKLEY_LAYOUT_PHASE = -2;
var CALM_LAYOUT_PHASE = -1.5;
var RECT_XMIN = -7;
var RECT_XMAX = 1;
var RECT_YMIN = -2 * SQRT3;
var RECT_YMAX = 0;
var EPS = 1e-12;
var MIN_PIECE_AREA = 1e-6;
var engines = {};

var TETRAHEDRON_VERTICES = [
  [0, 90],
  [-180, -ASIN_ONE_THIRD * R2D],
  [-60, -ASIN_ONE_THIRD * R2D],
  [60, -ASIN_ONE_THIRD * R2D]
];

var TETRAHEDRON_FACES = [
  [1, 2, 3],
  [0, 2, 1],
  [0, 3, 2],
  [0, 1, 3]
].map(function(face) {
  return face.map(function(i) {
    return TETRAHEDRON_VERTICES[i];
  });
});

var LAYOUT_COPIES = [
  {id: 0, name: 'green', matrix: [1, 0, 0, 0, -1, 0]},
  {id: 1, name: 'red', matrix: [-1, 0, -4, 0, 1, 0]},
  {id: 2, name: 'blue', matrix: [1, 0, -8, 0, -1, 0]},
  {id: 3, name: 'orange', matrix: [-1, 0, 4, 0, 1, 0]}
];

export function registerLeeTetrahedralProjections(mproj) {
  if (!mproj) return;
  register('markley', 'Markley conformal tetrahedral world map');
  register('calm', 'Conformal Authagraph-Like Map');

  function register(id, name) {
    if (mproj.internal.pj_list[id]) return;
    mproj.pj_add(function(P) {
      initLeeTetrahedral(P, id);
    }, id, name);
  }
}

export function getLeeTetrahedralEngine(id) {
  id = id || 'markley';
  if (!engines[id]) {
    engines[id] = createLeeTetrahedralEngine(
      getProjectionRotation(id),
      id == 'markley' ? MARKLEY_LAYOUT_PHASE : CALM_LAYOUT_PHASE
    );
  }
  return engines[id];
}

function initLeeTetrahedral(P, id) {
  var engine = getLeeTetrahedralEngine(id);
  P.es = 0;
  P.inv = null;
  P.fwd = function(lp, xy) {
    var p = engine.forward(lp.lam, lp.phi);
    xy.x = p[0];
    xy.y = p[1];
  };
  P.__projection_topology = engine.getTopology(P.lam0 * R2D);
  P.__projected_outline = engine.outline;
  P.__graticule_precision = 1;
}

function getProjectionRotation(id) {
  if (id == 'calm') {
    // Kunimune's published CALM aspect (77°N, 143°E, central meridian
    // 163°W), transformed into this implementation's tetrahedral symmetry.
    return [
      64.7261399569101,
      -39.84470062116125,
      -119.02303523591051
    ];
  }
  // Markley's singularities are at ±35.26439°, in the oceans.
  return [115, MARKLEY_LATITUDE - 90, 180];
}

export function createLeeTetrahedralEngine(rotation, layoutPhase) {
  var base = createPolyhedralProjection({
    faces: TETRAHEDRON_FACES,
    parents: [-1, 0, 0, 0],
    rotation: rotation,
    angle: 30,
    faceProjector: createLeeFaceProjector
  });
  var normalization = getBaseNormalization(base.outline);
  var baseTopology = base.getTopology(0);
  var sourceRegions = createSourceRegions(rotation);
  var rasterPieces = createLayoutPieces(
    baseTopology.regions, normalization, layoutPhase);
  var rasterPieceIndex = indexPiecesByFaceAndCopy(rasterPieces);
  var rasterPieceIds = rasterPieces.map(function(piece) { return piece.id; });
  var seamCache = new Map();
  var outline = [[
    centerOutputPoint([RECT_XMIN, RECT_YMIN]),
    centerOutputPoint([RECT_XMAX, RECT_YMIN]),
    centerOutputPoint([RECT_XMAX, RECT_YMAX]),
    centerOutputPoint([RECT_XMIN, RECT_YMAX]),
    centerOutputPoint([RECT_XMIN, RECT_YMIN])
  ]];

  return {
    forward: forward,
    inverse: inverse,
    outline: outline,
    getTopology: getTopology
  };

  function forward(lam, phi) {
    var p = normalizeBasePoint(base.forward(lam, phi), normalization);
    var copy = getLayoutCopy(p);
    var q = applyMatrix(copy.matrix, p);
    q[0] = wrapLayoutX(q[0] + layoutPhase);
    q[0] = clamp(q[0], RECT_XMIN, RECT_XMAX);
    q[1] = clamp(q[1], RECT_YMIN, RECT_YMAX);
    return centerOutputPoint(q);
  }

  // Internal inverse used to trace the geographic cut corresponding to the
  // rectangular frame. The public projection remains forward-only.
  function inverse(x, y) {
    var q = uncenterOutputPoint([x, y]);
    for (var i = 0; i < rasterPieces.length; i++) {
      var piece = rasterPieces[i];
      if (!pointInRing(centerOutputPoint(q), piece.boundary)) continue;
      var p = applyMatrix(invertMatrix(piece.matrix), q);
      var projected = getLayoutCopy(p);
      if (projected.id != piece.copy) continue;
      p = denormalizeBasePoint(p, normalization);
      var spherical = base.invertFace(p[0], p[1], piece.face);
      if (!spherical) continue;
      var check = forward(spherical[0], spherical[1]);
      if (Math.hypot(check[0] - x, check[1] - y) < 1e-6) {
        return spherical;
      }
    }
    return null;
  }

  function getTopology(lon0) {
    var result = {
      interrupted: true,
      regions: rasterPieces.map(copyProjectedPiece),
      findRegion: findRegion,
      findTransitionRegion: findRegion,
      projectRegion: projectRegion,
      raster_regions: rasterPieces.map(copyRasterPiece),
      raster_source_regions: sourceRegions.map(function(region) {
        return {
          id: region.id,
          boundary: region.boundary.map(function(p) {
            return [
              normalizeLongitude(p[0] + lon0),
              p[1]
            ];
          })
        };
      }),
      raster_mesh_interval: 32,
      raster_cell_halo: false,
      fill_raster_mask: true,
      fill_raster_coverage: true,
      findRasterRegion: findRasterRegion,
      projectRasterRegion: projectRasterRegion,
      projectRasterSourceRegion: projectRasterSourceRegion,
      clipRasterRegionPolygon: clipRasterRegionPolygon,
      frame_bounds: [
        outline[0][0][0],
        outline[0][0][1],
        outline[0][2][0],
        outline[0][2][1]
      ],
      outline: outline.map(function(ring) {
        return ring.map(function(p) { return p.concat(); });
      })
    };
    // Rasters use the region mesh but never need geographic seam paths.
    // Tracing the rectangular cut is deferred until vector clipping requests it.
    Object.defineProperty(result, 'seams', {
      enumerable: true,
      get: function() {
        if (!seamCache.has(lon0)) {
          var topology = base.getTopology(lon0);
          var seams = topology.seams.map(function(seam) {
            return {
              type: 'attached',
              faces: seam.faces,
              paths: seam.paths
            };
          });
          seams.push({
            type: 'cut',
            paths: createFrameCutPaths(inverse, lon0)
          });
          seamCache.set(lon0, seams);
        }
        return seamCache.get(lon0);
      }
    });
    return result;

    function findRegion(lon, lat) {
      var lam = normalizeLongitude(lon - lon0) * D2R;
      var phi = lat * D2R;
      var face = base.findFace(lam, phi);
      var p = normalizeBasePoint(base.forwardFace(lam, phi, face), normalization);
      var copy = getLayoutCopy(p);
      var q = applyMatrix(copy.matrix, p);
      q[0] = wrapLayoutX(q[0] + layoutPhase);
      q[0] = clamp(q[0], RECT_XMIN, RECT_XMAX);
      q[1] = clamp(q[1], RECT_YMIN, RECT_YMAX);
      q = centerOutputPoint(q);
      var ids = rasterPieceIndex.get(getPieceKey(face, copy.id)) || [];
      var region = findPieceContainingPoint(rasterPieces, ids, q);
      if (region === undefined) {
        region = findPieceContainingPoint(rasterPieces, rasterPieceIds, q);
      }
      return region;
    }

    function projectRegion(lon, lat, regionId) {
      return projectPiece(lon, lat, rasterPieces[regionId]);
    }

    function findRasterRegion(lon, lat) {
      return findRegion(lon, lat);
    }

    function projectRasterRegion(lon, lat, regionId) {
      return projectPiece(lon, lat, rasterPieces[regionId]);
    }

    function projectPiece(lon, lat, piece) {
      var lam = normalizeLongitude(lon - lon0) * D2R;
      var p = normalizeBasePoint(
        base.forwardFace(lam, lat * D2R, piece.face),
        normalization
      );
      return centerOutputPoint(applyMatrix(piece.matrix, p));
    }

    function projectRasterSourceRegion(lon, lat, sourceRegionId) {
      var lam = normalizeLongitude(lon - lon0) * D2R;
      return normalizeBasePoint(
        base.forwardFace(lam, lat * D2R, sourceRegionId),
        normalization
      );
    }

    function clipRasterRegionPolygon(vertices, regionId) {
      var piece = rasterPieces[regionId];
      var polygon = vertices.map(function(vertex) {
        var p = applyMatrix(piece.matrix, [vertex.x, vertex.y]);
        return copyRasterVertex(vertex, p[0], p[1]);
      });
      polygon = clipRasterPolygonAxis(polygon, 'x', RECT_XMIN, true);
      polygon = clipRasterPolygonAxis(polygon, 'x', RECT_XMAX, false);
      polygon = clipRasterPolygonAxis(polygon, 'y', RECT_YMIN, true);
      polygon = clipRasterPolygonAxis(polygon, 'y', RECT_YMAX, false);
      polygon.forEach(function(vertex) {
        var p = centerOutputPoint([vertex.x, vertex.y]);
        vertex.x = p[0];
        vertex.y = p[1];
      });
      return polygon;
    }
  }
}

function createSourceRegions(rotation) {
  return TETRAHEDRON_FACES.map(function(face, id) {
    var boundary = face.map(function(p) {
      var q = rotateSphericalRadians(
        p[0] * D2R, p[1] * D2R, rotation, true);
      return [normalizeLongitude(q[0] * R2D), q[1] * R2D];
    });
    boundary.push(boundary[0].concat());
    return {id: id, boundary: boundary};
  });
}

function createLayoutPieces(regions, normalization, layoutPhase) {
  var pieces = [];
  regions.forEach(function(region) {
    var boundary = region.projected_boundary.map(function(p) {
      return normalizeBasePoint(p, normalization);
    });
    LAYOUT_COPIES.forEach(function(copy) {
      var polygon = clipLayoutCopyDomain(boundary, copy.id);
      if (polygon.length < 3 ||
          Math.abs(getRingArea(polygon)) < MIN_PIECE_AREA) return;
      [-LAYOUT_PERIOD, 0, LAYOUT_PERIOD].forEach(function(wrap) {
        var matrix = shiftMatrixX(copy.matrix, layoutPhase + wrap);
        var projected = polygon.map(function(p) {
          return applyMatrix(matrix, p);
        });
        projected = clipPolygonAxis(projected, 0, RECT_XMIN, true);
        projected = clipPolygonAxis(projected, 0, RECT_XMAX, false);
        projected = clipPolygonAxis(projected, 1, RECT_YMIN, true);
        projected = clipPolygonAxis(projected, 1, RECT_YMAX, false);
        if (projected.length < 3 ||
            Math.abs(getRingArea(projected)) < MIN_PIECE_AREA) return;
        pieces.push({
          id: pieces.length,
          face: region.id,
          source_region: region.id,
          copy: copy.id,
          matrix: matrix,
          boundary: projected.map(centerOutputPoint)
        });
      });
    });
  });
  return pieces;
}

function clipLayoutCopyDomain(polygon, copyId) {
  if (copyId == 0) { // green
    polygon = clipPolygonAxis(polygon, 1, 0, true);
    polygon = clipPolygonAxis(polygon, 0, 3, false);
  } else if (copyId == 2) { // blue
    polygon = clipPolygonAxis(polygon, 1, 0, true);
    polygon = clipPolygonAxis(polygon, 0, 3, true);
  } else if (copyId == 1) { // red
    polygon = clipPolygonAxis(polygon, 1, 0, false);
    polygon = clipPolygonAxis(polygon, 0, 1, false);
  } else { // orange
    polygon = clipPolygonAxis(polygon, 1, 0, false);
    polygon = clipPolygonAxis(polygon, 0, 1, true);
  }
  return polygon;
}

function copyProjectedPiece(piece) {
  return {
    id: piece.id,
    source_region: piece.source_region,
    copy: piece.copy,
    projected_boundary: closeRing(piece.boundary)
  };
}

function copyRasterPiece(piece) {
  return {
    id: piece.id,
    source_region: piece.source_region,
    projected_boundary: closeRing(piece.boundary)
  };
}

function createFrameCutPaths(inverse, lon0) {
  // The repeated tetrahedral net is continuous inside the frame. Its only
  // geographic cuts are the three independent sides of the periodic rectangle.
  var n = 6000;
  // Stay far enough inside the frame to avoid browser-specific inverse
  // branches at the exact Lee face boundary.
  var epsilon = 5e-8;
  var xmin = centerOutputPoint([RECT_XMIN, 0])[0];
  var xmax = centerOutputPoint([RECT_XMAX, 0])[0];
  var ymin = centerOutputPoint([0, RECT_YMIN])[1];
  var ymax = centerOutputPoint([0, RECT_YMAX])[1];
  var edges = [
    [[xmin + epsilon, ymin], [xmin + epsilon, ymax]],
    [[xmin, ymax - epsilon], [xmax, ymax - epsilon]],
    [[xmin, ymin + epsilon], [xmax, ymin + epsilon]]
  ];
  return edges.reduce(function(memo, edge) {
    var path = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var x = edge[0][0] + (edge[1][0] - edge[0][0]) * t;
      var y = edge[0][1] + (edge[1][1] - edge[0][1]) * t;
      var p = inverse(x, y);
      if (!p) continue;
      path.push([
        normalizeLongitude(p[0] * R2D + lon0),
        p[1] * R2D
      ]);
    }
    return memo.concat(splitPathAtAntimeridian(path));
  }, []).map(function(path) {
    path.mask_width = 4e-5;
    return path;
  });
}

function splitPathAtAntimeridian(path) {
  if (path.length < 2) return [];
  var paths = [];
  var part = [path[0]];
  for (var i = 1; i < path.length; i++) {
    var a = path[i - 1];
    var b = path[i];
    if (Math.abs(a[0] - b[0]) > 180) {
      var adjusted = b[0] + (b[0] < a[0] ? 360 : -360);
      var edge = a[0] < 0 ? -180 : 180;
      var t = (edge - a[0]) / (adjusted - a[0]);
      var lat = a[1] + (b[1] - a[1]) * t;
      part.push([edge, lat]);
      paths.push(part);
      part = [[-edge, lat], b];
    } else {
      part.push(b);
    }
  }
  if (part.length > 1) paths.push(part);
  return paths;
}

function closeRing(ring) {
  var copy = ring.map(function(p) { return p.concat(); });
  if (copy.length && !pointsEqual(copy[0], copy[copy.length - 1])) {
    copy.push(copy[0].concat());
  }
  return copy;
}

function getLayoutCopy(p) {
  // The four transformed triangular nets tile the frame. These two straight
  // cuts select the unique copy containing a point from the base net.
  if (p[1] >= 0) return p[0] > 3 ? LAYOUT_COPIES[2] : LAYOUT_COPIES[0];
  return p[0] > 1 ? LAYOUT_COPIES[3] : LAYOUT_COPIES[1];
}

function centerOutputPoint(p) {
  return [
    p[0] - (RECT_XMIN + RECT_XMAX) / 2,
    p[1] - (RECT_YMIN + RECT_YMAX) / 2
  ];
}

function uncenterOutputPoint(p) {
  return [
    p[0] + (RECT_XMIN + RECT_XMAX) / 2,
    p[1] + (RECT_YMIN + RECT_YMAX) / 2
  ];
}

function getBaseNormalization(outline) {
  var xmin = Infinity;
  var ymin = Infinity;
  var xmax = -Infinity;
  var ymax = -Infinity;
  outline.forEach(function(ring) {
    ring.forEach(function(p) {
      xmin = Math.min(xmin, p[0]);
      ymin = Math.min(ymin, p[1]);
      xmax = Math.max(xmax, p[0]);
      ymax = Math.max(ymax, p[1]);
    });
  });
  return {
    cx: (xmin + xmax) / 2,
    cy: (ymin + ymax) / 2,
    scale: 8 / (xmax - xmin)
  };
}

function normalizeBasePoint(p, normalization) {
  return [
    (p[0] - normalization.cx) * normalization.scale,
    -(p[1] - normalization.cy) * normalization.scale
  ];
}

function denormalizeBasePoint(p, normalization) {
  return [
    p[0] / normalization.scale + normalization.cx,
    -p[1] / normalization.scale + normalization.cy
  ];
}

function createLeeFaceProjector(face) {
  var c = face.centroid;
  var rotation = Math.abs(c[1]) == 90 ?
    [0, -c[1], -30] :
    [-c[0], -c[1], 30];
  function project(lam, phi) {
    var p = rotateSphericalRadians(lam, phi, rotation);
    var q = leeRaw(p[0], p[1]);
    return [q[0], -q[1]];
  }
  project.invert = function(x, y) {
    var p = invertLeeRaw(x, -y);
    return p && rotateSphericalRadians(p[0], p[1], rotation, true);
  };
  return project;
}

function leeRaw(lam, phi) {
  var w = [-0.5, SQRT3 / 2];
  var z = complexMultiply(stereographicRaw(lam, phi), [SQRT2, 0]);
  var powers = [0, 1, 2].map(function(i) {
    return complexPower(w, [i, 0]);
  });
  var sector = 0;
  for (var i = 1; i < powers.length; i++) {
    if (complexMultiply(z, powers[i])[0] >
        complexMultiply(z, powers[sector])[0]) sector = i;
  }
  var rot = powers[sector];
  var n = complexNorm(z);
  var h = [0, 0];
  var k = [0, 0];

  if (n > 0.3) {
    var y = complexSubtract([1, 0], complexMultiply(rot, z));
    var w1 = 1.4021821053254548;
    var coefficients = [
      1.15470053837925, 0.192450089729875, 0.0481125224324687,
      0.010309826235529, 3.34114739114366e-4, -1.50351632601465e-3,
      -1.2304417796231e-3, -6.75190201960282e-4,
      -2.84084537293856e-4, -8.21205120500051e-5,
      -1.59257630018706e-6, 1.91691805888369e-5,
      1.73095888028726e-5, 1.03865580818367e-5,
      4.70614523937179e-6, 1.4413500104181e-6,
      1.92757960170179e-8, -3.82869799649063e-7,
      -3.57526015225576e-7, -2.2175964844211e-7
    ];
    var g = [0, 0];
    for (i = coefficients.length - 1; i >= 0; i--) {
      g = complexAdd([coefficients[i], 0], complexMultiply(g, y));
    }
    k = complexSubtract([w1, 0], complexMultiply(complexPower(y, 0.5), g));
    k = complexMultiply(complexMultiply(k, rot), rot);
  }

  if (n < 0.5) {
    var h0 = [1, 1 / 8, 3 / 56, 1 / 32, 35 / 1664, 63 / 4096, 231 / 19456];
    var z3 = complexPower(z, [3, 0]);
    for (i = h0.length - 1; i >= 0; i--) {
      h = complexAdd([h0[i], 0], complexMultiply(h, z3));
    }
    h = complexMultiply(h, z);
  }

  if (n < 0.3) return h;
  if (n > 0.5) return k;
  var t = (n - 0.3) / 0.2;
  return complexAdd(
    complexMultiply(k, [t, 0]),
    complexMultiply(h, [1 - t, 0])
  );
}

function invertLeeRaw(x, y) {
  var lam = x;
  var phi = y * 0.5;
  var da = 0;
  var db = 0;
  var err2 = Infinity;
  var eps = 1e-12;
  for (var i = 0; i < 40; i++) {
    var q = leeRaw(lam, phi);
    var tx = q[0] - x;
    var ty = q[1] - y;
    if (Math.abs(tx) < eps && Math.abs(ty) < eps) break;
    var error = tx * tx + ty * ty;
    if (error > err2) {
      lam -= da /= 2;
      phi -= db /= 2;
      continue;
    }
    err2 = error;
    var ea = (lam > 0 ? -1 : 1) * eps;
    var eb = (phi > 0 ? -1 : 1) * eps;
    var qa = leeRaw(lam + ea, phi);
    var qb = leeRaw(lam, phi + eb);
    var dxa = (qa[0] - q[0]) / ea;
    var dya = (qa[1] - q[1]) / ea;
    var dxb = (qb[0] - q[0]) / eb;
    var dyb = (qb[1] - q[1]) / eb;
    var det = dyb * dxa - dya * dxb;
    if (Math.abs(det) < 1e-14) break;
    var scale = (Math.abs(det) < 0.5 ? 0.5 : 1) / det;
    da = (ty * dxb - tx * dyb) * scale;
    db = (tx * dya - ty * dxa) * scale;
    lam += da;
    phi += db;
    if (Math.abs(da) < eps && Math.abs(db) < eps) break;
  }
  var check = leeRaw(lam, phi);
  return Math.hypot(check[0] - x, check[1] - y) < 1e-8 ?
    [lam, phi] : null;
}

function stereographicRaw(lam, phi) {
  var cosPhi = Math.cos(phi);
  var k = 1 / (1 + cosPhi * Math.cos(lam));
  return [k * cosPhi * Math.sin(lam), k * Math.sin(phi)];
}

function complexAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function complexSubtract(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function complexMultiply(a, b) {
  return [a[0] * b[0] - a[1] * b[1], a[1] * b[0] + a[0] * b[1]];
}

function complexNorm(a) {
  return Math.hypot(a[0], a[1]);
}

function complexPower(value, exponent) {
  var a = value[0];
  var b = value[1];
  var n = typeof exponent == 'number' ? [exponent, 0] : exponent;
  if (a === 0 && b === 0) return [0, 0];
  if (!n[1] && b === 0 && a >= 0) {
    return [Math.pow(a, n[0]), 0];
  }
  var arg = Math.atan2(b, a);
  var logNorm = Math.log(Math.hypot(a, b));
  var magnitude = Math.exp(n[0] * logNorm - n[1] * arg);
  var angle = n[1] * logNorm + n[0] * arg;
  return [magnitude * Math.cos(angle), magnitude * Math.sin(angle)];
}

function applyMatrix(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2],
    m[3] * p[0] + m[4] * p[1] + m[5]
  ];
}

function shiftMatrixX(matrix, offset) {
  var shifted = matrix.concat();
  shifted[2] += offset;
  return shifted;
}

function wrapLayoutX(x) {
  while (x < RECT_XMIN) x += LAYOUT_PERIOD;
  while (x > RECT_XMAX) x -= LAYOUT_PERIOD;
  return x;
}

function invertMatrix(m) {
  var det = m[0] * m[4] - m[1] * m[3];
  return [
    m[4] / det,
    -m[1] / det,
    (m[1] * m[5] - m[4] * m[2]) / det,
    -m[3] / det,
    m[0] / det,
    (m[3] * m[2] - m[0] * m[5]) / det
  ];
}

function clipPolygonAxis(polygon, axis, value, keepGreater) {
  var output = [];
  if (!polygon.length) return output;
  var a = polygon[polygon.length - 1];
  var aInside = keepGreater ? a[axis] >= value - EPS : a[axis] <= value + EPS;
  polygon.forEach(function(b) {
    var bInside = keepGreater ? b[axis] >= value - EPS : b[axis] <= value + EPS;
    if (aInside != bInside) {
      var t = (value - a[axis]) / (b[axis] - a[axis]);
      var p = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
      ];
      p[axis] = value;
      output.push(p);
    }
    if (bInside) output.push(b.concat());
    a = b;
    aInside = bInside;
  });
  return output;
}

function clipRasterPolygonAxis(polygon, axis, value, keepGreater) {
  var output = [];
  if (!polygon.length) return output;
  var a = polygon[polygon.length - 1];
  var aInside = keepGreater ? a[axis] >= value - EPS : a[axis] <= value + EPS;
  polygon.forEach(function(b) {
    var bInside = keepGreater ? b[axis] >= value - EPS : b[axis] <= value + EPS;
    if (aInside != bInside) {
      var t = (value - a[axis]) / (b[axis] - a[axis]);
      var vertex = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        sx: a.sx + (b.sx - a.sx) * t,
        sy: a.sy + (b.sy - a.sy) * t,
        lon: interpolateLongitude(a.lon, b.lon, t),
        lat: a.lat + (b.lat - a.lat) * t
      };
      vertex[axis] = value;
      output.push(vertex);
    }
    if (bInside) output.push(copyRasterVertex(b, b.x, b.y));
    a = b;
    aInside = bInside;
  });
  return output;
}

function copyRasterVertex(vertex, x, y) {
  return {
    x: x,
    y: y,
    sx: vertex.sx,
    sy: vertex.sy,
    lon: vertex.lon,
    lat: vertex.lat
  };
}

function interpolateLongitude(a, b, t) {
  var delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeLongitude(a + delta * t);
}

function getRingArea(ring) {
  var area = 0;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

function indexPiecesByFaceAndCopy(pieces) {
  var index = new Map();
  pieces.forEach(function(piece) {
    var key = getPieceKey(piece.face, piece.copy);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(piece.id);
  });
  return index;
}

function findPieceContainingPoint(pieces, ids, point) {
  for (var i = 0; i < ids.length; i++) {
    if (pointInRing(point, pieces[ids[i]].boundary)) return ids[i];
  }
}

function pointInRing(point, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var a = ring[j];
    var b = ring[i];
    var cross = (point[0] - a[0]) * (b[1] - a[1]) -
      (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-8 &&
        point[0] >= Math.min(a[0], b[0]) - 1e-8 &&
        point[0] <= Math.max(a[0], b[0]) + 1e-8 &&
        point[1] >= Math.min(a[1], b[1]) - 1e-8 &&
        point[1] <= Math.max(a[1], b[1]) + 1e-8) return true;
    if ((a[1] > point[1]) != (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) /
        (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function getPieceKey(face, copy) {
  return face + ':' + copy;
}

function pointsEqual(a, b) {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

function normalizeLongitude(lon) {
  lon = (lon + 180) % 360;
  if (lon < 0) lon += 360;
  return lon - 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
