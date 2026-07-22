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
var RECT_XMIN = -7;
var RECT_XMAX = 1;
var RECT_YMIN = -2 * SQRT3;
var RECT_YMAX = 0;
var EPS = 1e-12;
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
    engines[id] = createLeeTetrahedralEngine(getProjectionRotation(id));
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
}

function getProjectionRotation(id) {
  if (id == 'calm') {
    // Exact D3 Euler equivalent of MapDesigner's published CALM aspect:
    // latitude 77°, longitude 143°, central meridian -163°.
    return [
      19.57956907750618,
      -12.42267097553935,
      3.8615690020132067
    ];
  }
  // Markley's singularities are at ±35.26439°, in the oceans.
  return [115, MARKLEY_LATITUDE - 90, 180];
}

function createLeeTetrahedralEngine(rotation) {
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
  var pieces = createLayoutPieces(baseTopology.regions, normalization);
  var pieceIndex = new Map(pieces.map(function(piece) {
    return [getPieceKey(piece.face, piece.copy), piece.id];
  }));
  var outline = [[
    centerOutputPoint([RECT_XMIN, RECT_YMIN]),
    centerOutputPoint([RECT_XMAX, RECT_YMIN]),
    centerOutputPoint([RECT_XMAX, RECT_YMAX]),
    centerOutputPoint([RECT_XMIN, RECT_YMAX]),
    centerOutputPoint([RECT_XMIN, RECT_YMIN])
  ]];

  return {
    forward: forward,
    outline: outline,
    getTopology: getTopology
  };

  function forward(lam, phi) {
    var p = normalizeBasePoint(base.forward(lam, phi), normalization);
    var copy = getLayoutCopy(p);
    return centerOutputPoint(applyMatrix(copy.matrix, p));
  }

  function getTopology(lon0) {
    var topology = base.getTopology(lon0);
    return {
      regions: pieces.map(copyProjectedPiece),
      seams: topology.seams.map(function(seam) {
        return {
          type: 'cut',
          faces: seam.faces,
          paths: seam.paths
        };
      }),
      findRegion: findRegion,
      findTransitionRegion: findRegion,
      projectRegion: projectRegion,
      raster_regions: pieces.map(copyRasterPiece),
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
      findRasterRegion: findRegion,
      projectRasterRegion: projectRegion,
      projectRasterSourceRegion: projectRasterSourceRegion,
      clipRasterRegionPolygon: clipRasterRegionPolygon,
      outline: outline.map(function(ring) {
        return ring.map(function(p) { return p.concat(); });
      })
    };

    function findRegion(lon, lat) {
      var lam = normalizeLongitude(lon - lon0) * D2R;
      var phi = lat * D2R;
      var face = base.findFace(lam, phi);
      var p = normalizeBasePoint(base.forwardFace(lam, phi, face), normalization);
      var copy = getLayoutCopy(p);
      return pieceIndex.get(getPieceKey(face, copy.id));
    }

    function projectRegion(lon, lat, regionId) {
      var piece = pieces[regionId];
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
      var piece = pieces[regionId];
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

function createLayoutPieces(regions, normalization) {
  var pieces = [];
  regions.forEach(function(region) {
    var boundary = region.projected_boundary.map(function(p) {
      return normalizeBasePoint(p, normalization);
    });
    LAYOUT_COPIES.forEach(function(copy) {
      var polygon = boundary.map(function(p) {
        return applyMatrix(copy.matrix, p);
      });
      polygon = clipPolygonAxis(polygon, 0, RECT_XMIN, true);
      polygon = clipPolygonAxis(polygon, 0, RECT_XMAX, false);
      polygon = clipPolygonAxis(polygon, 1, RECT_YMIN, true);
      polygon = clipPolygonAxis(polygon, 1, RECT_YMAX, false);
      if (polygon.length < 3 || Math.abs(getRingArea(polygon)) < EPS) return;
      var id = pieces.length;
      pieces.push({
        id: id,
        face: region.id,
        source_region: region.id,
        copy: copy.id,
        matrix: copy.matrix,
        boundary: polygon.map(centerOutputPoint)
      });
    });
  });
  return pieces;
}

function copyProjectedPiece(piece) {
  return {
    id: piece.id,
    source_region: piece.source_region,
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

function createLeeFaceProjector(face) {
  var c = face.centroid;
  var rotation = Math.abs(c[1]) == 90 ?
    [0, -c[1], -30] :
    [-c[0], -c[1], 30];
  return function(lam, phi) {
    var p = rotateSphericalRadians(lam, phi, rotation);
    var q = leeRaw(p[0], p[1]);
    return [q[0], -q[1]];
  };
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
