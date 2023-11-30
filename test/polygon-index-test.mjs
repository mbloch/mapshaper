import assert from 'assert';
import api from '../mapshaper.js';

var PolygonIndex = api.internal.PolygonIndex;

describe('mapshaper-polygon-index.js', function () {
  describe('Figure 1', function () {

    //       e
    //      / \
    //     /   \
    //    /  a  \
    //   /  / \  \
    //  h  d   b  f
    //   \  \ /  /
    //    \  c  /
    //     \   /
    //      \ /
    //       g
    //
    //   abcda, efghe
    //   0,     1

    var coords = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
        [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];

    var arcs = new api.internal.ArcCollection(coords);

    it ("simple polygon", function() {
      var shape = [[1]];  // outer ring
      var index = new PolygonIndex(shape, arcs);

      assert.equal(index.pointInPolygon(1, 1), 0);
      assert.equal(index.pointInPolygon(3, 1), -1);  // vertex
      assert.equal(index.pointInPolygon(5, 1), 0);
      assert.equal(index.pointInPolygon(5, 5), 0);
      assert.equal(index.pointInPolygon(3, 5), -1);  // vertex
      assert.equal(index.pointInPolygon(1, 3), -1);  // vertex
      assert.equal(index.pointInPolygon(3, 3), 1);
      assert.equal(index.pointInPolygon(4, 3), 1);
      assert.equal(index.pointInPolygon(2, 2), -1);  // on boundary
      assert.equal(index.pointInPolygon(4, 4), -1);  // on boundary
      assert.equal(index.pointInPolygon(3, -1), 0);   // below two vertices
    })

    it ("polygon with hole", function() {
      var shape = [[1], [~0]];
      var index = new PolygonIndex(shape, arcs);

      assert.equal(index.pointInPolygon(3, 3), 0);    // inside hole
      assert.equal(index.pointInPolygon(3, 1.5), 1);  // just below hole vertices
      assert.equal(index.pointInPolygon(3, 4.5), 1);  // just above hole vertices
      assert.equal(index.pointInPolygon(3.1, 1.5), 1); // inside donut
      assert.equal(index.pointInPolygon(2, 3), -1);   // on a hole vertex
      assert.equal(index.pointInPolygon(2, 2.9), 1);  // just below a hole vertex
      assert.equal(index.pointInPolygon(2, 3.1), 1);  // just above a hole vertex

    })

  })


  describe('Figure 2 -- rectangle', function () {

    // a - b - c
    // |       |
    // |       |
    // f - e - d
    //
    var coords = [[[0, 1], [0.5, 1], [1, 1], [1, 0], [0.5, 0], [0, 0], [0, 1]]];
    var arcs = new api.internal.ArcCollection(coords);
    var shape = [[0]];

    // edges and corners
    function testEdges(index) {
      assert.equal(index.pointInPolygon(0, 0), -1)
      assert.equal(index.pointInPolygon(1, 0), -1)
      assert.equal(index.pointInPolygon(1, 1), -1)
      assert.equal(index.pointInPolygon(0, 1), -1)
      assert.equal(index.pointInPolygon(0.5, 0), -1)
      assert.equal(index.pointInPolygon(0, 0.5), -1)
      assert.equal(index.pointInPolygon(1, 0.5), -1)
      assert.equal(index.pointInPolygon(0.5, 1), -1)
    }

    function testInside(index) {
      assert.equal(index.pointInPolygon(1 - 1e-12, 1 - 1e-12), 1)
      assert.equal(index.pointInPolygon(1e-12, 1e-12), 1)
      assert.equal(index.pointInPolygon(0.5, 0.5), 1)
    }

    function testOutside(index) {
      assert.equal(index.pointInPolygon(-1, 0.5), 0)
      assert.equal(index.pointInPolygon(2, 0.5), 0)
      assert.equal(index.pointInPolygon(1 + 1e-12, 0.5), 0)
      assert.equal(index.pointInPolygon(0.5, 1 + 1e12), 0)
      assert.equal(index.pointInPolygon(0.5, -1e-12), 0)
    }

    it('edges and corners - many buckets', function () {
      testEdges(new PolygonIndex(shape, arcs, {buckets: 100}));
    })

    it('outside - many buckets', function() {
      testOutside(new PolygonIndex(shape, arcs, {buckets: 100}));
    })

    it('inside - many buckets', function() {
      testInside(new PolygonIndex(shape, arcs, {buckets: 100}));
    })

    it('one bucket tests', function() {
      var index = new PolygonIndex(shape, arcs, {buckets: 1});
      testEdges(index);
      testOutside(index);
      testInside(index);
    })

    it('two bucket tests', function() {
      var index = new PolygonIndex(shape, arcs, {buckets: 2});
      testEdges(index);
      testOutside(index);
      testInside(index);
    })

  })

})