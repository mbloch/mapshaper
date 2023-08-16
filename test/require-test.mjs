import api from '../';
import assert from 'assert';


describe('mapshaper-require.js', function () {
  describe('-require command', function () {

    it('define a new command and run it', async function() {
      var json = [{foo: 'bar'}];
      var script = 'test/data/features/require/command1.js';
      var cmd = `-i data.json -require ${script} -set-foo baz -o`;
      var out = await api.applyCommands(cmd, {'data.json': json});
      var json = JSON.parse(out['data.json']);
      assert.deepEqual(json, [{foo: 'baz'}])
    });

    it('define a new command and run it 2', async function() {
      var json = [{lng: 0, lat: 1}];
      var script = 'test/data/features/require/command2.js';
      var cmd = `-i data.json -require ${script} -make-points x=lng y=lat -o`;
      var out = await api.applyCommands(cmd, {'data.json': json});
      var expect = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {lng: 0, lat: 1},
          geometry: {
            type: 'Point',
            coordinates: [0, 1]
          }
        }]
      };
      assert.deepEqual(JSON.parse(out['data.json']), expect)
    })

    it('require a named module and use it', function (done) {
      var json = [{foo: 'bar'}];
      var cmd = '-i in.json -require underscore alias=_ -each "str = _.isString(foo)" -o out.json';
      api.applyCommands(cmd, {'in.json': json}, function(err, result) {
        assert.deepEqual(JSON.parse(result['out.json']), [{foo: 'bar', str: true}]);
        done();
      });
    })

    it('-require does not require a target', function (done) {
      var json = [{foo: 'bar'}];
      var cmd = '-require underscore alias=_ -i in.json -each "str = _.isString(foo)" -o out.json';
      api.applyCommands(cmd, {'in.json': json}, function(err, result) {
        assert.deepEqual(JSON.parse(result['out.json']), [{foo: 'bar', str: true}]);
        done();
      });
    })

    it('-require accepts multiple targets', async function () {
      var a = [{foo: 'a'}], b = [{foo: 'b'}];
      var cmd = '-i a.json -i b.json -target * -require underscore alias=_ -merge-layers -each "str = _.isString(foo)" -o out.json';
      var out = await api.applyCommands(cmd, {'a.json': a, 'b.json': b});
      assert.deepEqual(JSON.parse(out['out.json']), [{foo: 'a', str: true}, {foo: 'b', str: true}]);
    })

    it('-require a module file and initialize it', function(done) {
      var json = [{foo: 'bar'}];
      var cmd = '-i in.json name=info -require test/data/features/require/test_module.js \
        init="setName(target.layer.name)" -each "layer_name = getName()" -o out.json';
      api.applyCommands(cmd, {'in.json': json}, function(err, result) {
        assert.deepEqual(JSON.parse(result['out.json']), [{foo: 'bar', layer_name: 'info'}]);
        done();
      });
    });
  })
})
