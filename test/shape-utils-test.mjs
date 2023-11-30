import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-shape-utils.js', function () {

  it('getAvgSegment2() works', function() {
    var coords = [[[1, 1], [2, 3], [3, 1], [1, 1]]],
        arcs = new api.internal.ArcCollection(coords),
        xy = api.internal.getAvgSegment2(arcs);
    assert.deepEqual([4/3, 4/3], xy);

    var coords2 = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]],
        arcs2 = new api.internal.ArcCollection(coords2),
        xy2 = api.internal.getAvgSegment2(arcs2);
    assert.deepEqual([7/5, 6/5], xy2);
  })

  describe('#clampIntervalByPct()', function () {
    it('Snap simplification interval at extremes', function () {
      assert.equal(api.internal.clampIntervalByPct(3, 0), Infinity);
      assert.equal(api.internal.clampIntervalByPct(3, 1), 0);
      assert.equal(api.internal.clampIntervalByPct(3, 0.5), 3);
    })
  });


  describe('#findNextRemovableVertex()', function () {
    it('Find index of largest non-infinite point', function () {
      var zz, id;
      zz = [Infinity, 3, 2, Infinity];
      id = api.internal.findNextRemovableVertex(zz, Infinity, 0, 3);
      assert.equal(id, 1);
      zz = [Infinity, 0, 15, Infinity, Infinity, 5, -8, 2, 4, 5, Infinity];
      id = api.internal.findNextRemovableVertex(zz, Infinity, 4, 10);
      assert.equal(id, 5);
      id = api.internal.findNextRemovableVertex(zz, 4, 4, 10);
      assert.equal(id, 7);
    })
  })

  describe('findShapesByArcId()', function () {
    it('returns only shapes that contain one or more arc ids', function () {
      var shapes = [null, [[0]], [[~0, 1]], [[2, 3], [0]], [[2]]];
      var arcIds = [0, 1];
      assert.deepEqual(api.internal.findShapesByArcId(shapes, arcIds, 4), [1, 2, 3]);
    });
  })

  describe('quantizeArcs', function () {

    it('quantizeArcs() works', function() {
      //      b
      //     / \
      //    /   \
      //   a --- c

      // abca
      var coords = [[[1, 1], [2, 3], [3, 1], [1, 1]]];
      var arcs = new api.internal.ArcCollection(coords);
      var bb1 = arcs.getBounds();

      // hi-res
      api.internal.quantizeArcs(arcs, 9999); // multiple of 3, so original coords are preserved
      assert.deepEqual(bb1, arcs.getBounds());
      assert.deepEqual([[[1, 1], [2, 3], [3, 1], [1, 1]]], arcs.toArray())

      // low-res
      api.internal.quantizeArcs(arcs, 3);
      assert.deepEqual(bb1, arcs.getBounds());
      assert.deepEqual([[[1, 1], [2, 3], [3, 1], [1, 1]]], arcs.toArray());

      // ultra low-res
      api.internal.quantizeArcs(arcs, 2);
      assert.deepEqual(bb1, arcs.getBounds());
      assert.deepEqual([[[1, 1], [3, 3], [3, 1], [1, 1]]], arcs.toArray());
    })

  })

});