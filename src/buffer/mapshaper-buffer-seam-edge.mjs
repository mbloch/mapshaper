import { bearingDegrees2D } from '../geom/mapshaper-geodesic';

function getJoinAngle(direction1, direction2) {
  var delta = direction2 - direction1;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

// Ring-step distance from each vertex to the nearest concave vertex, in O(n).
export function minDistToConcaveOnRing(concave, n) {
  var dist = new Array(n);
  var d, i, j;
  for (j = 0; j < n; j++) dist[j] = n;
  d = n;
  for (i = 0; i < 2 * n; i++) {
    j = i % n;
    if (concave[j]) d = 0;
    else d++;
    if (d < dist[j]) dist[j] = d;
  }
  d = n;
  for (i = 2 * n - 1; i >= 0; i--) {
    j = i % n;
    if (concave[j]) d = 0;
    else d++;
    if (d < dist[j]) dist[j] = d;
  }
  return dist;
}

// Brute-force reference for tests.
export function minDistToConcaveOnRingBrute(concave, n) {
  var dist = new Array(n);
  var i, j, d, best;
  for (i = 0; i < n; i++) {
    best = n;
    for (j = 0; j < n; j++) {
      if (!concave[j]) continue;
      d = Math.abs(i - j);
      if (d > n - d) d = n - d;
      if (d < best) best = d;
    }
    dist[i] = best;
  }
  return dist;
}

// Pick the index of the edge (vk -> vk+1) whose midpoint makes the best offset
// seam: an edge with two convex endpoints that lies as far as possible (in ring
// steps) from any concave corner, breaking ties toward the longest such edge.
export function chooseSeamEdge(verts) {
  var n = verts.length - 1; // distinct vertices
  if (n < 3) return 0;
  var concave = [];
  var anyConcave = false;
  var bPrev = bearingDegrees2D(verts[n - 1][0], verts[n - 1][1], verts[0][0], verts[0][1]);
  var i, ni, b, ja;
  for (i = 0; i < n; i++) {
    ni = (i + 1) % n;
    b = bearingDegrees2D(verts[i][0], verts[i][1], verts[ni][0], verts[ni][1]);
    ja = getJoinAngle(bPrev, b);
    concave[i] = ja < 0;
    if (concave[i]) anyConcave = true;
    bPrev = b;
  }
  if (!anyConcave) return 0;
  var minDist = minDistToConcaveOnRing(concave, n);
  var bestK = -1, bestScore = -1, bestLen = -1;
  var fallbackK = 0, fallbackLen = -1;
  var k, len, score, a, c;
  for (k = 0; k < n; k++) {
    a = verts[k];
    c = verts[(k + 1) % n];
    len = Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]);
    if (len > fallbackLen) { fallbackLen = len; fallbackK = k; }
    if (concave[k] || concave[(k + 1) % n]) continue;
    score = Math.min(minDist[k], minDist[(k + 1) % n]);
    if (score > bestScore || (score === bestScore && len > bestLen)) {
      bestScore = score; bestLen = len; bestK = k;
    }
  }
  return bestK >= 0 ? bestK : fallbackK;
}
