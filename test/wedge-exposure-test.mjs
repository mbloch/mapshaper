import assert from 'assert';
import {
  buildVertsSegmentIndex,
  probeIsExposed,
  probeIsExposedBrute,
  wedgeIsExposed
} from '../src/buffer/mapshaper-wedge-exposure';

describe('mapshaper-wedge-exposure.js', function () {
  // A jagged closed ring with many segments; probes at arbitrary bend tips.
  var verts = [
    [0, 0], [10, 0], [12, 2], [14, 0], [24, 0], [26, 3], [28, 0], [40, 0],
    [40, 10], [38, 12], [40, 14], [40, 24], [38, 26], [40, 28], [40, 40],
    [30, 40], [28, 38], [26, 40], [16, 40], [14, 37], [12, 40], [0, 40],
    [0, 30], [2, 28], [0, 26], [0, 16], [2, 14], [0, 12], [0, 0]
  ];

  it('indexed probeIsExposed matches brute force on sample probes', function () {
    var index = buildVertsSegmentIndex(verts);
    var probes = [
      [11, 1.5], [25, 1], [39, 11], [1, 11], [20, 39]
    ];
    probes.forEach(function(p, i) {
      var skipA = 1, skipB = 2;
      var vx = verts[2][0], vy = verts[2][1];
      assert.strictEqual(
        probeIsExposed(index, skipA, skipB, vx, vy, p),
        probeIsExposedBrute(verts, skipA, skipB, vx, vy, p),
        'probe ' + i);
    });
  });

    it('wedgeIsExposed probes arc points and tips', function () {
      var arc = [[5, 1], [5.5, 1.5], [6, 2]];
      var tipA = [4, 0.5];
      var tipB = [6.5, 2.5];
      var index = buildVertsSegmentIndex(verts);
      var skipA = 5, skipB = 6;
      var vx = verts[6][0], vy = verts[6][1];
      var expected = false;
      var probes = arc.concat([tipA, tipB]);
      probes.forEach(function(p) {
        if (probeIsExposed(index, skipA, skipB, vx, vy, p)) expected = true;
      });
      assert.strictEqual(
        wedgeIsExposed(index, skipA, skipB, vx, vy, arc, tipA, tipB), expected);
    });
});
