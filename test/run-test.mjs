import api from '../';
import assert from 'assert';


describe('mapshaper-run.js', function () {
  describe('-run command', function () {

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
      var cmd = `-run "'-define n=42'" -i data.json -each 'value = n' -o format=csv`;
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