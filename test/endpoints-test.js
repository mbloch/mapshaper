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

  /*
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
  */

  describe('Fig. 2', function() {
    //
    //  g ----- h
    //  |       |
    //  fe---- ai
    //  ||     ||
    //  ||     bj
    //  ||     ||
    //  nd --- ck
    //  |       |
    //  m ----- l
    //
    var coords = [[[2, 4], [2, 3], [2, 2]], // 0
        [[2, 2], [1, 2]],                   // 3
        [[1, 2], [1, 4]],                   // 5
        [[1, 4], [2, 4]],                   // 7
        [[1, 4], [1, 5], [2, 5], [2, 4]],   // 9
        [[2, 4], [2, 3], [2, 2]],           // 13
        [[2, 2], [2, 1], [1, 1], [1, 2]],   // 16
        [[1, 2], [1, 4]]];                  // 20

    var arcs = new ArcCollection(coords),
        nodes = new NodeCollection(arcs);

    it ("NodeCollection#testArcMatch()", function() {
      assert.equal(nodes.internal.testArcMatch(0, 5), true)
      assert.equal(nodes.internal.testArcMatch(~0, ~5), true)
      assert.equal(nodes.internal.testArcMatch(~2, ~7), true)
      assert.equal(nodes.internal.testArcMatch(2, 7), true)
      assert.equal(nodes.internal.testArcMatch(2, 7), true)
      assert.equal(nodes.internal.testArcMatch(2, 7), true)
      assert.equal(nodes.internal.testArcMatch(~0, 5), false)
      assert.equal(nodes.internal.testArcMatch(1, 2), false)
      assert.equal(nodes.internal.testArcMatch(~1, 2), false)
    })

    it ("NodeCollection#findMatchingArc()", function() {
      assert.equal(nodes.findMatchingArc(0), 0);
      assert.equal(nodes.findMatchingArc(~0), ~0);
      assert.equal(nodes.findMatchingArc(5), 0);
      assert.equal(nodes.findMatchingArc(~5), ~0);
      assert.equal(nodes.findMatchingArc(~7), ~2);
      assert.equal(nodes.findMatchingArc(7), 2);
      assert.equal(nodes.findMatchingArc(2), 2);
    });


  });

});