var assert = require('assert'),
    api = require("../");

describe('x_clipping_bug', function () {

  describe('mapshaper-clip-erase.js', function () {

    describe('Issue: bbox clipping can fail along almost-parallel segments', function () {

      it('test 2', function(done) {
        // Polygon had been disappearing after bbox clipping
        var polygon = {
          type: "Polygon",
          coordinates: [[[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,-1.734723475976807e-18],[-0.9,0.4]]]
        };
        api.applyCommands('-clip bbox=-1,0,0,1 -debug', polygon, function(err, output) {
          var geojson = JSON.parse(output);
          // console.log("err:", err, 'output:', geojson)
          var coords = geojson.geometries[0].coordinates[0];
          assert.deepEqual(coords, [[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,0], [-0.9, 0.4]])
          done();
        });
      })

    })
  })

})
