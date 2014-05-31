var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-endpoints.js', function () {

  describe('NodeCollection#toArray()', function () {
    it('test 1', function () {

      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc, bdc
      //   0,   1,  2

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var nodes = new NodeCollection(new ArcCollection(arcs)).toArray();

      assert.deepEqual(nodes, [[3, 1], [2, 3]]);
    })
  })

  describe('NodeCollection#getNextArc()', function () {
    it('test 1', function () {

      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc, bdc
      //   0,   1,  2

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));

      assert.equal(nodes.getNextArc(0, true), 1);
      assert.equal(nodes.getNextArc(0, false), 2);
      assert.equal(nodes.getNextArc(~0, true), ~2);
      assert.equal(nodes.getNextArc(~0, false), ~1);
      assert.equal(nodes.getNextArc(2, true), ~1);
      assert.equal(nodes.getNextArc(2, false), 0);
    })
  })

});