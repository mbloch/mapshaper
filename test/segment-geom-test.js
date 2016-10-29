var api = require('../'),
    assert = require('assert'),
    geom = api.geom,
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-segment-geom.js', function () {

  describe('Issue: intersection geometry', function () {
    var ax = 18.74565637200007,
        ay = -28.839892272999904,
        bx = 18.854375373293617,
        by = -28.853825089157862,
        cx = 18.854375373293617,
        cy = -28.853825089157862,
        dx = 18.95453251100014,
        dy = -28.866660664999884;
  })

  describe('segmentHit', function () {
    it('detects collinear horizontal overlapping segments', function () {
      assert(geom.segmentHit(0, 0, 3, 0, 1, 0, 4, 0));
      assert(geom.segmentHit(0, 0, 3, 0, 1, 0, 2, 0));
      assert(geom.segmentHit(0, 0, 3, 0, 0, 0, 2, 0));
    })
    it('detects collinear vertical overlapping segments', function () {
      assert(geom.segmentHit(0, 0, 0, 3, 0, 1, 0, 4));
      assert(geom.segmentHit(0, 0, 0, 3, 0, 1, 0, 2));
      assert(geom.segmentHit(0, 0, 0, 3, 0, 0, 0, 2));
    })
    it('detects collinear sloping overlapping segments', function () {
      assert(geom.segmentHit(0, 0, 3, 3, 1, 1, 4, 4));
      assert(geom.segmentHit(0, 0, 3, 3, 1, 1, 2, 2));
      assert(geom.segmentHit(0, 0, 3, 3, 1, 1, 2, 2));
    })
    it('rejects collinear disjoint segments', function () {
      assert(geom.segmentHit(0, 0, 1, 1, 3, 3, 4, 4));
      assert(geom.segmentHit(0, 0, 0, 1, 0, 2, 0, 4));
      assert(geom.segmentHit(0, 0, 1, 0, 3, 0, 4, 0));
    })
  })

  describe('segmentIntersection', function () {
    it('Joined segs are not intersections', function () {
      assert.equal(geom.segmentIntersection(0, 0, 0, 1, 0, 1, 1, 1), null)
      assert.equal(geom.segmentIntersection(0, 0, 0, 1, 0, 1, 0, 2), null)
      assert.equal(geom.segmentIntersection(0, 0, 0, 1, 1, 0, 0, 0), null)
      assert.equal(geom.segmentIntersection(0, 0, 0, 1, 0, 0, 1, 0), null)
      assert.equal(geom.segmentIntersection(0, 0, 1, 1, 1, 1, 2, 0), null)
      assert.equal(geom.segmentIntersection(0, 0, 1, 1, 1, 1, 2, 2), null)
      assert.equal(geom.segmentIntersection(0, 0, 1, -1, 1, -1, 2, 0), null)
    });

    it('Congruent segments are nully', function() {
      assert.equal(geom.segmentIntersection(0, 0, 1, 1, 0, 0, 1, 2), null)
      assert.equal(geom.segmentIntersection(1, 2, 0, 0, 0, 0, 1, 1), null)
      assert.equal(geom.segmentIntersection(0, 0, 1, 0, 1, 0, 0, 0), null)
      assert.equal(geom.segmentIntersection(0, 1, 0, 0, 0, 1, 0, 0), null)
    })

    it('Partially congruent segments are treated as having one or two intersections', function() {
      assert.deepEqual(geom.segmentIntersection(0, 0, 1, 1, 0, 0, 2, 2), [1, 1])
      assert.deepEqual(geom.segmentIntersection(2, 2, 0, 0, 0, 0, 1, 1), [1, 1])
      assert.deepEqual(geom.segmentIntersection(3, 3, 0, 0, 2, 2, 1, 1), [2, 2, 1, 1])
      assert.deepEqual(geom.segmentIntersection(0, 0, 2, 2, 1, 1, 3, 3), [2, 2, 1, 1])
      assert.deepEqual(geom.segmentIntersection(0, 3, 0, 0, 0, 2, 0, 1), [0, 2, 0, 1])
      assert.deepEqual(geom.segmentIntersection(0, 0, 0, 2, 0, 1, 0, 3), [0, 2, 0, 1])
      assert.deepEqual(geom.segmentIntersection(3, 0, 0, 0, 2, 0, 1, 0), [2, 0, 1, 0])
      assert.deepEqual(geom.segmentIntersection(0, 0, 2, 0, 1, 0, 3, 0), [2, 0, 1, 0])
   })

    it('Tiny overlaps are detected', function() {
      var TINY = 0.00000000001;
      assert.equal(!!geom.segmentIntersection(0, 0, 1, 1, TINY, 0, 1 - TINY, 1), true);
      assert.equal(!!geom.segmentIntersection(TINY, 0, 1, 1, 0, 0, 1, TINY), true);
      assert.equal(!!geom.segmentIntersection(0, 0, 1, -1, TINY, 0, 1 - TINY, -1), true);
      assert.equal(!!geom.segmentIntersection(TINY, 0, 1, -1, 0, 0, 1, -TINY), true);
    })
  })

})
