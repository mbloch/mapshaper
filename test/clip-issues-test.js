var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-clip-erase.js', function () {

  describe('Misc. clipping issues', function () {

    describe('Issue: bbox clipping can fail along almost-parallel segments', function () {

      it('test 1', function(done) {
        // Polygon contains coords of clipped county that had been disappearing after
        // bbox clipping
        var polygon = {
          type: "Polygon",
          coordinates: [[[-5,0.4],[-4,0.4],[-4,8.673617379884035e-19],[-5,0],[-5,0.4]]]
        };
        api.applyCommands('-clip bbox=-10,0,0,10', polygon, function(err, output) {
          if (err) throw err
          var geojson = JSON.parse(output);
          var coords = geojson.geometries[0].coordinates[0];
          assert.deepEqual(coords, [[-5,0.4],[-4,0.4],[-4,8.673617379884035e-19],[-5,0],[-5,0.4]])
          done();
        });
      })

      it('test 2', function(done) {
        // Polygon had been disappearing after bbox clipping
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

      it('test 3', function() {
        // Coords of two simplified counties that had been disappearing after
        // bbox clipping
        var geojson = {"type":"FeatureCollection","features":[
          {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.07743991381154576,-7.903170760234177],[0.13322915296487942,-8.237697197954503],[-0.27135433200713655,-8.532257229768865],[-0.5600689007971446,-8.250514088134027],[-0.07743991381154576,-7.903170760234177]]]},"properties":{"GEOID":"48481"}},
          {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.07743991381154576,-7.903170760234177],[0.1510172129721194,-7.718678964010099],[0.5017038816766441,-7.922859553851434],[0.13322915296487942,-8.237697197954503],[-0.07743991381154576,-7.903170760234177]]]},"properties":{"GEOID":"48157"}}
          ]};
        api.applyCommands('-clip bbox=0,-90,90,90', geojson, function(err, output) {
          if (err) throw err
          var geojson = JSON.parse(output);
          assert(!!geojson.geometries[0]);
          assert(!!geojson.geometries[1]);
          done();
        });
      })

    })

  })

})