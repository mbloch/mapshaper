
import api from '../mapshaper.js';
import assert from 'assert';

var TopoJSON = api.internal.topojson;


describe('mapshaper-metadata.js', function () {

  describe('Import/export tests', function() {
    it('projected CRS is imported, reprojected and exported', function(done) {
      var input = {
        type: "Topology",
        metadata: {
          proj4: "+proj=merc"
        },
        arcs: [],
        objects: {
          point: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [0, 10000]
            }]
          }
        }
      };
      var cmd = '-i data.json -proj wgs84 -o no-quantization metadata';
      api.applyCommands(cmd, {'data.json': input}, function(err, out) {
        var topology = JSON.parse(out['data.json']);
        assert.equal(topology.metadata.proj4, '+proj=longlat +datum=WGS84');

        done();
      });

    })

  })

})
