var api = require('../gui/www/mapshaper.js'),
  assert = require('assert'),
  BoundsIndex = api.BoundsIndex,
  BoundingBox = api.BoundingBox,
  trace = api.trace;

describe('mapshaper-index.js', function () {

  var bb1 = [
    [0, 0, 1, 1],
    [1, 1, 2, 2]
  ];

  // non-intersecting boxes
  var box1a = new BoundingBox(3, 1, 4, 0),
      box1b = new BoundingBox(-2, 1, -1, 0),
      box1c = new BoundingBox(0, -1, 1, 0);

  // intersect all
  var box1d = new BoundingBox(0, 2, 2, 0);
  var box1e = new BoundingBox(0, 1, 1, 0);
  var box1f = new BoundingBox(1, 2, 2, 1);
  var box1g = new BoundingBox(0.5, 1.5, 1.5, 0.5);
  var box1h = new BoundingBox(-Infinity, Infinity, Infinity, -Infinity);

  // instersect one
  var box1i = new BoundingBox(0, 3, 1, 2);
  var box1j = new BoundingBox(1.5, 1.7, 2, 1);
  var box1k = new BoundingBox(-1, 0, 0, -1);

  var bb2 = bb1.concat([[1, 1, 2, 2]]);

  var bb3 = [
    [-1, -1, 1, 1],
    [0, 0, 1, 4],
    [0, 1, 4, 2],
    [5, 5, 6, 6]
  ];


  describe('BoundsIndex#size()', function () {
    it('should add bounding boxes and report correct size', function () {
      var index = new BoundsIndex(bb1);
      assert.equal(2, index.size());
    })
  })

  describe('BoundsIndex binning', function() {

    it('bins should divide when they overflow', function() {

      assert.equal(4, new BoundsIndex(bb3, {maxBinSize: 1}).binCount());
      assert.equal(2, new BoundsIndex(bb3, {maxBinSize: 3}).binCount());
      assert.equal(2, new BoundsIndex(bb2, {maxBinSize: 2}).binCount());
    })

    it('should return same set of ids with and without bin splitting', function() {
      var index1 = new BoundsIndex(bb1, {maxBinSize: 1}),
          index2 = new BoundsIndex(bb1);

      // these return empty arrays, don't need to be sorted
      assert.deepEqual(index1.getIntersection(box1a).sort(), index2.getIntersection(box1a).sort())
      assert.deepEqual(index1.getIntersection(box1b).sort(), index2.getIntersection(box1b).sort())
      assert.deepEqual(index1.getIntersection(box1c).sort(), index2.getIntersection(box1c).sort())

      // these return 1-element arryays, don't need to be sorted
      assert.deepEqual(index1.getIntersection(box1i).sort(), index2.getIntersection(box1i).sort())
      assert.deepEqual(index1.getIntersection(box1j).sort(), index2.getIntersection(box1j).sort())
      assert.deepEqual(index1.getIntersection(box1k).sort(), index2.getIntersection(box1k).sort())

      assert.deepEqual(index1.getIntersection(box1d).sort(), index2.getIntersection(box1d).sort())
      assert.deepEqual(index1.getIntersection(box1e).sort(), index2.getIntersection(box1e).sort())
      assert.deepEqual(index1.getIntersection(box1f).sort(), index2.getIntersection(box1f).sort())

    })
  })

  describe('BoundsIndex#getItemsInBoundingBox()', function() {
    it('should return empty array for non-intersecting box', function() {
      var index = new BoundsIndex(bb1);
      assert.deepEqual([], index.getIntersection(box1a));
      assert.deepEqual([], index.getIntersection(box1b));
      assert.deepEqual([], index.getIntersection(box1c));
    })


    it('should return all ids when bbox intersects all boxes', function() {
      var index = new BoundsIndex(bb1);
      assert.deepEqual([0, 1], index.getIntersection(box1d));
      assert.deepEqual([0, 1], index.getIntersection(box1e));
      assert.deepEqual([0, 1], index.getIntersection(box1f));
      assert.deepEqual([0, 1], index.getIntersection(box1g));
      assert.deepEqual([0, 1], index.getIntersection(box1h));
    })

    it('should return correct id when bbox intersects one bbox', function() {
      var index = new BoundsIndex(bb1);
      assert.deepEqual([1], index.getIntersection(box1i));
      assert.deepEqual([1], index.getIntersection(box1j));
      assert.deepEqual([0], index.getIntersection(box1k));
    })

    it('should return correct id when bbox intersects one bbox', function() {
      var index = new BoundsIndex(bb1);
      assert.deepEqual([1], index.getIntersection(new BoundingBox(0, 3, 1, 2)));
      assert.deepEqual([1], index.getIntersection(new BoundingBox(1.5, 1.7, 2, 1)));
      assert.deepEqual([0], index.getIntersection(new BoundingBox(-1, 0, 0, -1)));
    })

  })

})