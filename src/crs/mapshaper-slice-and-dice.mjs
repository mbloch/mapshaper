/*
 * Vertex-oriented great-circle "slice-and-dice" projection.
 *
 * Based on van Leeuwen and Strebe (2006), with the vector formulation
 * described by Hall et al. (2020) and implemented independently by DGGAL.
 * https://doi.org/10.1559/152304006779500687
 * https://doi.org/10.3390/ijgi9050315
 */

import {rotateSphericalRadians} from './mapshaper-polyhedral-projection';

var D2R = Math.PI / 180;
var EPS = 1e-12;

// Create a symmetric equal-area projector for a regular spherical polygon.
// Each polygon vertex is the radial vertex of two triangular slices bounded
// by the polygon center and adjacent great-circle edge midpoints.
export function createSliceAndDiceProjector(coords, options) {
  options = options || {};
  var vectors = coords.map(degreesToVector);
  var centerVector = normalizeVector(vectors.reduce(addVectors, [0, 0, 0]));
  var center = vectorToDegrees(centerVector);
  var planarProject = createGnomonicProjector(options.planarCenter || center);
  var planar = coords.map(function(p) {
    return planarProject(p[0] * D2R, p[1] * D2R);
  });
  var planarCenter = averagePoints(planar);
  var slices = [];

  vectors.forEach(function(q, i) {
    var prev = (i + vectors.length - 1) % vectors.length;
    var next = (i + 1) % vectors.length;
    var midPrev = normalizeVector(addVectors(vectors[prev], q));
    var midNext = normalizeVector(addVectors(q, vectors[next]));
    var planarMidPrev = midpoint(planar[prev], planar[i]);
    var planarMidNext = midpoint(planar[i], planar[next]);
    slices.push(createSlice(
      q, midNext, centerVector,
      planar[i], planarMidNext, planarCenter,
      slices.length
    ));
    slices.push(createSlice(
      q, centerVector, midPrev,
      planar[i], planarCenter, planarMidPrev,
      slices.length
    ));
  });

  project.findRegion = function(lam, phi) {
    return findSlice(radiansToVector(lam, phi)).id;
  };
  project.planarArea = Math.abs(getPlanarArea(planar));
  project.sphericalArea = slices.reduce(function(sum, slice) {
    return sum + Math.abs(slice.area);
  }, 0);
  return project;

  function project(lam, phi) {
    var p = radiansToVector(lam, phi);
    var slice = findSlice(p);
    return projectSlice(slice, p);
  }

  function findSlice(p) {
    var best = slices[0];
    var bestDot = -Infinity;
    for (var i = 0; i < slices.length; i++) {
      if (containsVector(slices[i], p)) return slices[i];
      var d = dot(slices[i].center, p);
      if (d > bestDot) {
        bestDot = d;
        best = slices[i];
      }
    }
    // Boundary roundoff can put a point a few ulps outside every slice.
    return best;
  }
}

export function createGnomonicProjector(center) {
  var rotation = [-center[0], -center[1], 0];
  return function(lam, phi) {
    var p = rotateSphericalRadians(lam, phi, rotation);
    var cosPhi = Math.cos(p[1]);
    var k = cosPhi * Math.cos(p[0]);
    return [
      cosPhi * Math.sin(p[0]) / k,
      -Math.sin(p[1]) / k
    ];
  };
}

function createSlice(q, u, v, qp, up, vp, id) {
  var vertices = [q, u, v];
  var edges = [];
  for (var i = 0; i < 3; i++) {
    var a = vertices[i];
    var b = vertices[(i + 1) % 3];
    var n = cross(a, b);
    var inside = vertices[(i + 2) % 3];
    if (dot(n, inside) < 0) n = scaleVector(n, -1);
    edges.push(n);
  }
  return {
    id: id,
    q: q,
    u: u,
    v: v,
    qp: qp,
    up: up,
    vp: vp,
    area: sphericalArea(q, u, v),
    edges: edges,
    center: normalizeVector(addVectors(addVectors(q, u), v))
  };
}

function projectSlice(slice, p) {
  var q = slice.q;
  var qp = slice.qp;
  var qpDistance = chordDistance(q, p);
  if (qpDistance < EPS) return qp.concat();

  var radialNormal = cross(q, p);
  var edgeNormal = cross(slice.u, slice.v);
  var d = normalizeVector(cross(radialNormal, edgeNormal));
  var edgeCenter = normalizeVector(addVectors(slice.u, slice.v));
  if (dot(d, edgeCenter) < 0) d = scaleVector(d, -1);

  var denominator = chordDistance(q, d);
  if (denominator < EPS) return qp.concat();
  var h = clamp(qpDistance / denominator, 0, 1);
  var s = clamp(
    sphericalArea(q, slice.u, d) / slice.area,
    0,
    1
  );
  var dp = [
    slice.up[0] + s * (slice.vp[0] - slice.up[0]),
    slice.up[1] + s * (slice.vp[1] - slice.up[1])
  ];
  return [
    qp[0] + h * (dp[0] - qp[0]),
    qp[1] + h * (dp[1] - qp[1])
  ];
}

function containsVector(slice, p) {
  for (var i = 0; i < slice.edges.length; i++) {
    if (dot(slice.edges[i], p) < -1e-11) return false;
  }
  return true;
}

function sphericalArea(a, b, c) {
  var det = dot(a, cross(b, c));
  var denominator = 1 + dot(a, b) + dot(b, c) + dot(c, a);
  return 2 * Math.atan2(det, denominator);
}

function getPlanarArea(points) {
  var sum = 0;
  for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return sum / 2;
}

function averagePoints(points) {
  var sum = points.reduce(function(memo, p) {
    memo[0] += p[0];
    memo[1] += p[1];
    return memo;
  }, [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function degreesToVector(p) {
  return radiansToVector(p[0] * D2R, p[1] * D2R);
}

function radiansToVector(lam, phi) {
  var cosPhi = Math.cos(phi);
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)];
}

function vectorToDegrees(p) {
  return [
    Math.atan2(p[1], p[0]) / D2R,
    Math.asin(clamp(p[2], -1, 1)) / D2R
  ];
}

function chordDistance(a, b) {
  var x = a[0] - b[0];
  var y = a[1] - b[1];
  var z = a[2] - b[2];
  return Math.sqrt(x * x + y * y + z * z);
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

function addVectors(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVector(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function normalizeVector(p) {
  var k = 1 / Math.sqrt(dot(p, p));
  return scaleVector(p, k);
}

function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}
