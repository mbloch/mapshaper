import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #356 (Error importing TopoJSON with empty rings array)', function () {

  it('TopoJSON test', function() {
    var input = {
      type: "Topology",
      arcs: [[[0, 0], [1, 1], [1, 0], [0, 0]]],
      objects: {
        data: {
          type: "GeometryCollection",
          geometries: [{
            type: "Polygon",
            arcs: [[0]]
          }, {
            type: "Polygon",
            arcs: []
          }]
        }
      }
    };
    var output = api.internal.importTopoJSON(input);
    assert.deepEqual(output.layers[0].shapes, [[[0]], null]);
  });

  it('GeoJSON test', function() {
    var input = {
      type: "GeometryCollection",
      geometries: [{
        type: "Polygon",
        coordinates: []
      }, {
        type: "Polygon",
        coordinates: [[]]
      }, {
        type: "LineString",
        coordinates: []
      }, {
        type: "Polygon",
        coordinates: [[[0, 0], [1, 1], [1, 0], [0, 0]]]
      }]
    };
    var output = api.internal.importGeoJSON(input);
    assert.deepEqual(output.layers[0].shapes, [null, null, null, [[0]]]);
    assert.deepEqual(output.arcs.toArray(), [[[0, 0], [1, 1], [1, 0], [0, 0]]]);
  });

});
