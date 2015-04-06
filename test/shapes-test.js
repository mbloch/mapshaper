
var api = require('..'),
  assert = require('assert'),
  ArcCollection = api.internal.ArcCollection,
  ArcIter = api.internal.ArcIter,
  Utils = api.utils,
  trace = Utils.trace;

//      b --- d
//     / \   /
//    /   \ /
//   a --- c

// cab, bc, bdc
var arcs1 = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];

//      b     d
//     / \   / \
//    /   \ /   \
//   a --- c --- e

// cabc, cdec
var arcs2 = [[[3, 1], [1, 1], [2, 3], [3, 1]], [[3, 1], [4, 3], [5, 1], [3, 1]]];
// cab, cc, cde // (collapsed ring)
var arcs3 = [[[3, 1], [1, 1], [2, 3], [3, 1]], [[3, 1], [3, 1]], [[3, 1], [4, 3], [5, 1], [3, 1]]];

//      b
//     / \
//    /   \
//   a --- c

// abca
var arcs4 = [[[1, 1], [2, 3], [3, 1], [1, 1]]];

// null dataset
var arcs5 = [];

describe('mapshaper-shapes.js', function () {
  describe('ArcCollection', function () {

    it("accepts arcs with length == 0", function() {
      var arcs = new api.internal.ArcCollection(
          new Uint32Array([0, 3]),
          new Float64Array([1, 2, 3]),
          new Float64Array([0, 1, 2])
        );

      assert.equal(arcs.size(), 2);
      assert.deepEqual(arcs.toArray(), [[], [[1, 0], [2, 1], [3, 2]]]);
    })

    it("#size() returns the correct number of arcs", function() {
      assert.equal(new ArcCollection(arcs3).size(), 3)
      assert.equal(new ArcCollection(arcs4).size(), 1)
      assert.equal(new ArcCollection(arcs5).size(), 0)
    })

    it('#getBounds() returns the correct bounding box', function () {
      assert.deepEqual(new ArcCollection(arcs3).getBounds(), {xmin: 1, ymin: 1, xmax: 5, ymax: 3})
      assert.deepEqual(new ArcCollection(arcs4).getBounds(), {xmin: 1, ymin: 1, xmax: 3, ymax: 3})
      assert.ok(new ArcCollection(arcs5).getBounds().hasBounds() == false)
    })

    it('#getPointCount() returns correct point count', function() {
      assert.equal(new ArcCollection(arcs3).getPointCount(), 10)
      assert.equal(new ArcCollection(arcs4).getPointCount(), 4)
      assert.equal(new ArcCollection(arcs5).getPointCount(), 0)
    })

    it('#setThresholds() + #setRetainedInterval() works', function() {
      var thresholds = [[Infinity, 5, 4, Infinity], [Infinity, 4, 7, Infinity]];
      var arcs = new ArcCollection(arcs2).setThresholds(thresholds)
      arcs.setRetainedInterval(10);
      assert.deepEqual([[[3, 1], [3, 1]], [[3, 1], [3, 1]]], arcs.toArray());

      // reduce interval and export again
      arcs.setRetainedInterval(4.5);
      assert.deepEqual([[[3, 1], [1, 1], [3, 1]], [[3, 1], [5, 1], [3, 1]]], arcs.toArray());
    });

    it('#setThresholds() + #setRetainedInterval() + #getFilteredCopy() works', function() {
      var thresholds = [[Infinity, 5, 4, Infinity], [Infinity, 4, 7, Infinity]];
      var arcs = new ArcCollection(arcs2).setThresholds(thresholds)
      arcs.setRetainedInterval(10);
      assert.deepEqual([[[3, 1], [3, 1]], [[3, 1], [3, 1]]], arcs.getFilteredCopy().toArray());

      // reduce interval and export again
      arcs.setRetainedInterval(4.5);
      assert.deepEqual([[[3, 1], [1, 1], [3, 1]], [[3, 1], [5, 1], [3, 1]]], arcs.getFilteredCopy().toArray());
    });

    it('#getRemovableThresholds(), nothing to remove', function() {
      var thresholds = [[Infinity, Infinity, Infinity], [Infinity, Infinity], [Infinity, Infinity, Infinity]];
      var arcs = new ArcCollection(arcs1).setThresholds(thresholds);
      var removable = arcs.getRemovableThresholds();
      assert.deepEqual([], Utils.toArray(removable));

      var removable2 = arcs.getRemovableThresholds(2);
      assert.deepEqual([], Utils.toArray(removable2));
    });

    it('#getRemovableThresholds(), three removable points', function() {
      var thresholds = [[Infinity, 5, 4, Infinity], [Infinity, Infinity, 7, Infinity]];
      var arcs = new ArcCollection(arcs2).setThresholds(thresholds);
      var removable = arcs.getRemovableThresholds();
      assert.deepEqual([5, 4, 7], Utils.toArray(removable));

      var removable2 = arcs.getRemovableThresholds(2);
      assert.deepEqual([7], Utils.toArray(removable2));
    });

    it('#getThresholdByPct(), nothing to remove', function() {
      var thresholds = [[Infinity, Infinity, Infinity], [Infinity, Infinity],
            [Infinity, Infinity, Infinity]],
        arcs = new ArcCollection(arcs1).setThresholds(thresholds);

      assert.equal(arcs.getThresholdByPct(0.7), 0);
      assert.equal(arcs.getThresholdByPct(0.1), 0);
    });

    it('#getThresholdByPct(), two removable points', function() {
      var thresholds = [[Infinity, 5, 4, Infinity]];
      var arcs = new ArcCollection(arcs4).setThresholds(thresholds);
      assert.equal(arcs.getThresholdByPct(0), Infinity);
      assert.equal(arcs.getThresholdByPct(0.1), Infinity);
      assert.equal(arcs.getThresholdByPct(0.4), 5);
      assert.equal(arcs.getThresholdByPct(0.6), 4);
      assert.equal(arcs.getThresholdByPct(1), 0);
    });

    it('#applyTransform() works', function() {
      var arcs = new ArcCollection(arcs4);
      arcs.applyTransform({
        mx: 2,
        my: 3,
        bx: 1,
        by: -1
      });
      // from: // [1, 1], [2, 3], [3, 1], [1, 1]
      assert([[[3, 2], [5, 8], [7, 2], [3, 2]]], arcs.toArray());
      assert({xmin: 3, ymin: 2, xmax: 7, ymax: 8}, arcs.getBounds());
    });

    it('#getAvgSegment2() works', function() {
      var arcs = [[[1, 1], [2, 3], [3, 1], [1, 1]]],
          dataset = new ArcCollection(arcs),
          xy = dataset.getAvgSegment2();
      assert.deepEqual([4/3, 4/3], xy);

      var arcs2 = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]],
          dataset2 = new ArcCollection(arcs2),
          xy2 = dataset2.getAvgSegment2();
      assert.deepEqual([7/5, 6/5], xy2);
    })

    it('#filter() works', function() {
      var arcs = new ArcCollection(arcs1);

      // remove all but the third
      arcs.filter(function(iter, i) {
        return i == 2;
      });
      assert.deepEqual([[[2, 3], [4, 3], [3, 1]]], arcs.toArray());

      // remove remaining arc
      arcs.filter(function() { return false });
      assert.deepEqual([], arcs.toArray());
    });

    it('#quantize() works', function() {
      // points: [1, 1], [2, 3], [3, 1], [1, 1]
      var arcs = new ArcCollection(arcs4);
      var bb1 = arcs.getBounds();

      // hi-res
      arcs.quantize(9999); // multiple of 3, so original coords are preserved
      assert.deepEqual(bb1, arcs.getBounds());
      assert.deepEqual([[[1, 1], [2, 3], [3, 1], [1, 1]]], arcs.toArray())

      // low-res
      arcs.quantize(3);
      assert.deepEqual(bb1, arcs.getBounds());
      assert.deepEqual([[[1, 1], [2, 3], [3, 1], [1, 1]]], arcs.toArray());

      // ultra low-res
      arcs.quantize(2);
      assert.deepEqual(bb1, arcs.getBounds());
      assert.deepEqual([[[1, 1], [3, 3], [3, 1], [1, 1]]], arcs.toArray());
    })

  })

  describe('#indexOfVertex()', function () {
    it('Fig. 1', function () {
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
      var coords = [[[2, 4], [2, 3], [2, 2]],
          [[2, 2], [1, 2]],
          [[1, 2], [1, 4]],
          [[1, 4], [2, 4]],
          [[1, 4], [1, 5], [2, 5], [2, 4]],
          [[2, 4], [2, 3], [2, 2]],
          [[2, 2], [2, 1], [1, 1], [1, 2]],
          [[1, 2], [1, 4]]];

      var arcs = new ArcCollection(coords);

      assert.equal(arcs.indexOfVertex(0, 0), 0);
      assert.equal(arcs.indexOfVertex(~0, 0), 2);
      assert.equal(arcs.indexOfVertex(~0, 2), 0);
      assert.equal(arcs.indexOfVertex(7, -1), 21);
      assert.equal(arcs.indexOfVertex(7, -2), 20);
      assert.throws(function() {
        assert.equal(arcs.indexOfVertex(0, 2));
      })
      assert.throws(function() {
        assert.equal(arcs.indexOfVertex(0, -3));
      })

    })
  })

  describe('#forEachSegment()', function () {
    it('should handle empty arcs', function () {
      var coords = [[[0, 0], [1, 1], [1, 1]], [], [[2, 2], [3, 3], [4, 4]]];
      var arcs = new ArcCollection(coords)
      var ids = [];
      arcs.forEachSegment(function(a, b, xx, yy) {
        ids.push([a, b]);
      });
      var target = [[0, 1], [1, 2], [3, 4], [4, 5]];
      assert.deepEqual(ids, target);
    })
  })

  describe('#forEachArcSegment()', function () {
    it('should work with fw and bw arcs', function () {

      var coords = [[[0, 0], [0, 0], [0, 0]], [], [[0, 0], [0, 0]]];
      var arcs = new ArcCollection(coords)

      assert.deepEqual(getSegIds(0), [[0, 1], [1, 2]]);
      assert.deepEqual(getSegIds(~0), [[2, 1], [1, 0]]);
      assert.deepEqual(getSegIds(~1), []);
      assert.deepEqual(getSegIds(~2), [[4, 3]]);

      function getSegIds(id) {
        var ids = [];
        arcs.forEachArcSegment(id, function(a, b) {
          ids.push([a, b]);
        });
        return ids;
      }

    })
  }) // end ArcCollection tests

  describe('ArcIter', function () {
    it('handle len 0 fw arc', function () {
      var iter = new ArcIter([], []).init(0, 0, true);
      assert.equal(iter.hasNext(), false);
    })
  })
})
