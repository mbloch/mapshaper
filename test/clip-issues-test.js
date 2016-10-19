var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-clip-erase.js', function () {

  describe('Misc. issues', function () {

    it('Issue: bbox clipping can fail along almost-parallel segments', function(done) {
      var polygon = {
        type: "Polygon",
        coordinates: [[[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,-1.734723475976807e-18],[-0.9,0.4]]]
      };
      api.applyCommands('-clip bbox=-1,0,0,1', polygon, function(err, output) {
        var geojson = JSON.parse(output);
        var coords = geojson.geometries[0].coordinates[0];
        assert.deepEqual(coords, [[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,0], [-0.9, 0.4]])
        done();
      });
    })
  })

})