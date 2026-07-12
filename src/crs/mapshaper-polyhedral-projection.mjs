/*
 * Polyhedral unfolding code adapted from d3-geo-polygon.
 *
 * Copyright 2017-2024 Mike Bostock
 * ISC License: https://github.com/d3/d3-geo-polygon/blob/main/LICENSE
 */

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var EPS = 1e-12;

// Build a forward-only spherical polyhedral projection.
//
// config.faces contains spherical polygons in degrees. config.parents defines
// a spanning tree of attached faces. faceProjector(face) returns a local
// projection accepting radians and returning planar coordinates.
export function createPolyhedralProjection(config) {
  var faces = config.faces.map(function(coords, i) {
    return createFace(coords, i, config.faceSites && config.faceSites[i]);
  });
  var parents = config.parents;
  var attachedPairs = new Set();
  var faceProjector = config.faceProjector;

  faces.forEach(function(face) {
    face.project = faceProjector(face);
  });

  faces.forEach(function(face) {
    initFaceTransform(face.id);
  });

  function initFaceTransform(faceId) {
    var parentId = parents[faceId];
    var face = faces[faceId];
    if (face.transform) return;
    if (parentId < 0) {
      face.transform = identityMatrix();
      return;
    }
    initFaceTransform(parentId);
    var parent = faces[parentId];
    var shared = findSharedEdge(face.coords, parent.coords);
    if (!shared) {
      throw new Error('Invalid polyhedral face tree');
    }
    var childEdge = shared.map(function(p) {
      return face.project(p[0] * D2R, p[1] * D2R);
    });
    var parentEdge = shared.map(function(p) {
      return parent.project(p[0] * D2R, p[1] * D2R);
    });
    face.transform = multiplyMatrices(
      parent.transform,
      getEdgeTransform(parentEdge, childEdge)
    );
    attachedPairs.add(pairKey(faceId, parentId));
  }

  var rootEdge = findLongestEdge(faces[0].coords);
  var rootPlanarEdge = rootEdge.map(function(p) {
    return faces[0].project(p[0] * D2R, p[1] * D2R);
  });
  var sphericalEdgeLength = angularDistance(rootEdge[0], rootEdge[1]);
  var planarEdgeLength = distance2D(rootPlanarEdge[0], rootPlanarEdge[1]);
  var scale = sphericalEdgeLength / planarEdgeLength;
  var planarAngle = (config.angle || 0) * D2R;
  var edgeIndex = indexEdges(faces, attachedPairs);
  var outline = buildOutline(faces, attachedPairs).map(function(ring) {
    return ring.map(transformOutputPoint);
  });
  var bounds = getBounds(outline);
  var centerX = (bounds[0] + bounds[2]) / 2;
  var centerY = (bounds[1] + bounds[3]) / 2;

  // Centering is calculated after scale and planar rotation.
  outline.forEach(function(ring) {
    ring.forEach(function(p) {
      p[0] -= centerX;
      p[1] -= centerY;
    });
  });

  return {
    faces: faces,
    outline: outline,
    forward: forward,
    findFace: findFace,
    findTransitionRegion: findTransitionRegion,
    getTopology: getTopology
  };

  function forward(lam, phi) {
    var rotated = rotateRadians(
      lam,
      phi,
      config.rotation[0] * D2R,
      config.rotation[1] * D2R,
      config.rotation[2] * D2R
    );
    var face = findFaceRotated(rotated[0], rotated[1]);
    if (!face) return null;
    var p = face.project(rotated[0], rotated[1]);
    p = applyMatrix(face.transform, p);
    p = transformOutputPoint(p);
    p[0] -= centerX;
    p[1] -= centerY;
    return p;
  }

  function findFace(lam, phi) {
    var rotated = rotateRadians(
      lam,
      phi,
      config.rotation[0] * D2R,
      config.rotation[1] * D2R,
      config.rotation[2] * D2R
    );
    var face = findFaceRotated(rotated[0], rotated[1]);
    return face ? face.id : -1;
  }

  function findTransitionRegion(lam, phi) {
    var rotated = rotateRadians(
      lam,
      phi,
      config.rotation[0] * D2R,
      config.rotation[1] * D2R,
      config.rotation[2] * D2R
    );
    var face = findFaceRotated(rotated[0], rotated[1]);
    var region;
    if (!face) return '-1';
    region = face.project.findRegion ?
      face.project.findRegion(rotated[0], rotated[1]) :
      0;
    return face.id + ':' + region;
  }

  function findFaceRotated(lam, phi) {
    var faceId;
    if (config.findFace) {
      faceId = config.findFace(lam, phi);
      return faceId >= 0 ? faces[faceId] : null;
    }
    var p = radiansToVector(lam, phi);
    for (var i = 0; i < faces.length; i++) {
      if (faceContainsVector(faces[i], p)) return faces[i];
    }
    return null;
  }

  function transformOutputPoint(p) {
    var x = p[0] * scale;
    // Local unfolding uses screen-oriented y coordinates to match the D3
    // Airocean face layout; return conventional projected coordinates (y up).
    var y = -p[1] * scale;
    if (planarAngle) {
      return [
        x * Math.cos(planarAngle) - y * Math.sin(planarAngle),
        x * Math.sin(planarAngle) + y * Math.cos(planarAngle)
      ];
    }
    return [x, y];
  }

  function getTopology(lon0) {
    var seams = edgeIndex.map(function(edge) {
      var endpoints = edge.points.map(function(p) {
        var q = rotateRadians(
          p[0] * D2R,
          p[1] * D2R,
          config.rotation[0] * D2R,
          config.rotation[1] * D2R,
          config.rotation[2] * D2R,
          true
        );
        return [normalizeLongitude(q[0] * R2D + lon0), q[1] * R2D];
      });
      var paths = splitPathAtAntimeridian(
        interpolateGreatCircle(endpoints[0], endpoints[1], 0.05)
      );
      paths.forEach(function(path) {
        // The mask must be wider than the tiny chord error between samples.
        path.mask_width = 4e-5;
      });
      return {
        type: edge.attached ? 'attached' : 'cut',
        faces: edge.faces,
        paths: paths
      };
    });
    var regionPairs = new Map();
    edgeIndex.forEach(function(edge) {
      if (edge.faces.length == 2) {
        regionPairs.set(pairKey(edge.faces[0], edge.faces[1]), edge.attached);
      }
    });
    return {
      regions: faces.map(function(face) {
        return {id: face.id};
      }),
      seams: seams,
      findRegion: function(lon, lat) {
        var lam = normalizeLongitude(lon - lon0) * D2R;
        return findFace(lam, lat * D2R);
      },
      findTransitionRegion: function(lon, lat) {
        var lam = normalizeLongitude(lon - lon0) * D2R;
        return findTransitionRegion(lam, lat * D2R);
      },
      regionsAreAttached: function(a, b) {
        return regionPairs.get(pairKey(a, b)) === true;
      },
      outline: outline.map(function(ring) {
        return ring.map(function(p) {
          return p.concat();
        });
      })
    };
  }
}

export function rotateSphericalRadians(lam, phi, rotation, invert) {
  return rotateRadians(
    lam,
    phi,
    (rotation[0] || 0) * D2R,
    (rotation[1] || 0) * D2R,
    (rotation[2] || 0) * D2R,
    invert
  );
}

function createFace(coords, id, site) {
  var vectors = coords.map(function(p) {
    return degreesToVector(p[0], p[1]);
  });
  var inside = normalizeVector(vectors.reduce(function(sum, p) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
    return sum;
  }, [0, 0, 0]));
  var edges = [];
  for (var i = 0; i < vectors.length; i++) {
    var a = vectors[i];
    var b = vectors[(i + 1) % vectors.length];
    var normal = cross(a, b);
    edges.push({
      normal: normal,
      sign: dot(normal, inside) < 0 ? -1 : 1
    });
  }
  return {
    id: id,
    coords: coords,
    vectors: vectors,
    edges: edges,
    centroid: site || vectorToDegrees(inside)
  };
}

function faceContainsVector(face, p) {
  for (var i = 0; i < face.edges.length; i++) {
    var edge = face.edges[i];
    if (dot(edge.normal, p) * edge.sign < -EPS) return false;
  }
  return true;
}

function indexEdges(faces, attachedPairs) {
  var index = new Map();
  faces.forEach(function(face) {
    for (var i = 0; i < face.coords.length; i++) {
      var a = face.coords[i];
      var b = face.coords[(i + 1) % face.coords.length];
      var key = edgeKey(a, b);
      var edge = index.get(key);
      if (!edge) {
        edge = {points: [a, b], faces: []};
        index.set(key, edge);
      }
      edge.faces.push(face.id);
    }
  });
  return Array.from(index.values()).map(function(edge) {
    edge.attached = edge.faces.length == 2 &&
      attachedPairs.has(pairKey(edge.faces[0], edge.faces[1]));
    return edge;
  });
}

function buildOutline(faces, attachedPairs) {
  var edges = [];
  faces.forEach(function(face) {
    for (var i = 0; i < face.coords.length; i++) {
      var a = face.coords[i];
      var b = face.coords[(i + 1) % face.coords.length];
      var adjacent = findAdjacentFace(faces, face.id, a, b);
      if (adjacent >= 0 && attachedPairs.has(pairKey(face.id, adjacent))) continue;
      edges.push([
        applyMatrix(face.transform, face.project(a[0] * D2R, a[1] * D2R)),
        applyMatrix(face.transform, face.project(b[0] * D2R, b[1] * D2R))
      ]);
    }
  });
  return connectEdges(edges);
}

function connectEdges(edges) {
  var unused = edges.concat();
  var rings = [];
  while (unused.length) {
    var edge = unused.pop();
    var ring = [edge[0], edge[1]];
    while (!pointsAlmostEqual(ring[0], ring[ring.length - 1])) {
      var last = ring[ring.length - 1];
      var found = -1;
      var next;
      for (var i = 0; i < unused.length; i++) {
        if (pointsAlmostEqual(last, unused[i][0])) {
          found = i;
          next = unused[i][1];
          break;
        }
        if (pointsAlmostEqual(last, unused[i][1])) {
          found = i;
          next = unused[i][0];
          break;
        }
      }
      if (found < 0) break;
      unused.splice(found, 1);
      ring.push(next);
    }
    if (ring.length > 3 && pointsAlmostEqual(ring[0], ring[ring.length - 1])) {
      ring[ring.length - 1] = ring[0].concat();
      rings.push(ring);
    }
  }
  return rings;
}

function findAdjacentFace(faces, faceId, a, b) {
  var key = edgeKey(a, b);
  for (var i = 0; i < faces.length; i++) {
    if (i == faceId) continue;
    var coords = faces[i].coords;
    for (var j = 0; j < coords.length; j++) {
      if (edgeKey(coords[j], coords[(j + 1) % coords.length]) == key) return i;
    }
  }
  return -1;
}

function findSharedEdge(a, b) {
  for (var i = 0; i < a.length; i++) {
    var p = a[i];
    for (var j = 0; j < b.length; j++) {
      var q = a[(i + 1) % a.length];
      var c = b[j];
      var d = b[(j + 1) % b.length];
      if (sameSphericalPoint(p, c) && sameSphericalPoint(q, d) ||
          sameSphericalPoint(p, d) && sameSphericalPoint(q, c)) {
        return [p, q];
      }
    }
  }
  return null;
}

function findLongestEdge(coords) {
  var longest = null;
  var max = -Infinity;
  for (var i = 0; i < coords.length; i++) {
    var edge = [coords[i], coords[(i + 1) % coords.length]];
    var length = angularDistance(edge[0], edge[1]);
    if (length > max) {
      longest = edge;
      max = length;
    }
  }
  return longest;
}

function getEdgeTransform(dest, src) {
  var ux = dest[1][0] - dest[0][0];
  var uy = dest[1][1] - dest[0][1];
  var vx = src[1][0] - src[0][0];
  var vy = src[1][1] - src[0][1];
  var scale = Math.sqrt((ux * ux + uy * uy) / (vx * vx + vy * vy));
  var angle = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  var cos = Math.cos(angle) * scale;
  var sin = Math.sin(angle) * scale;
  return [
    cos,
    sin,
    dest[0][0] - cos * src[0][0] - sin * src[0][1],
    -sin,
    cos,
    dest[0][1] + sin * src[0][0] - cos * src[0][1]
  ];
}

function identityMatrix() {
  return [1, 0, 0, 0, 1, 0];
}

function multiplyMatrices(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5]
  ];
}

function applyMatrix(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2],
    m[3] * p[0] + m[4] * p[1] + m[5]
  ];
}

function rotateRadians(lam, phi, deltaLam, deltaPhi, deltaGamma, invert) {
  if (invert) {
    var inv = rotatePhiGamma(lam, phi, deltaPhi, deltaGamma, true);
    return [normalizeRadians(inv[0] - deltaLam), inv[1]];
  }
  lam = normalizeRadians(lam + deltaLam);
  return rotatePhiGamma(lam, phi, deltaPhi, deltaGamma, false);
}

// Based on d3-geo spherical rotation (ISC license).
function rotatePhiGamma(lam, phi, deltaPhi, deltaGamma, invert) {
  var cosDeltaPhi = Math.cos(deltaPhi);
  var sinDeltaPhi = Math.sin(deltaPhi);
  var cosDeltaGamma = Math.cos(deltaGamma);
  var sinDeltaGamma = Math.sin(deltaGamma);
  var cosPhi = Math.cos(phi);
  var x = Math.cos(lam) * cosPhi;
  var y = Math.sin(lam) * cosPhi;
  var z = Math.sin(phi);
  var k;
  if (invert) {
    k = z * cosDeltaGamma - y * sinDeltaGamma;
    return [
      Math.atan2(y * cosDeltaGamma + z * sinDeltaGamma,
        x * cosDeltaPhi + k * sinDeltaPhi),
      Math.asin(clamp(k * cosDeltaPhi - x * sinDeltaPhi, -1, 1))
    ];
  }
  k = z * cosDeltaPhi + x * sinDeltaPhi;
  return [
    Math.atan2(y * cosDeltaGamma - k * sinDeltaGamma,
      x * cosDeltaPhi - z * sinDeltaPhi),
    Math.asin(clamp(k * cosDeltaGamma + y * sinDeltaGamma, -1, 1))
  ];
}

function interpolateGreatCircle(a, b, interval) {
  var av = degreesToVector(a[0], a[1]);
  var bv = degreesToVector(b[0], b[1]);
  var angle = Math.acos(clamp(dot(av, bv), -1, 1));
  var n = Math.max(1, Math.ceil(angle * R2D / interval));
  var sinAngle = Math.sin(angle);
  var points = [];
  for (var i = 0; i <= n; i++) {
    var t = i / n;
    var p;
    if (sinAngle < EPS) {
      p = av;
    } else {
      var ka = Math.sin((1 - t) * angle) / sinAngle;
      var kb = Math.sin(t * angle) / sinAngle;
      p = [
        av[0] * ka + bv[0] * kb,
        av[1] * ka + bv[1] * kb,
        av[2] * ka + bv[2] * kb
      ];
    }
    points.push(vectorToDegrees(normalizeVector(p)));
  }
  return points;
}

function splitPathAtAntimeridian(path) {
  var paths = [];
  var part = [path[0]];
  for (var i = 1; i < path.length; i++) {
    var a = path[i - 1];
    var b = path[i];
    if (Math.abs(a[0] - b[0]) > 180) {
      var bLon = b[0] + (b[0] < a[0] ? 360 : -360);
      var edgeLon = a[0] < 0 ? -180 : 180;
      var t = (edgeLon - a[0]) / (bLon - a[0]);
      var lat = a[1] + (b[1] - a[1]) * t;
      part.push([edgeLon, lat]);
      paths.push(part);
      part = [[-edgeLon, lat], b];
    } else {
      part.push(b);
    }
  }
  if (part.length > 1) paths.push(part);
  return paths;
}

function getBounds(rings) {
  var bounds = [Infinity, Infinity, -Infinity, -Infinity];
  rings.forEach(function(ring) {
    ring.forEach(function(p) {
      bounds[0] = Math.min(bounds[0], p[0]);
      bounds[1] = Math.min(bounds[1], p[1]);
      bounds[2] = Math.max(bounds[2], p[0]);
      bounds[3] = Math.max(bounds[3], p[1]);
    });
  });
  return bounds;
}

function angularDistance(a, b) {
  return Math.acos(clamp(dot(degreesToVector(a[0], a[1]),
    degreesToVector(b[0], b[1])), -1, 1));
}

function degreesToVector(lon, lat) {
  return radiansToVector(lon * D2R, lat * D2R);
}

function radiansToVector(lam, phi) {
  var cosPhi = Math.cos(phi);
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)];
}

function vectorToDegrees(p) {
  return [
    Math.atan2(p[1], p[0]) * R2D,
    Math.asin(clamp(p[2], -1, 1)) * R2D
  ];
}

function normalizeVector(p) {
  var k = 1 / Math.sqrt(dot(p, p));
  return [p[0] * k, p[1] * k, p[2] * k];
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

function distance2D(a, b) {
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function sameSphericalPoint(a, b) {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

function pointsAlmostEqual(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function pointKey(p) {
  return p[0].toFixed(12) + ',' + p[1].toFixed(12);
}

function edgeKey(a, b) {
  var ka = pointKey(a);
  var kb = pointKey(b);
  return ka < kb ? ka + '|' + kb : kb + '|' + ka;
}

function pairKey(a, b) {
  return a < b ? a + '~' + b : b + '~' + a;
}

function normalizeRadians(lam) {
  while (lam > Math.PI) lam -= Math.PI * 2;
  while (lam < -Math.PI) lam += Math.PI * 2;
  return lam;
}

function normalizeLongitude(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
