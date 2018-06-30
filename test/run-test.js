var api = require('../'),
    assert = require('assert');

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
  })
})