var api = require('../'),
    assert = require('assert');

describe('mapshaper-require.js', function () {
  describe('-require command', function () {
    it('require a named module and use it', function (done) {
      var json = [{foo: 'bar'}];
      var cmd = '-i in.json -require underscore alias=_ -each "str = _.isString(foo)" -o out.json';
      api.applyCommands(cmd, {'in.json': json}, function(err, result) {
        assert.deepEqual(JSON.parse(result['out.json']), [{foo: 'bar', str: true}]);
        done();
      });
    })

    it('require a module file and initialize it', function(done) {
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
