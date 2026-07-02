import assert from 'assert';
import {
  buildVertsSegmentIndex,
  probeIsExposed,
  probeIsExposedBrute
} from '../src/buffer/mapshaper-wedge-exposure';

describe('mapshaper-wedge-exposure fuzz', function () {
  it('indexed probeIsExposed matches brute force', function () {
    var verts = [];
    var i;
    for (i = 0; i < 500; i++) {
      verts.push([Math.cos(i / 10) * 100 + i * 0.3, Math.sin(i / 7) * 50 + i * 0.1]);
    }
    verts.push(verts[0].slice());
    var index = buildVertsSegmentIndex(verts);
    var mism = 0;
    var trial, skipA, skipB, vx, vy, p;
    for (trial = 0; trial < 2000; trial++) {
      skipA = Math.floor(Math.random() * (verts.length - 2));
      skipB = skipA + 1;
      vx = verts[skipB][0];
      vy = verts[skipB][1];
      p = [vx + (Math.random() - 0.5) * 30, vy + (Math.random() - 0.5) * 30];
      if (probeIsExposed(index, skipA, skipB, vx, vy, p) !==
          probeIsExposedBrute(verts, skipA, skipB, vx, vy, p)) {
        mism++;
      }
    }
    assert.equal(mism, 0, 'index/brute mismatches: ' + mism);
  });
});
