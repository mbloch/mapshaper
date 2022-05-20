import {
  densifyAntimeridianSegment
} from '../src/crs/mapshaper-densify';
import assert from 'assert';


describe('mapshaper-densify.js', function () {
  describe('densifyAntimeridianSegment()', function () {
    it('n and s direction yield same points', function () {
      var s = densifyAntimeridianSegment([180, 1.1], [180, -1], 0.5);
      var n = densifyAntimeridianSegment([180, -1], [180, 1.1], 0.5);
      assert.deepEqual(s, [[180, 1], [180, 0.5], [180, 0], [180, -0.5]])
      assert.deepEqual(n, [[180, -0.5], [180, 0], [180, 0.5], [180, 1]])
    });

  })
})