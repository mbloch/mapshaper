import api from '../mapshaper.js';
import assert from 'assert';

describe('mapshaper-run.js', function () {
  describe('-run command', function () {

    it('supports target.geojson getter', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}, {foo: 'bam'}];
      var include = '{ \
        getCommand: function(target) { \
          var input = [target.geojson.features[1].properties]; \
          return "-i " + JSON.stringify(input); \
        }}';
      var cmd = '-i data.json -include include.js -run getCommand(target) -o';
      var out = await api.applyCommands(cmd, {'include.js': include, 'data.json': data});
      assert.deepEqual(JSON.parse(out['layer.json']), [{foo: 'baz'}])
    })

    it('target.geojson getter return rfc 7946 compliant polygons', async function() {
      var data = {
        type: 'Feature',
        properties: {name: 'Fred'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        }
      };
      var include = '{ \
        getCommand: function(target) { \
          var input = target.geojson.features[0]; \
          return "-i " + JSON.stringify(input); \
        }}';
      var cmd = '-i data.json -include include.js -run getCommand(target) -o';
      var out = await api.applyCommands(cmd, {'include.js': include, 'data.json': data});
      var target = {type: 'FeatureCollection', features: [{
        type: 'Feature',
        properties: {name: 'Fred'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
      }]};
      var json = JSON.parse(out['layer.json']);
      assert.deepEqual(json, target);
    })


   it('supports target.geojson getter and io.addInputFile()', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}, {foo: 'bam'}];
      var include = '{ \
        getCommand: function(target, io) { \
          io.addInputFile("selection.json", [target.geojson.features[2].properties]); \
          return "-i selection.json"; \
        }}';
      var cmd = '-i selection.json -include include.js -run getCommand(target,io) -o';
      var out = await api.applyCommands(cmd, {'include.js': include, 'selection.json': data});
      assert.deepEqual(JSON.parse(out['selection.json']), [{foo: 'bam'}])
    })

   it('supports io.ifile() alias', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}, {foo: 'bam'}];
      var include = '{ \
        subset: async function(fc) { \
          return [fc.features[2].properties]; \
        }}';
      var cmd = `-i data.json -include include.js
        -run '{io.ifile("selection.json", subset(target.geojson))}' -o`;
      var out = await api.applyCommands(cmd, {'include.js': include, 'data.json': data});
      assert.deepEqual(JSON.parse(out['selection.json']), [{foo: 'bam'}])
    })

    it('supports creating a command on-the-fly and running it', function (done) {
      var data = [{foo: 'bar'}];
      var include = '{ \
        getCommand: function(target) { \
          return "-rename-layers " + target.layer.name + "2"; \
        }}';
      var input = {
        'data.json': data,
        'include.js': include
      };
      var cmd = '-i data.json -include include.js -run "getCommand(target)" -o';
      api.applyCommands(cmd, input, function(err, result) {
        assert('data2.json' in result);
        done();
      })
    })

    it('does not require a target', async function() {
      var data = [{foo: 'bar'}];
      var cmd = `-run "-define n=42" -i data.json -each 'value = n' -o format=csv`;
      var output = await api.applyCommands(cmd, {'data.json': data});
      assert.equal(output['data.csv'], 'foo,value\nbar,42');
    })

    it('supports adding JSON data in an external function', async function() {
      var cmd = '-require test/data/features/run/includes1.js -run getCommand(io) -o';
      var out = await api.applyCommands(cmd);
      assert.deepEqual(JSON.parse(out['data.json']), [{"foo": "bar"}]);
    });

    it('supports adding JSON data in an external function 2', async function() {
      var data = {
        'type': 'Feature',
        'geometry': {
          type: 'Point',
          coordinates: [0, 0]
        },
        'properties': {foo: 'bar'}
      };
      var include = `{
        getCommand: function(io) {
          io.addInputFile('data.json', ${JSON.stringify(data)});
          return '-i data.json';}
        }`;
      var cmd = '-include include.js -run "getCommand(io)" -o out.json';
      var output = await api.applyCommands(cmd, {'include.js': include});
      var outputFeature = JSON.parse(output['out.json']).features[0];
      assert.deepEqual(outputFeature, data);
    });


    it('error if function does not return a string', async function() {
      var include = `{
        getCommand: async function() {
          return [{foo: 'bar'}];
        }}`;
      var cmd = '-include include.js -run "getCommand()" -o out.json';
      var promise = api.applyCommands(cmd, {'include.js': include});
      await assert.rejects(promise);
    })

    it('supports running an async function', async function() {
      var include = `{
        getCommand: async function() {
          return "-rectangle bbox=0,0,1,1";
        }}`;
      var input = {
        'include.js': include
      };
      var cmd = '-include include.js -run "getCommand()" -o out.json';
      var output = await api.applyCommands(cmd, input);
      var data = JSON.parse(output['out.json']);
      assert.equal(data.type, 'GeometryCollection');
    })

    it('fix: -o command does not remove data', async function() {
      console.log('TODO: fully support -o in -run commands');
      var include = `{
        run: function() {
          return "-rectangle bbox=0,0,1,1";
        }}`;
      var input = {
        'include.js': include
      };
      var cmd = '-include include.js -run "run()" -o out2.json';
      var output = await api.applyCommands(cmd, input);
      assert (!!output['out2.json'])
    })
  })
})