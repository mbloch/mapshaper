var api = require('../'),
    assert = require('assert');


describe('mapshaper-include.js', function () {
  describe('-include command', function () {
    // TODO: test importing keys that are not valid JS variable names

    it('imports data and functions from JS string', function (done) {
      var o = "{ \
        foo: 'bar', \
        getA: function(rec) {return rec.a} \
      }";
      var input = [{a: 1}, {a: 2}];
      var cmd = '-i in.json -include in.js -each "b = foo + this.id, c = getA(this.properties)" -o out.json';
      api.applyCommands(cmd, {'in.json': input, 'in.js': o}, function(err, out) {
        assert.deepEqual(JSON.parse(out['out.json']), [
          {a: 1, b: 'bar0', c: 1},
          {a: 2, b: 'bar1', c: 2}])
        done();
      })
    })

    it('can come first in command string; values cover existing fields', function(done) {
      var o = {a: 'b'};
      var input = [{}];
      var cmd = '-include in.js -i data.json -each "this.properties.a = a" -o';
      api.applyCommands(cmd, {'in.js': o, 'data.json': input}, function(err, out) {
        assert.deepEqual(JSON.parse(out['data.json']), [{a: 'b'}]);
        done();
      });
    });
  })
})