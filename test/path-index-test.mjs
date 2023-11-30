import api from '../mapshaper.js';
import assert from 'assert';
var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-path-index.js', function () {

  describe('findSmallestEnclosingPolygon()', function () {

    it('Finds id of smallest enclosing ring from a collection of nested rings', function() {
      var input = {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
          }, {
            type: 'Polygon',
            coordinates: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
          }, {
            type: 'Polygon',
            coordinates: [[[-1,-1], [-1, 4], [4, 4], [4, -1], [-1, -1]]]
          }, {
            type: 'Polygon',
            coordinates: [[[1.1, 1.1], [1.9, 1.1], [1.9, 1.9], [1.1, 1.9], [1.1, 1.1]]]
          }
        ]
      };
      var dataset = api.internal.importGeoJSON(input, {});
      var shapes = dataset.layers[0].shapes;
      var index = new api.internal.PathIndex(shapes, dataset.arcs);
      assert.equal(index.findSmallestEnclosingPolygon([0]), 2);
      assert.equal(index.findSmallestEnclosingPolygon([1]), 0);
      assert.equal(index.findSmallestEnclosingPolygon([2]), -1);
      assert.equal(index.findSmallestEnclosingPolygon([3]), 1);
    });

    it('Ignores congruent polygons', function () {
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]] // CW
        }]
      };
      var dataset = api.internal.importGeoJSON(input, {});
      var shapes = dataset.layers[0].shapes;
      var index = new api.internal.PathIndex(shapes, dataset.arcs);

      assert.equal(index.findSmallestEnclosingPolygon([0]), -1);
      assert.equal(index.findSmallestEnclosingPolygon([~0]), -1);
      assert.equal(index.findSmallestEnclosingPolygon([1]), 0);
      assert.equal(index.findSmallestEnclosingPolygon([~1]), 0);
      assert.equal(index.findSmallestEnclosingPolygon([2]), 0);
      assert.equal(index.findSmallestEnclosingPolygon([~2]), 0);
      assert.deepEqual(shapes, [[[0]], [[1]], [[2]]]); // imported without topology
      assert.deepEqual(dataset.arcs.toArray(), [
          [[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]],
          [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]],
          [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]);
    })
  })

  describe('Fig. 1', function () {

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
    var arcs = new ArcCollection(coords),
        lyr1 = {
          shapes: [[[0]]]
        },
        lyr2 = {
          shapes: [[[1]]]
        };

    it('#pathIsEnclosed()', function () {
      var index = new api.internal.PathIndex(lyr1.shapes, arcs);
      assert.equal(index.pathIsEnclosed([1]), false)
    })

    it('#findEnclosedPaths()', function () {
      var index = new api.internal.PathIndex(lyr1.shapes, arcs);
      assert.deepEqual(index.findEnclosedPaths([1]), [[0]]);
    })


    it('#pathIsEnclosed() test 2', function () {
      var index = new api.internal.PathIndex(lyr2.shapes, arcs);
      assert.equal(index.pathIsEnclosed([0]), true)
    })

    it('#findEnclosedPaths() test 2', function () {
      var index = new api.internal.PathIndex(lyr2.shapes, arcs);
      assert.deepEqual(index.findEnclosedPaths([0]), null);
    })

  })


});