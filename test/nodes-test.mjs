import api from '../mapshaper.js';
import assert from 'assert';


var ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-nodes.js', function () {

  describe('NodeCollection() Fig. 1 tests', function () {
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

    it('#toArray()', function () {
      var nodes = new NodeCollection(new ArcCollection(arcs));
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1, 2]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1, ~2]
      }]);
    })

    it('Optional filter function constructor argument filters arcs', function() {
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
    });

    it('#getConnectedArcs() takes an optional filter function argument', function() {
      var filter = function(id) { // exclude arc 0 in either direction
        var absId = id < 0 ? ~id : id;
        return absId != 0;
      }
      var filter2 = function(id) {return id != 0;}; // exclude arc 0 in forward direction
      var nodes = new NodeCollection(new ArcCollection(arcs));

      // filter is no longer applied to input arc, only output arcs
      assert.deepEqual(nodes.getConnectedArcs(0, filter), [~1, ~2]);
      assert.deepEqual(nodes.getConnectedArcs(~0, filter), [1, 2]);

      // non-directional filter
      assert.deepEqual(nodes.getConnectedArcs(1, filter), [2]);
      assert.deepEqual(nodes.getConnectedArcs(2, filter), [1]);
      assert.deepEqual(nodes.getConnectedArcs(~1, filter), [~2]);
      assert.deepEqual(nodes.getConnectedArcs(~2, filter), [~1]);

      // directional filter
      assert.deepEqual(nodes.getConnectedArcs(1, filter2), [2, ~0]);
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
      // Fig. 2
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
      // Fig. 3
      //
      //      b     d --- f
      //     / \   / \
      //    /   \ /   \
      //   a --- c     e
      //
      //   cab, bc, cd, de, fe
      //   0,   1,  2,  3,  4

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]],
        [[3, 1], [4, 3]], [[4, 3], [5, 1]], [[6, 3], [4, 3]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));
      assert.deepEqual(nodes.toArray(), [{
        coordinates: [3, 1],
        arcs: [~0, 1, ~2]
      }, {
        coordinates: [2, 3],
        arcs: [0, ~1]
      }, {
        coordinates: [4, 3],
        arcs: [2, ~3, 4]
      }, {
        coordinates: [5, 1],
        arcs: [3]
      }, {
        coordinates: [6, 3],
        arcs: [~4]
      }]);
      assert.deepEqual(nodes.getConnectedArcs(1), [~2, ~0])
      assert.deepEqual(nodes.getConnectedArcs(2), [~3, 4])
      var count = nodes.detachAcyclicArcs();
      assert.equal(count, 3);
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

  describe('#findDanglingEndpoints()', function () {
    it('Fig. 3', function () {
      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]],
        [[3, 1], [4, 3]], [[4, 3], [5, 1]], [[6, 3], [4, 3]]];
      var nodes = new NodeCollection(new ArcCollection(arcs));
      var target = [{
          point: [5, 1],
          arc: 3
        }, {
          point: [6, 3],
          arc: ~4
        }];
      var count;
      assert.deepEqual(nodes.findDanglingEndpoints(), target);
      count = nodes.detachAcyclicArcs();
      assert.equal(count, 3);
      assert.deepEqual(nodes.findDanglingEndpoints(), []);
      nodes.detachArc(~1);
      assert.deepEqual(nodes.findDanglingEndpoints(), [{
          arc: ~0,
          point: [3, 1]
        }, {
          arc: 0,
          point: [2, 3]
        }]);
      count = nodes.detachAcyclicArcs();
      assert.equal(count, 1);
      assert.deepEqual(nodes.findDanglingEndpoints(), []);
    })
  })


  /*
  describe('NodeCollection#getNextArc()', function () {
    it('test 1', function () {
      // Fig. 4
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

      assert.equal(nodes.getNextArc(0, true), 1);
      assert.equal(nodes.getNextArc(0, false), 2);
      assert.equal(nodes.getNextArc(~0, true), ~2);
      assert.equal(nodes.getNextArc(~0, false), ~1);
      assert.equal(nodes.getNextArc(2, true), ~1);
      assert.equal(nodes.getNextArc(2, false), 0);
    })
  })
  */

  describe('test 2', function() {
    // Fig. 5
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

    it ("NodeCollection#findDuplicateArc()", function() {
      assert.equal(nodes.findDuplicateArc(0), 0);
      assert.equal(nodes.findDuplicateArc(~0), ~0);
      assert.equal(nodes.findDuplicateArc(5), 0);
      assert.equal(nodes.findDuplicateArc(~5), ~0);
      assert.equal(nodes.findDuplicateArc(~7), ~2);
      assert.equal(nodes.findDuplicateArc(7), 2);
      assert.equal(nodes.findDuplicateArc(2), 2);
    });

  });

});
