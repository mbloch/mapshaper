/*
 * Forward implementation of Hajime Narukawa's 2022 mathematical
 * approximation of the AuthaGraph construction.
 *
 * Facet formula:
 *   H. Narukawa, "Formulation of AuthaGraph Map Projection" (2022)
 *   https://www.jstage.jst.go.jp/article/jjca/60/1/60_1/_article/-char/en
 *
 * The rectangular facet routing follows the public Imago arrangement by
 * Justin Kunimune. The face transform itself uses Narukawa's published
 * equations, not Imago's power-law approximation.
 */

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var HALF_PI = Math.PI / 2;
var SQRT2 = Math.sqrt(2);
var SQRT3 = Math.sqrt(3);
var ASIN_ONE_THIRD = Math.asin(1 / 3);
var EDGE_SCALE = Math.acos(-1 / 3) / 2;
var XMIN = -2 * SQRT3;
var XMAX = 2 * SQRT3;
var YMIN = -1.5;
var YMAX = 1.5;
var WIDTH = XMAX - XMIN;
var BLOCK_HEIGHT = 2 * SQRT3;
var LAYOUT_SHIFT = 1.16;
var EPS = 1e-12;
var engines = {};

// The four tetrahedron vertices published by Narukawa, in latitude-longitude
// order. The extra precision preserves the regular tetrahedron to about 1e-9
// in vector dot products.
var GEOGRAPHIC_VERTICES = [
  [76.8810628, 149.4509913],
  [-27.9527772, 97.3570035],
  [-6.6370473, -18.8522325],
  [-22.9282364, -133.2827588]
];

// D3 Imago's vertex-oriented tetrahedral block. Each entry contains the
// spherical center, local meridian, planar rotation and planar center.
var FACET_DEFS = [
  [0, SQRT3, HALF_PI, 0, 0, -HALF_PI],
  [0, -SQRT3, -ASIN_ONE_THIRD, 0, Math.PI, HALF_PI],
  [3, 0, -ASIN_ONE_THIRD, 2 * Math.PI / 3, Math.PI, 5 * Math.PI / 6],
  [-3, 0, -ASIN_ONE_THIRD, -2 * Math.PI / 3, Math.PI, Math.PI / 6]
];

export function registerNarukawa2022Projection(mproj) {
  if (!mproj || mproj.internal.pj_list.narukawa2022) return;
  mproj.pj_add(function(P) {
    initNarukawa2022(P);
  }, 'narukawa2022', 'Narukawa 2022 tetrahedral world map');
}

export function getNarukawa2022Engine() {
  if (!engines.default) {
    engines.default = createNarukawa2022Engine();
  }
  return engines.default;
}

function initNarukawa2022(P) {
  var engine = getNarukawa2022Engine();
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

function createNarukawa2022Engine() {
  var orientation = createPublishedOrientation();
  var facets = FACET_DEFS.map(function(def, i) {
    return {
      id: i,
      x: def[0],
      y: def[1],
      lat: def[2],
      lon: def[3],
      meridian: def[4],
      rotation: def[5]
    };
  });
  var rasterSectors = facets.reduce(function(memo, facet) {
    return memo.concat(getRawFacetSectorBoundaries(facets, facet));
  }, []);
  var rasterPieces = createNarukawaRasterPieces(facets, rasterSectors);
  var rasterPieceIndex = new Map(rasterPieces.map(function(piece) {
    return [piece.key, piece.id];
  }));
  var outline = [[
    [XMIN * EDGE_SCALE, YMIN * EDGE_SCALE],
    [XMAX * EDGE_SCALE, YMIN * EDGE_SCALE],
    [XMAX * EDGE_SCALE, YMAX * EDGE_SCALE],
    [XMIN * EDGE_SCALE, YMAX * EDGE_SCALE],
    [XMIN * EDGE_SCALE, YMIN * EDGE_SCALE]
  ]];

  return {
    forward: forward,
    inverse: inverse,
    outline: outline,
    rasterPieces: rasterPieces,
    getTopology: getTopology
  };

  function forward(lam, phi) {
    var state = projectState(lam, phi);
    return [state.x * EDGE_SCALE, state.y * EDGE_SCALE];
  }

  // Internal inverse used only for tracing the geographic rectangular cut.
  // P.inv remains null because the full Mapshaper inverse path is unsupported.
  function inverse(x, y) {
    var p = invertLayout(x / EDGE_SCALE, y / EDGE_SCALE, facets);
    if (!p) return null;
    return fromCanonical(p[0], p[1], orientation);
  }

  function projectState(lam, phi) {
    var p = toCanonical(lam, phi, orientation);
    var state = projectCanonical(p[0], p[1], facets);
    state.region = encodeRegion(state);
    return state;
  }

  function getTopology(lon0) {
    var paths = createCutPaths(inverse, lon0);
    return {
      regions: createRegionIndex(),
      seams: [{
        type: 'cut',
        paths: paths
      }],
      findRegion: findRegion,
      findTransitionRegion: findRegion,
      raster_regions: rasterPieces.map(function(piece) {
        return {
          id: piece.id,
          facet: piece.facet,
          sector: piece.sector,
          source_region: piece.facet * 3 + piece.sector,
          projected_boundary: piece.boundary.map(function(p) {
            return [p[0] * EDGE_SCALE, p[1] * EDGE_SCALE];
          })
        };
      }),
      raster_source_regions: rasterSectors.map(function(sector) {
        return {
          id: sector.facet * 3 + sector.sector,
          source_region: sector.facet * 3 + sector.sector,
          facet: sector.facet,
          sector: sector.sector,
          boundary: sector.sphericalBoundary.map(function(p) {
            var q = fromCanonical(p[0], p[1], orientation);
            return [
              normalizeLongitude(q[0] * R2D + lon0),
              q[1] * R2D
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
      projectRasterSector: projectRasterSector,
      clipRasterRegionPolygon: clipRasterRegionPolygon,
      outline: outline.map(function(ring) {
        return ring.map(function(p) {
          return p.concat();
        });
      })
    };

    function findRegion(lon, lat) {
      var lam = normalizeRadians((lon - lon0) * D2R);
      return projectState(lam, lat * D2R).region;
    }

    function findRasterRegion(lon, lat) {
      var lam = normalizeRadians((lon - lon0) * D2R);
      var p = toCanonical(lam, lat * D2R, orientation);
      var facet = findForwardFacet(p[0], p[1], facets);
      var state = applyConditionalLayout(projectFacetRaw(p[0], p[1], facet), facet);
      return rasterPieceIndex.get(getRasterPieceKey(
        state.facet, state.sector, state.oobKey, state.folded, state.wrap
      ));
    }

    function projectRasterRegion(lon, lat, regionId) {
      var piece = rasterPieces[regionId];
      var lam = normalizeRadians((lon - lon0) * D2R);
      var p = toCanonical(lam, lat * D2R, orientation);
      var facet = facets[piece.facet];
      var raw = projectFacetRaw(p[0], p[1], facet, piece.sector);
      var q = applyRasterPieceLayout(raw, facet, piece);
      return [q[0] * EDGE_SCALE, q[1] * EDGE_SCALE];
    }

    function projectRasterSector(lon, lat, facetId, sector) {
      var lam = normalizeRadians((lon - lon0) * D2R);
      var p = toCanonical(lam, lat * D2R, orientation);
      var raw = projectFacetRaw(p[0], p[1], facets[facetId], sector);
      return [raw.x, raw.y];
    }

    function projectRasterSourceRegion(lon, lat, sourceRegionId) {
      return projectRasterSector(
        lon, lat, Math.floor(sourceRegionId / 3), sourceRegionId % 3);
    }

    function clipRasterRegionPolygon(vertices, regionId) {
      return clipRasterPiecePolygon(
        vertices, facets[rasterPieces[regionId].facet],
        rasterPieces[regionId]);
    }
  }
}

function createNarukawaRasterPieces(facets, rasterSectors) {
  var pieces = [];
  facets.forEach(function(facet) {
    rasterSectors.filter(function(o) {
      return o.facet == facet.id;
    }).forEach(function(sectorData) {
      ['normal', 'xpos', 'xneg', 'ypos', 'yneg'].forEach(function(oobKey) {
        var oobPolygon = clipOobPolygon(sectorData.boundary, oobKey);
        if (oobPolygon.length < 3) return;
        oobPolygon = oobPolygon.map(function(p) {
          return applyOobTransform(p, facet, oobKey);
        });
        [0, 1].forEach(function(folded) {
          var foldedPolygon = clipPolygonAxis(oobPolygon, 0, 0, folded == 0);
          if (foldedPolygon.length < 3) return;
          foldedPolygon = foldedPolygon.map(function(p) {
            return applyFoldTransform(p, folded);
          });
          [0, 1].forEach(function(wrap) {
            var finalPolygon = foldedPolygon.map(function(p) {
              return [
                p[0] + LAYOUT_SHIFT + wrap * 2 * BLOCK_HEIGHT - BLOCK_HEIGHT,
                p[1] + 1.5
              ];
            });
            finalPolygon = clipRectangle(
              finalPolygon, XMIN, YMIN, XMAX, YMAX);
            if (finalPolygon.length < 3 ||
                Math.abs(getPlanarRingArea(finalPolygon)) < EPS) return;
            var id = pieces.length;
            pieces.push({
              id: id,
              key: getRasterPieceKey(
                facet.id, sectorData.sector, oobKey, folded, wrap),
              facet: facet.id,
              sector: sectorData.sector,
              oobKey: oobKey,
              folded: folded,
              wrap: wrap,
              boundary: finalPolygon.concat([finalPolygon[0].concat()])
            });
          });
        });
      });
    });
  });
  return pieces;
}

function getRawFacetSectorBoundaries(facets, facet) {
  var corners = facets.filter(function(o) {
    return o.id != facet.id;
  }).map(function(o) {
    var v = radiansToVector(o.lon, o.lat);
    return vectorToRadians([-v[0], -v[1], -v[2]]);
  });
  corners.sort(function(a, b) {
    return obliquifySpherical(a[1], a[0], facet)[1] -
      obliquifySpherical(b[1], b[0], facet)[1];
  });
  var samples = [];
  for (var i = 0; i < corners.length; i++) {
    var edge = interpolateSphericalRadians(
      corners[i], corners[(i + 1) % corners.length], 0.05 * D2R);
    for (var j = 0; j < edge.length - 1; j++) {
      var p = edge[j];
      var q = projectFacetRaw(p[0], p[1], facet);
      samples.push({
        sector: q.sector,
        point: [q.x, q.y],
        spherical: p.concat()
      });
    }
  }
  return [0, 1, 2].map(function(sector) {
    var run = getLongestCircularSectorRun(samples, sector);
    var middle = getFarthestSphericalSample(
      run, [facet.lon, facet.lat]);
    return {
      facet: facet.id,
      sector: sector,
      sphericalBoundary: [
        [facet.lon, facet.lat],
        run[0].spherical,
        middle.spherical,
        run[run.length - 1].spherical,
        [facet.lon, facet.lat]
      ],
      boundary: [[facet.x, facet.y]].concat(run.map(function(o) {
        return o.point;
      }))
    };
  });
}

function getFarthestSphericalSample(samples, center) {
  var centerVector = radiansToVector(center[0], center[1]);
  var best = samples[0];
  var minDot = Infinity;
  samples.forEach(function(sample) {
    var v = radiansToVector(sample.spherical[0], sample.spherical[1]);
    var d = dot(centerVector, v);
    if (d < minDot) {
      minDot = d;
      best = sample;
    }
  });
  return best;
}

function getLongestCircularSectorRun(samples, sector) {
  var runs = [];
  var run = [];
  for (var i = 0; i < samples.length * 2; i++) {
    var sample = samples[i % samples.length];
    if (sample.sector == sector) {
      run.push(sample);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  runs.sort(function(a, b) { return b.length - a.length; });
  run = runs[0] || [];
  if (run.length > samples.length) run = run.slice(0, samples.length);
  return run;
}

function applyRasterPieceLayout(raw, facet, piece) {
  var p = applyOobTransform([raw.x, raw.y], facet, piece.oobKey);
  p = applyFoldTransform(p, piece.folded);
  return [
    p[0] + LAYOUT_SHIFT + piece.wrap * 2 * BLOCK_HEIGHT - BLOCK_HEIGHT,
    p[1] + 1.5
  ];
}

function clipRasterPiecePolygon(vertices, facet, piece) {
  var polygon = clipRasterOobPolygon(vertices, piece.oobKey);
  polygon = polygon.map(function(vertex) {
    var p = applyOobTransform([vertex.x, vertex.y], facet, piece.oobKey);
    return copyRasterVertex(vertex, p[0], p[1]);
  });
  polygon = clipRasterPolygonAxis(
    polygon, 'x', 0, piece.folded == 0);
  polygon = polygon.map(function(vertex) {
    var p = applyFoldTransform([vertex.x, vertex.y], piece.folded);
    return copyRasterVertex(vertex, p[0], p[1]);
  });
  polygon = polygon.map(function(vertex) {
    return copyRasterVertex(
      vertex,
      vertex.x + LAYOUT_SHIFT +
        piece.wrap * 2 * BLOCK_HEIGHT - BLOCK_HEIGHT,
      vertex.y + 1.5
    );
  });
  polygon = clipRasterPolygonAxis(polygon, 'x', XMIN, true);
  polygon = clipRasterPolygonAxis(polygon, 'x', XMAX, false);
  polygon = clipRasterPolygonAxis(polygon, 'y', YMIN, true);
  polygon = clipRasterPolygonAxis(polygon, 'y', YMAX, false);
  polygon.forEach(function(vertex) {
    vertex.x *= EDGE_SCALE;
    vertex.y *= EDGE_SCALE;
  });
  return polygon;
}

function clipRasterOobPolygon(polygon, oobKey) {
  if (oobKey == 'xpos') {
    return clipRasterPolygonAxis(polygon, 'x', 3, true);
  }
  if (oobKey == 'xneg') {
    return clipRasterPolygonAxis(polygon, 'x', -3, false);
  }
  if (oobKey == 'ypos' || oobKey == 'yneg') {
    polygon = clipRasterPolygonAxis(polygon, 'x', -3, true);
    polygon = clipRasterPolygonAxis(polygon, 'x', 3, false);
    return clipRasterPolygonAxis(
      polygon, 'y', oobKey == 'ypos' ? SQRT3 : -SQRT3,
      oobKey == 'ypos');
  }
  polygon = clipRasterPolygonAxis(polygon, 'x', -3, true);
  polygon = clipRasterPolygonAxis(polygon, 'x', 3, false);
  polygon = clipRasterPolygonAxis(polygon, 'y', -SQRT3, true);
  return clipRasterPolygonAxis(polygon, 'y', SQRT3, false);
}

function clipRasterPolygonAxis(polygon, axis, value, keepGreater) {
  var output = [];
  if (polygon.length === 0) return output;
  var a = polygon[polygon.length - 1];
  var aInside = keepGreater ?
    a[axis] >= value - EPS : a[axis] <= value + EPS;
  polygon.forEach(function(b) {
    var bInside = keepGreater ?
      b[axis] >= value - EPS : b[axis] <= value + EPS;
    if (aInside != bInside) {
      var t = (value - a[axis]) / (b[axis] - a[axis]);
      var vertex = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        sx: a.sx + (b.sx - a.sx) * t,
        sy: a.sy + (b.sy - a.sy) * t,
        lon: a.lon + (b.lon - a.lon) * t,
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

function applyOobTransform(p, facet, oobKey) {
  if (oobKey == 'xpos' || oobKey == 'xneg') {
    return [2 * facet.x - p[0], -p[1]];
  }
  if (oobKey == 'ypos') {
    return [-p[0], BLOCK_HEIGHT - p[1]];
  }
  if (oobKey == 'yneg') {
    return [-p[0], -BLOCK_HEIGHT - p[1]];
  }
  return p.concat();
}

function applyFoldTransform(p, folded) {
  return folded ? [BLOCK_HEIGHT - p[1], p[0]] : [p[1], -p[0]];
}

function clipOobPolygon(polygon, oobKey) {
  if (oobKey == 'xpos') return clipPolygonAxis(polygon, 0, 3, true);
  if (oobKey == 'xneg') return clipPolygonAxis(polygon, 0, -3, false);
  if (oobKey == 'ypos') {
    return clipPolygonAxis(
      clipPolygonAxis(
        clipPolygonAxis(polygon, 0, -3, true), 0, 3, false),
      1, SQRT3, true);
  }
  if (oobKey == 'yneg') {
    return clipPolygonAxis(
      clipPolygonAxis(
        clipPolygonAxis(polygon, 0, -3, true), 0, 3, false),
      1, -SQRT3, false);
  }
  return clipRectangle(polygon, -3, -SQRT3, 3, SQRT3);
}

function clipRectangle(polygon, xmin, ymin, xmax, ymax) {
  polygon = clipPolygonAxis(polygon, 0, xmin, true);
  polygon = clipPolygonAxis(polygon, 0, xmax, false);
  polygon = clipPolygonAxis(polygon, 1, ymin, true);
  return clipPolygonAxis(polygon, 1, ymax, false);
}

function clipPolygonAxis(polygon, axis, value, keepGreater) {
  var output = [];
  if (polygon.length === 0) return output;
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

function interpolateSphericalRadians(a, b, interval) {
  var av = radiansToVector(a[0], a[1]);
  var bv = radiansToVector(b[0], b[1]);
  var angle = Math.acos(clamp(dot(av, bv), -1, 1));
  var count = Math.max(1, Math.ceil(angle / interval));
  var sinAngle = Math.sin(angle);
  var points = [];
  for (var i = 0; i <= count; i++) {
    var t = i / count;
    var ka = Math.sin((1 - t) * angle) / sinAngle;
    var kb = Math.sin(t * angle) / sinAngle;
    points.push(vectorToRadians(normalizeVector([
      av[0] * ka + bv[0] * kb,
      av[1] * ka + bv[1] * kb,
      av[2] * ka + bv[2] * kb
    ])));
  }
  return points;
}

function vectorToRadians(p) {
  return [
    Math.atan2(p[1], p[0]),
    Math.asin(clamp(p[2], -1, 1))
  ];
}

function getPlanarRingArea(ring) {
  var area = 0;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

function getRasterPieceKey(facet, sector, oobKey, folded, wrap) {
  return [facet, sector, oobKey, folded, wrap].join(':');
}

function projectCanonical(lam, phi, facets) {
  var facet = findForwardFacet(lam, phi, facets);
  var state = projectFacetRaw(lam, phi, facet);
  return applyConditionalLayout(state, facet);
}

function projectFacetRaw(lam, phi, facet, forcedSector) {
  var relative = obliquifySpherical(phi, lam, facet);
  var sector = forcedSector == null ?
    Math.floor((relative[1] + Math.PI / 3) / (2 * Math.PI / 3)) :
    forcedSector == 2 ? -1 : forcedSector;
  var base = sector * 2 * Math.PI / 3;
  var polar = narukawaFaceForward(relative[1] - base, relative[0]);
  var angle = polar[1] + facet.rotation + base / 2;
  var x = polar[0] * Math.cos(angle) + facet.x;
  var y = polar[0] * Math.sin(angle) + facet.y;
  return {
    x: x,
    y: y,
    facet: facet.id,
    sector: mod(sector, 3)
  };
}

function applyConditionalLayout(raw, facet) {
  var x = raw.x;
  var y = raw.y;
  var oob = 0;
  var oobKey = 'normal';
  var folded = 0;
  var wrap = 0;

  if (Math.abs(x) > 3 + EPS) {
    oobKey = x > 0 ? 'xpos' : 'xneg';
    x = 2 * facet.x - x;
    y = -y;
    oob = 1;
  } else if (Math.abs(y) > SQRT3 + EPS) {
    oobKey = y > 0 ? 'ypos' : 'yneg';
    x = -x;
    y = BLOCK_HEIGHT * Math.sign(y) - y;
    oob = 2;
  }

  var qx = y;
  var qy = -x;
  if (qy > EPS) {
    qx = BLOCK_HEIGHT - qx;
    qy = -qy;
    folded = 1;
  }
  qx += LAYOUT_SHIFT;
  if (qx < 0) {
    qx += 2 * BLOCK_HEIGHT;
    wrap = 1;
  }
  x = qx - BLOCK_HEIGHT;
  y = qy + 1.5;
  x = clamp(x, XMIN, XMAX);
  y = clamp(y, YMIN, YMAX);
  return {
    x: x,
    y: y,
    facet: raw.facet,
    sector: raw.sector,
    oob: oob,
    oobKey: oobKey,
    folded: folded,
    wrap: wrap
  };
}

function findForwardFacet(lam, phi, facets) {
  var best = null;
  var bestLat = -Infinity;
  for (var i = 0; i < 4; i++) {
    var facet = facets[i];
    var relative = obliquifySpherical(phi, lam, facet);
    if (relative[0] > bestLat) {
      bestLat = relative[0];
      best = facet;
    }
  }
  return best;
}

function narukawaFaceForward(lam, phi) {
  var a = lam - Math.asin(Math.sin(lam) / SQRT3);
  var theta = Math.atan(2 * SQRT3 / Math.PI * a);
  var denominator = 2 + SQRT2 * Math.tan(phi);
  var q = denominator > 0 ? (2 + Math.cos(lam)) / denominator : 0;
  var r = q * SQRT3 / Math.cos(theta);
  return [r, theta];
}

function narukawaFaceInverse(r, theta) {
  var target = Math.tan(theta) * Math.PI / (2 * SQRT3);
  var lo = -Math.PI / 3;
  var hi = Math.PI / 3;
  var lam;
  for (var i = 0; i < 55; i++) {
    lam = (lo + hi) / 2;
    var a = lam - Math.asin(Math.sin(lam) / SQRT3);
    if (a < target) lo = lam;
    else hi = lam;
  }
  lam = (lo + hi) / 2;
  var q = r * Math.cos(theta) / SQRT3;
  var phi = q < EPS ? HALF_PI :
    Math.atan(((2 + Math.cos(lam)) / q - 2) / SQRT2);
  return [phi, lam];
}

function invertLayout(x, y, facets) {
  var qx = x + BLOCK_HEIGHT;
  var qy = y - 1.5;
  var normalizedX = (qx - LAYOUT_SHIFT) / BLOCK_HEIGHT;
  if (normalizedX > 1.5) normalizedX -= 2;
  if (normalizedX > 0.5) {
    normalizedX = 1 - normalizedX;
    qy *= -1;
  }
  x = -qy;
  y = normalizedX * BLOCK_HEIGHT;

  var facet = findInverseFacet(x, y, facets);
  var dx = x - facet.x;
  var dy = y - facet.y;
  var r = Math.hypot(dx, dy);
  var theta = normalizeRadians(Math.atan2(dy, dx) - facet.rotation);
  var base = Math.floor((theta + Math.PI / 6) / (Math.PI / 3)) *
    Math.PI / 3;
  var relative = narukawaFaceInverse(r, theta - base);
  relative[1] += base * 2;
  var p = deobliquifySpherical(relative[0], relative[1], facet);
  return [p[1], p[0]];
}

function findInverseFacet(x, y, facets) {
  var best = null;
  var minDistance = Infinity;
  facets.forEach(function(facet) {
    var d = Math.hypot(x - facet.x, y - facet.y);
    if (d < minDistance) {
      minDistance = d;
      best = facet;
    }
  });
  return best;
}

function createPublishedOrientation() {
  // Match the D3 Imago arrangement: the third published vertex is the
  // canonical southern vertex at longitude zero.
  var north = latLonToVector(GEOGRAPHIC_VERTICES[0]);
  var south = latLonToVector(GEOGRAPHIC_VERTICES[2]);
  var tangent = normalizeVector(subtract(
    south,
    multiply(north, dot(south, north))
  ));
  var x = tangent;
  var y = cross(north, tangent);
  return {x: x, y: y, z: north};
}

function toCanonical(lam, phi, orientation) {
  var v = radiansToVector(lam, phi);
  return [
    Math.atan2(dot(v, orientation.y), dot(v, orientation.x)),
    Math.asin(clamp(dot(v, orientation.z), -1, 1))
  ];
}

function fromCanonical(lam, phi, orientation) {
  var v = radiansToVector(lam, phi);
  var p = [
    orientation.x[0] * v[0] + orientation.y[0] * v[1] + orientation.z[0] * v[2],
    orientation.x[1] * v[0] + orientation.y[1] * v[1] + orientation.z[1] * v[2],
    orientation.x[2] * v[0] + orientation.y[2] * v[1] + orientation.z[2] * v[2]
  ];
  return [Math.atan2(p[1], p[0]), Math.asin(clamp(p[2], -1, 1))];
}

// Adapted from Justin Kunimune's Imago implementation.
function obliquifySpherical(lat, lon, pole) {
  var lat0 = pole.lat;
  var lon0 = pole.lon;
  var theta0 = pole.meridian;
  var lat1;
  var lon1;
  if (Math.abs(lat0 - HALF_PI) < EPS) {
    lat1 = lat;
    lon1 = lon - lon0;
  } else {
    lat1 = Math.asin(clamp(
      Math.sin(lat0) * Math.sin(lat) +
      Math.cos(lat0) * Math.cos(lat) * Math.cos(lon0 - lon),
      -1,
      1
    ));
    var denominator = Math.cos(lat1);
    var value = denominator < EPS ? 1 :
      (Math.cos(lat0) * Math.sin(lat) -
        Math.sin(lat0) * Math.cos(lat) * Math.cos(lon0 - lon)) /
      denominator;
    lon1 = Math.acos(clamp(value, -1, 1)) - Math.PI;
    if (Math.sin(lon - lon0) > 0) lon1 = -lon1;
  }
  return [lat1, normalizeRadians(lon1 - theta0)];
}

function deobliquifySpherical(lat, lon, pole) {
  var lat0 = pole.lat;
  var lon0 = pole.lon;
  lon += pole.meridian;
  var latOut = Math.asin(clamp(
    Math.sin(lat0) * Math.sin(lat) -
    Math.cos(lat0) * Math.cos(lon) * Math.cos(lat),
    -1,
    1
  ));
  var lonOut;
  if (Math.abs(lat0 - HALF_PI) < EPS) {
    lonOut = lon + lon0;
  } else {
    var value = Math.sin(lat) / Math.cos(lat0) / Math.cos(latOut) -
      Math.tan(lat0) * Math.tan(latOut);
    if (Math.sin(lon) > 0) lonOut = lon0 + Math.acos(clamp(value, -1, 1));
    else lonOut = lon0 - Math.acos(clamp(value, -1, 1));
  }
  return [latOut, normalizeRadians(lonOut)];
}

function createCutPaths(inverse, lon0) {
  // The rectangular edges become moderately curved geographic seams. Sampling
  // at about 0.03 degrees prevents straight mask chords from missing crossings.
  var n = 6000;
  var epsilon = 1e-8;
  var edges = [
    [[XMIN + epsilon, YMIN], [XMIN + epsilon, YMAX]],
    [[XMIN, YMAX - epsilon], [XMAX, YMAX - epsilon]],
    [[XMIN, YMIN + epsilon], [XMAX, YMIN + epsilon]]
  ];
  var paths = edges.reduce(function(memo, edge) {
    var path = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var x = edge[0][0] + (edge[1][0] - edge[0][0]) * t;
      var y = edge[0][1] + (edge[1][1] - edge[0][1]) * t;
      var p = inverse(x * EDGE_SCALE, y * EDGE_SCALE);
      path.push([
        normalizeLongitude(p[0] * R2D + lon0),
        p[1] * R2D
      ]);
    }
    return memo.concat(splitPathAtAntimeridian(path));
  }, []);
  return paths.map(function(part) {
    part.mask_width = 4e-5;
    return part;
  });
}

function splitPathAtAntimeridian(path) {
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

function encodeRegion(state) {
  return ((((state.facet * 3 + state.sector) * 3 + state.oob) * 2 +
    state.folded) * 2 + state.wrap);
}

function createRegionIndex() {
  var regions = [];
  for (var i = 0; i < 144; i++) {
    regions.push({id: i});
  }
  return regions;
}

function latLonToVector(p) {
  return radiansToVector(p[1] * D2R, p[0] * D2R);
}

function radiansToVector(lam, phi) {
  var cosPhi = Math.cos(phi);
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function multiply(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function normalizeVector(a) {
  var k = 1 / Math.hypot(a[0], a[1], a[2]);
  return multiply(a, k);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mod(a, n) {
  return (a % n + n) % n;
}

function normalizeRadians(lam) {
  while (lam > Math.PI) lam -= 2 * Math.PI;
  while (lam < -Math.PI) lam += 2 * Math.PI;
  return lam;
}

function normalizeLongitude(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
