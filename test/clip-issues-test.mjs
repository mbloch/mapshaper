import api from '../mapshaper.js';
import assert from 'assert';
var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-clip-erase.js', function () {

  describe('Misc. clipping issues', function () {
    it('Issue #595: small valid holes in clipping shape getting removed', async function() {
      var clipped = 'test/data/issues/595_clip_error/clipped.json';
      var clipper = 'test/data/issues/595_clip_error/clipper.json';
      var cmd = `-i ${clipped} -clip ${clipper} -explode -o`;
      var out = await api.applyCommands(cmd);
      var json = JSON.parse(out['clipped.json']);
      // line is bisected by a small hole in a clipping polygon
      assert.equal(json.features.length, 2);
    });

    describe('Bug fix: clipping polygon is enclosed within target polygon and touches target polygon', function() {
      it('touches at one vertex', async function() {
        var clipFile = 'test/data/issues/clip_error/clip_shape.json';
        var targetFile = 'test/data/issues/clip_error/original_shape.json';
        var cmd = `-i ${targetFile} -clip ${clipFile} -o clipped.json`;
        var out = await api.applyCommands(cmd);
        var clipped = JSON.parse(out['clipped.json']);
        assert.equal(clipped.features.length, 1);
      });

      it('touches at three vertices', async function() {
        var clipFile = 'test/data/issues/clip_error/clip_shape2.json';
        var targetFile = 'test/data/issues/clip_error/original_shape.json';
        var cmd = `-i ${targetFile} -clip ${clipFile} -o clipped.json`;
        var out = await api.applyCommands(cmd);
        var clipped = JSON.parse(out['clipped.json']);
        assert.equal(clipped.features.length, 1);
      });

    });

    describe('Bug fix: using -clip command with no-replace and name= options', function() {
      it('should not duplicate input layer', function(done) {
        // Tests a fix for a bug affecting the -clip command when using '+ name=' arguments
        var poly = {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        };
        var input = {
          type: 'MultiPoint',
          coordinates: [[0.5, 0.5], [1.5, 1.5]]
        };
        api.applyCommands('-i poly.json points.json combine-files -target points -clip poly + name=clipped -o target=*',
            {'poly.json': poly, 'points.json': input},
            function(err, output) {
              var clipped = JSON.parse(output['clipped.json']);
              var points = JSON.parse(output['points.json']);
              assert.deepEqual(points.geometries[0], input);
              assert.deepEqual(clipped.geometries[0], {
                type: 'Point', coordinates: [0.5, 0.5]
              });
              done();
            });
      });
    })

    describe('inner2.json test', function () {
      it('polygon should not disappear after clipping', function (done) {
        // previously, inner2.json disappeared after clipping
        var cmd = '-i test/data/features/clip/ex1_inner2.json -clip test/data/features/clip/ex1_outer.json -o';
        api.applyCommands(cmd, {}, function(err, output) {
          var json = JSON.parse(output['ex1_inner2.json']);
          assert.equal(json.features[0].geometry.coordinates.length, 1); //
          done();
        })
      })
    })

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

        api.applyCommands('-i data -clip target=a bbox=-1,-1,1.5,1.5 -o format=geojson gj2008 target=*', {data: boxes}, function(err, output) {
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

        api.applyCommands('-i clipper.json -i clipped.json -clip clipper -o gj2008 target=*', {'clipper.json': clipper, 'clipped.json': clipped}, function(err, output) {
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
        api.applyCommands('-i poly.json -clip bbox=-10,0,0,10 -o gj2008', {'poly.json': polygon}, function(err, output) {
          if (err) throw err
          var geojson = JSON.parse(output['poly.json']);
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
        api.applyCommands('-i poly.json -clip bbox=-1,0,0,1 -o gj2008', {'poly.json': polygon}, function(err, output) {
          var geojson = JSON.parse(output['poly.json']);
          var coords = geojson.geometries[0].coordinates[0];
          // slightly out-of-range coordinates are tolerated now
          assert.deepEqual(coords, [[-0.9,0.4],[-0.4,0.4],[-0.4,0],[-0.9,-1.734723475976807e-18], [-0.9, 0.4]])
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
        api.applyCommands('-i poly.json -clip bbox=0,-90,90,90 -o', {'poly.json': geojson}, function(err, output) {

          if (err) throw err
          var geojson = JSON.parse(output['poly.json']);
          assert(!!geojson.features[0].geometry.coordinates);
          assert(!!geojson.features[1].geometry.coordinates);
          done();
        });
      })

    })

  })

})