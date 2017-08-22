var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-gaps.js', function () {
  describe('getPatchArc', function () {
    var getPatchArc = api.internal.getPatchArc;

    it('test 1', function () {
      var coords = [[[0, 0], [2, 0]]];
      var arcs = new ArcCollection(coords);
      assert.deepEqual(getPatchArc(0, arcs, 1), [[2, 0], [3, 0]]);
      assert.deepEqual(getPatchArc(~0, arcs, 3), [[0, 0], [-3, 0]]);
    })

    it('test 2', function () {
      var coords = [[[0, -1], [0, 0], [2, 0], [2, 1]]];
      var arcs = new ArcCollection(coords);
      assert.deepEqual(getPatchArc(0, arcs, 2), [[2, 1], [2, 3]]);
      assert.deepEqual(getPatchArc(~0, arcs, 3), [[0, -1], [0, -4]]);
    })
  })

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

  describe('patchGaps()', function () {
    it('test 1', function () {
      var arcs = new ArcCollection([[[0, 0], [0, 1]], [[1, 2], [4, 2]]]);
      var shapes = [[[0]], [[1]]];
      var dangles = [{
        arc: 0
      }, {
        arc: ~0
      }];
      var patchedArcs = api.internal.patchGaps(dangles, shapes, arcs, 2);
      var targetArcs = [[[0, 0], [0, 1]], [[1, 2], [4, 2]], [[0, 0], [0, -2]], [[0, 1], [0, 3]]];
      var targetShapes = [[[~2, 0, 3]], [[1]]];
      assert.deepEqual(patchedArcs.toArray(), targetArcs)
      assert.deepEqual(shapes, targetShapes);  // shapes modified in-place
    })
  })
});
