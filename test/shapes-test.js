
var api = require('..'),
  assert = require('assert'),
  ArcDataset = api.ArcDataset,
  trace = api.trace;

//      b --- d
//     / \   /
//    /   \ /
//   a --- c

// cab, bc, bdc
var arcs1 = [[[3, 1, 2], [1, 1, 3]], [[2, 3], [3, 1]], [[2, 4, 3], [3, 3, 1]]];

//      b     d
//     / \   / \
//    /   \ /   \
//   a --- c --- e
//

// cabc, cdec
var arcs2 = [[[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]];
// cab, cc, cde // (collapsed ring)
var arcs3 = [[[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 3], [1, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]];

//      b
//     / \
//    /   \
//   a --- c

// abca
var arcs4 = [[[1, 2, 3, 1], [1, 3, 1, 1]]];

// null dataset
var arcs5 = [];

describe('mapshaper-shapes.js', function () {
  describe('ArcDataset', function () {

    it("#size() returns the correct number of arcs", function() {
      assert.equal(new ArcDataset(arcs3).size(), 3)
      assert.equal(new ArcDataset(arcs4).size(), 1)
      assert.equal(new ArcDataset(arcs5).size(), 0)
    })

    it('#getBounds() returns the correct bounding box', function () {
      assert.deepEqual(new ArcDataset(arcs3).getBounds(), {xmin: 1, ymin: 1, xmax: 5, ymax: 3})
      assert.deepEqual(new ArcDataset(arcs4).getBounds(), {xmin: 1, ymin: 1, xmax: 3, ymax: 3})
      assert.ok(new ArcDataset(arcs5).getBounds().hasBounds() == false)
    })

    it('#getPointCount() returns correct point count', function() {
      assert.equal(new ArcDataset(arcs3).getPointCount(), 10)
      assert.equal(new ArcDataset(arcs4).getPointCount(), 4)
      assert.equal(new ArcDataset(arcs5).getPointCount(), 0)
    })

    it('#setThresholds() + #setRetainedInterval() works', function() {
      var thresholds = [[Infinity, 5, 4, Infinity], [Infinity, 4, 7, Infinity]];
      var arcs = new ArcDataset(arcs2).setThresholds(thresholds)
      arcs.setRetainedInterval(10);
      assert.deepEqual([[[3, 1], [3, 1]], [[3, 1], [3, 1]]], arcs.toArray());

      // reduce interval and export again
      arcs.setRetainedInterval(4.5);
      assert.deepEqual([[[3, 1], [1, 1], [3, 1]], [[3, 1], [5, 1], [3, 1]]], arcs.toArray());
    });

    it('#setThresholds() + #setRetainedInterval() + #getFilteredCopy() works', function() {
      var thresholds = [[Infinity, 5, 4, Infinity], [Infinity, 4, 7, Infinity]];
      var arcs = new ArcDataset(arcs2).setThresholds(thresholds)
      arcs.setRetainedInterval(10);
      assert.deepEqual([[[3, 1], [3, 1]], [[3, 1], [3, 1]]], arcs.getFilteredCopy().toArray());

      // reduce interval and export again
      arcs.setRetainedInterval(4.5);
      assert.deepEqual([[[3, 1], [1, 1], [3, 1]], [[3, 1], [5, 1], [3, 1]]], arcs.getFilteredCopy().toArray());
    });

    it('#applyTransform() works', function() {
      var arcs = new ArcDataset(arcs4);
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

    it('#filter() works', function() {
      var arcs = new ArcDataset(arcs1);

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
      var arcs = new ArcDataset(arcs4);
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

    // it('#setRetainedPct() works', function() { });

  })
})

