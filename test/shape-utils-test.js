var api = require('..'),
  assert = require('assert');

describe('mapshaper-shape-utils.js', function () {

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

});