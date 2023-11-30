import assert from 'assert';
import api from '../mapshaper.js';
var internal = api.internal;

describe('mapshaper-slivers.js', function () {
  describe('getSliverAreaFunction()', function () {
    it('higher strength -> lower effective area of a ring', function() {
      var geojson = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 2], [1, 2], [1, 0], [0, 0]]]
      };
      var dataset = internal.importGeoJSON(geojson, {});
      var a = internal.getSliverAreaFunction(dataset.arcs, 0);
      var b = internal.getSliverAreaFunction(dataset.arcs, 0.5);
      var c = internal.getSliverAreaFunction(dataset.arcs, 1);
      var ring = dataset.layers[0].shapes[0][0];
      assert(a(ring) > b(ring));
      assert(b(ring) > c(ring));
    })
  })

})
