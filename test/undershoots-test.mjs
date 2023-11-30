import api from '../mapshaper.js';
import assert from 'assert';

var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-undershoots.js', function () {

  describe('getDirectedArcPresenceTest()', function () {
    it('test 1', function () {
      var arcs = [~1, 4, 5, 0];
      var test = api.internal.getDirectedArcPresenceTest(arcs, 6);
      assert(test(~1));
      assert(test(4));
      assert(test(0));
      assert(!test(1));
      assert(!test(~0));
      assert(!test(3));
    })
  })
});
