import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;
var geom = api.geom,
    ArcCollection = internal.ArcCollection;

describe('mapshaper-segment-geom.js', function () {

  describe('segmentTurn()', function () {

    it('left turn', function () {
      var pp = [[0, 0], [0, 1], [2, 2], [1, 2]];
      assert.equal(geom.segmentTurn.apply(null, pp), -1);
    })
    it('right turn', function () {
      var pp = [[0, 0], [0, 1], [1, 2], [2, 2]];
      assert.equal(geom.segmentTurn.apply(null, pp), 1);
    })
    it('collinear', function () {
      var pp = [[0, 0], [0, 1], [2, 2], [2, 3]];
      assert.equal(geom.segmentTurn.apply(null, pp), 0);
    })
    it('collinear 2', function () {
      var pp = [[0, 0], [0, 1], [2, 2], [2, 1]];
      assert.equal(geom.segmentTurn.apply(null, pp), 0);
    })
  })


  describe('Tests based on real data', function () {
    return;
    // REMOVING THIS TEST --- no longer detecting both T-intersections and crosses
    it('Data from clean/ex7_britain.json -- T-intersection and cross', function() {
      /*
      arc 2
      i1  42
      i2  43
      x1  413730.38500158896
      y1  289723.21580549097
      x2  414248.4061214699
      y2  290157.18802885344

      arc 1
      i1  29
      i2  30
      x1  414248.4061220713
      y1  290157.1880293601
      x2  413730.38500161114
      y2  289723.21580549626
      */

      var a = [413730.38500158896, 289723.21580549097];
      var b = [414248.4061214699, 290157.18802885344]; // ....
      var c = [414248.4061220713, 290157.1880293601];
      var d = [413730.38500161114, 289723.21580549626];
      var hit = geom.segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      // Two hits: a T-intersection and a cross
      assert.equal(hit.length, 4);
    });

    it('Data from polygons/ex1.shp -- Collinear segments with one shared endpoint', function() {
      /*
      arc 6
      i1  26
      i2  27
      x1  13.3113098
      y1  38.1946564
      x2  13.3092499
      y2  38.1946564

      arc 11
      i1  71
      i2  72
      x1  13.3113098
      y1  38.1946564
      x2  13.3106232
      y2  38.1946564
      */
      var a = [13.3113098, 38.1946564],
          b = [13.3092499, 38.1946564],
          c = [13.3113098, 38.1946564],
          d = [13.3106232, 38.1946564];
      var hit = geom.segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      assert.deepEqual(hit, [13.3106232, 38.1946564]); // only interior endpoint is detected as point of intersection
    });

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
