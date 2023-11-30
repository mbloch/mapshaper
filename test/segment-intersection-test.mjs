import assert from 'assert';
import api from '../mapshaper.js';
var internal = api.internal;

function findIntersections(coords) {
  var arcs = new internal.ArcCollection(coords);
  return internal.findSegmentIntersections(arcs);
}

describe('mapshaper-segment-intersection.js', function () {

  describe('findSegmentIntersections()', function () {

    it('find collinear intersections (segs share one endpoint, seg A contained by B)', function () {
      var xx = findIntersections([[[1, 0], [2, 0]], [[0, 0], [2, 0]]]),
          // vertex id of segment endpoint is duplicated if intersection is at the endpoint
          target = [{x: 1, y: 0, a: [0, 0], b: [2, 3]}];
      assert.deepEqual(xx, target);
    })

    it('find collinear intersections 2 (segs are overlapping)', function () {
      var xx = findIntersections([[[1, 0], [3, 0]], [[0, 0], [2, 0]]]),
          // two intersections
          target = [{x: 1, y: 0, a: [0, 0], b: [2, 3]}, {x: 2, y: 0, a: [0, 1], b: [3, 3]}];
      internal.sortIntersections(xx);
      assert.deepEqual(xx, target);
    })

    it('find collinear intersections 3 (seg A contained by seg B)', function () {
      var xx = findIntersections([[[1, 0], [2, 0]], [[0, 0], [3, 0]]]),
          // two intersections
          target = [{x: 1, y: 0, a: [0, 0], b: [2, 3]}, {x: 2, y: 0, a: [1, 1], b: [2, 3]}];
      internal.sortIntersections(xx);
      assert.deepEqual(xx, target);
    })

    it('find collinear intersections 4 (path segs A and B fit to C)', function () {
      var xx = findIntersections([[[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 2]]]),
          // two intersections
          target = [{x: 1, y: 1, a: [1, 1], b: [3, 4]}];
      assert.deepEqual(xx, target);
    })

    it('find axis-aligned intersection', function () {
      var xx = findIntersections([[[0, 0], [3, 0]], [[2, -1], [2, 4]]]);
      // segment with smallest x is assigned to 'a'
      var target = [{x: 2, y: 0, a: [0, 1], b: [2, 3]}];
      assert.deepEqual(xx, target);
    })

    it('find axis-aligned intersection 2', function () {
      var xx = findIntersections([[[2, -1], [2, 4]], [[0, 0], [3, 0]]]),
          target = [{x: 2, y: 0, a: [0, 1], b: [2, 3]}];
      assert.deepEqual(xx, target);
    })

    it('find T intersection', function () {
      // one vertical segment
      var xx = findIntersections([[[1, 0], [1, 3]], [[2, 3], [1, 2], [0, 0]]]),
          // vertex id of segment endpoint is duplicated if intersection is at the endpoint
          target = [{x: 1, y: 2, a: [0, 1], b: [3, 3]}];
      assert.deepEqual(xx, target);
    })
  })

  describe('dedupIntersections()', function () {
    it('duplicate intersections are removed', function () {
      var arr = [
        {x: 0, y: 1, a: [2, 3], b: [5, 5]},
        {x: 3, y: 1, a: [0, 1], b: [6, 7]},
        {x: 0, y: 1, a: [2, 3], b: [5, 5]},
        {x: 3, y: 1, a: [0, 1], b: [6, 7]}];
      var target = [{x: 0, y: 1, a: [2, 3], b: [5, 5]},
        {x: 3, y: 1, a: [0, 1], b: [6, 7]}];
      assert.deepEqual(internal.dedupIntersections(arr), target);
    })
  })

  describe('formatIntersection()', function () {
    it('segment ids are sorted', function () {
      var xx = [0, 2, 1, 1],
          yy = [0, 0, -1, 1],
          o = internal.formatIntersection([1, 0], [3, 2], [1, 0], xx, yy);
      assert.deepEqual(o, {x: 1, y: 0, a: [0, 1], b: [2, 3]});
    })

    it('endpoint id is duplicated in T intersection', function () {
      var xx = [0, 2, 1, 1],
          yy = [0, 0, -1, 0],
          o = internal.formatIntersection([1, 0], [1, 0], [2, 3],  xx, yy);
      assert.deepEqual(o, {x: 1, y: 0, a: [0, 1], b: [3, 3]});
    })
  })

  describe('calcSegmentIntersectionStripeCount()', function () {
    it('Issue #49 test 1', function () {
      // collapsed islands
      var arcs = new internal.ArcCollection([
        [ [ -7162552.387146705, 731171.1486128338 ],
          [ -7162552.387146705, 731171.1486128338 ] ],
        [ [ -7152552.387146709, 736171.1486128359 ],
          [ -7152552.387146709, 736171.1486128359 ] ],
        [ [ -7152552.387146709, 736171.1486128359 ],
          [ -7152552.387146709, 736171.1486128359 ] ],
        [ [ -7156203.834442849, 758887.8997114667 ],
          [ -7156203.834442849, 758887.8997114667 ] ] ]);

      assert.equal(internal.calcSegmentIntersectionStripeCount(arcs), 1);
    })
  })

})
