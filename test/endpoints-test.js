var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-endpoints.js', function () {

  describe('NodeCollection', function () {
    it('toArray()', function () {

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

});