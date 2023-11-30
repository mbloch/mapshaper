import assert from 'assert';
import api from '../mapshaper.js';

describe('x_clipping_bug', function () {

  describe('mapshaper-clip-erase.js', function () {

    describe('Issue: bbox clipping can fail along almost-parallel segments', function () {

      it('test 2', function(done) {
        // Polygon had been disappearing after bbox clipping
        var polygon = {
          type: "Polygon",
          coordinates: [[[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,-1.734723475976807e-18],[-0.9,0.4]]]
        };
        api.applyCommands('-clip bbox=-1,0,0,1 -debug -o gj2008', polygon, function(err, output) {
          var geojson = JSON.parse(output);
          var coords = geojson.geometries[0].coordinates[0];

          // clipping command has changed: now very slightly out-of-bounds coordinates are tolerated
          // if present in the original dataset.
          // assert.deepEqual(coords, [[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,0], [-0.9, 0.4]])
          assert.deepEqual(coords, [[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,-1.734723475976807e-18], [-0.9, 0.4]])
          done();
        });
      })

    })
  })

})
