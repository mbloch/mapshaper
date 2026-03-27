import api from '../mapshaper.js';
import assert from 'assert';
import { getDirectedArcPresenceTest } from '../src/paths/mapshaper-path-utils';

describe('mapshaper-undershoots.js', function () {

  describe('getDirectedArcPresenceTest()', function () {
    it('test 1', function () {
      var arcs = [~1, 4, 5, 0];
      var test = getDirectedArcPresenceTest(arcs, 6);
      assert(test(~1));
      assert(test(4));
      assert(test(0));
      assert(!test(1));
      assert(!test(~0));
      assert(!test(3));
    })
  })
});
