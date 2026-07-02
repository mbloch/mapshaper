import assert from 'assert';
import {
  minDistToConcaveOnRing,
  minDistToConcaveOnRingBrute,
  chooseSeamEdge
} from '../src/buffer/mapshaper-buffer-seam-edge';
import { bearingDegrees2D } from '../src/geom/mapshaper-geodesic';

function getJoinAngle(direction1, direction2) {
  var delta = direction2 - direction1;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function buildConcaveFromVerts(verts) {
  var n = verts.length - 1;
  var concave = new Array(n);
  var bPrev = bearingDegrees2D(verts[n - 1][0], verts[n - 1][1], verts[0][0], verts[0][1]);
  for (var i = 0; i < n; i++) {
    var ni = (i + 1) % n;
    var b = bearingDegrees2D(verts[i][0], verts[i][1], verts[ni][0], verts[ni][1]);
    concave[i] = getJoinAngle(bPrev, b) < 0;
    bPrev = b;
  }
  return concave;
}

function chooseSeamEdgeBrute(verts) {
  var n = verts.length - 1;
  if (n < 3) return 0;
  var concave = buildConcaveFromVerts(verts);
  var anyConcave = concave.some(Boolean);
  if (!anyConcave) return 0;
  var minDist = minDistToConcaveOnRingBrute(concave, n);
  var bestK = -1, bestScore = -1, bestLen = -1;
  var fallbackK = 0, fallbackLen = -1;
  for (var k = 0; k < n; k++) {
    var a = verts[k], c = verts[(k + 1) % n];
    var len = Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]);
    if (len > fallbackLen) { fallbackLen = len; fallbackK = k; }
    if (concave[k] || concave[(k + 1) % n]) continue;
    var score = Math.min(minDist[k], minDist[(k + 1) % n]);
    if (score > bestScore || (score === bestScore && len > bestLen)) {
      bestScore = score; bestLen = len; bestK = k;
    }
  }
  return bestK >= 0 ? bestK : fallbackK;
}

describe('mapshaper-buffer-seam-edge.js', function () {
  it('minDistToConcaveOnRing matches brute force on random flags', function () {
    for (var trial = 0; trial < 200; trial++) {
      var n = 3 + (trial % 500);
      var concave = [];
      for (var j = 0; j < n; j++) concave[j] = Math.random() < 0.15;
      if (!concave.some(Boolean)) concave[trial % n] = true;
      var fast = minDistToConcaveOnRing(concave, n);
      var slow = minDistToConcaveOnRingBrute(concave, n);
      assert.deepStrictEqual(fast, slow, 'trial ' + trial + ' n=' + n);
    }
  });

  it('chooseSeamEdge matches brute-force scoring on random rings', function () {
    for (var trial = 0; trial < 100; trial++) {
      var n = 5 + (trial % 80);
      var cx = trial * 13, cy = trial * 7;
      var r = 50 + (trial % 20);
      var verts = [];
      for (var i = 0; i < n; i++) {
        var ang = i / n * Math.PI * 2;
        var wobble = (i % 5 === 0) ? -8 : ((i % 7 === 0) ? 5 : 0);
        verts.push([cx + Math.cos(ang) * (r + wobble), cy + Math.sin(ang) * (r + wobble)]);
      }
      verts.push(verts[0].concat());
      assert.strictEqual(
        chooseSeamEdge(verts),
        chooseSeamEdgeBrute(verts),
        'trial ' + trial);
    }
  });
});
