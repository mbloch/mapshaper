var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-nodes.js', function () {

  describe('NodeCollection()', function () {
    it('test 1', function () {
      // Fig. 1
      //
      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc, bdc
      //   0,   1,  2

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));

      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1, 2]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1, ~2]
      }]);
    })

    it('filter function excludes nodes', function() {
      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var filter = function(id) {return id != 0;}; // exclude arc 0
      var nodes = new NodeCollection(new ArcCollection(arcs), filter);
      assert.deepEqual(nodes.getConnectedArcs(0), []);
      assert.deepEqual(nodes.getConnectedArcs(1), [2]);
      assert.deepEqual(nodes.getConnectedArcs(2), [1]);
      assert.deepEqual(nodes.getConnectedArcs(~0), []);
      assert.deepEqual(nodes.getConnectedArcs(~1), [~2]);
      assert.deepEqual(nodes.getConnectedArcs(~2), [~1]);
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [2, 3],
        arcs: [~1, ~2]
      }, {
        coordinates: [3, 1],
        arcs: [1, 2]
      }]);

    })

  })

  describe('#detachArc()', function() {
    it ('test 1', function() {
      // Same as Fig. 1 above
      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));
      nodes.detachArc(0);
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [2, 3],
        arcs: [~1, ~2]
      }, {
        coordinates: [3, 1],
        arcs: [1, 2]
      }]);

      // remove same arc (in opposite direction) -- same expected output
      nodes.detachArc(~0);
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [2, 3],
        arcs: [~1, ~2]
      }, {
        coordinates: [3, 1],
        arcs: [1, 2]
      }]);

      // remove another arc
      nodes.detachArc(~2);
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [2, 3],
        arcs: [~1]
      }, {
        coordinates: [3, 1],
        arcs: [1]
     }]);
    });

    it ('test 2', function() {
      // same as Fig. 1
      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));
      nodes.detachArc(~1);
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 2]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~2]
      }]);
    });

    it ('test 3 - spike', function () {
      // Fig. 1
      //
      //      b     d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc, cd
      //   0,   1,  2

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[3, 1], [4, 3]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));

      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1, ~2]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1]
      }, {
        coordinates: [4, 3],
        arcs: [2]
      }]);
      assert.deepEqual(nodes.getConnectedArcs(2), []);
      assert.deepEqual(nodes.getConnectedArcs(~2), [~0, 1]);
      assert.deepEqual(nodes.getConnectedArcs(1), [~2, ~0]);
      nodes.detachArc(2);
      assert.deepEqual(nodes.getConnectedArcs(2), []);
      assert.deepEqual(nodes.getConnectedArcs(~2), []);
      assert.deepEqual(nodes.getConnectedArcs(1), [~0]);
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1]
      }]);
    });
  });

  describe('#detachAcyclicArcs()', function () {

    it ('test 3 - spike', function () {
      // Fig. 1
      //
      //      b     d
      //     / \   / \
      //    /   \ /   \
      //   a --- c     e
      //
      //   cab, bc, cd, de
      //   0,   1,  2,  3

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[3, 1], [4, 3]], [[4, 3], [5, 1]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));

      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1, ~2]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1]
      }, {
        coordinates: [4, 3],
        arcs: [2, ~3]
      }, {
        coordinates: [5, 1],
        arcs: [3]
      }]);
      assert.deepEqual(nodes.getConnectedArcs(1), [~2, ~0])
      assert.deepEqual(nodes.getConnectedArcs(2), [~3])
      var count = nodes.detachAcyclicArcs();
      assert.equal(count, 2);
      assert.deepEqual(nodes.getConnectedArcs(1), [~0])
      assert.deepEqual(nodes.getConnectedArcs(2), [])
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1]
      }]);
    });
  });


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