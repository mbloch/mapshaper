var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-clip-erase.js', function () {

  describe('Misc. clipping issues', function () {

    describe('Issue: arcs of non-clipped layers in the clipped dataset should not be deleted', function() {
      it('test1', function(done) {
        var boxes = {
          type: 'Topology',
          arcs: [
            [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]],
            [[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]]],
          objects: {
            a: {
              type: 'Polygon',
              arcs: [[0]],
              properties: {name: 'a'}
            },
            b: {
              type: 'Polygon',
              arcs: [[1]],
              properties: {name: 'b'}
            }
          }
        };

        api.applyCommands('-i data -clip target=a bbox=-1,-1,1.5,1.5 -o format=geojson target=*', {data: boxes}, function(err, output) {
          var a = JSON.parse(output['a.json']);
          var b = JSON.parse(output['b.json']);
          assert.deepEqual(a.features[0].geometry.coordinates, [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]])
          assert.deepEqual(b.features[0].geometry.coordinates, [[[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]]])
          done();

        });
      });
    })

    describe('Issue: arcs of clipping layer should not be modified', function() {
      it('test1', function(done) {
        var clipper = {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        };
        var clipped = {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [2, 1], [2, 0], [0, 0]]]
        }

        api.applyCommands('-i clipper.json -i clipped.json -clip clipper -o target=*', {'clipper.json': clipper, 'clipped.json': clipped}, function(err, output) {
          var clipped2 = JSON.parse(output['clipped.json']);
          var clipper2 = JSON.parse(output['clipper.json']);
          assert.deepEqual(clipper2.geometries[0].coordinates, [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]])
          assert.deepEqual(clipped2.geometries[0].coordinates, [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]])
          done();

        });
      });
    })


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

      it('test 3', function(done) {
        // Coords of two simplified counties that had been disappearing after
        // bbox clipping
        var geojson = {"type":"FeatureCollection","features":[
          {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.07743991381154576,-7.903170760234177],[0.13322915296487942,-8.237697197954503],[-0.27135433200713655,-8.532257229768865],[-0.5600689007971446,-8.250514088134027],[-0.07743991381154576,-7.903170760234177]]]},"properties":{"GEOID":"48481"}},
          {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.07743991381154576,-7.903170760234177],[0.1510172129721194,-7.718678964010099],[0.5017038816766441,-7.922859553851434],[0.13322915296487942,-8.237697197954503],[-0.07743991381154576,-7.903170760234177]]]},"properties":{"GEOID":"48157"}}
          ]};
        api.applyCommands('-clip bbox=0,-90,90,90', geojson, function(err, output) {

          if (err) throw err
          var geojson = JSON.parse(output);
          assert(!!geojson.features[0].geometry.coordinates);
          assert(!!geojson.features[1].geometry.coordinates);
          done();
        });
      })

    })

  })

})