
import api from '../mapshaper.js';
import assert from 'assert';
var TopoJSON = api.internal.topojson;

// removed these functions from mapshaper.js build
/*
describe('topojson-split-test.js', function () {
  describe('#reindexArcIds()', function () {
    it ("re-indexes polygon ids", function() {
      var arcs = [[1, 2], [-2, 4]],
          index = [0, 0, 1, 0, 2],
          obj = {
            type: "Polygon",
            arcs: arcs
          };
      TopoJSON.reindexArcIds(obj, index);
      assert.deepEqual(arcs, [[0, 1], [-1, 2]]);
    })

    it ("re-indexes geometry collection ids", function() {
      var arcs1 = [[-5, 2]],
          arcs2 = [[[-2, -3]], [[1]]],
          index = [0, 0, 1, 0, 2],
          obj = {
            type: "GeometryCollection",
            geometries: [
              {
                type: "Polygon",
                arcs: arcs1
              }, {
                type: "MultiPolygon",
                arcs: arcs2
              }
            ]
          };
      TopoJSON.reindexArcIds(obj, index);
      assert.deepEqual(arcs1, [[-3, 1]]);
      assert.deepEqual(arcs2, [[[-1, -2]], [[0]]]);
    })
  })
})
*/
