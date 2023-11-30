import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


describe('mapshaper-define.js', function () {

  it('adds a variable to the expression context',function(done) {
    var json = [{foo: 'bar'}];
    var cmd = `-i data.json -define 'bar = "foo"' -each 'baz = bar' -o`;
    api.applyCommands(cmd, {'data.json': json}, function(err, out) {
      assert.deepEqual(JSON.parse(out['data.json']), [{foo: 'bar', baz: 'foo'}])
      done();
    });
  });

  it('global object',function(done) {
    var json = [{foo: 'bar'}];
    var cmd = `-i data.json -define 'global.bar = "foo"' -each 'baz = global.bar' -o`;
    api.applyCommands(cmd, {'data.json': json}, function(err, out) {
      assert.deepEqual(JSON.parse(out['data.json']), [{foo: 'bar', baz: 'foo'}])
      done();
    });
  });

  it('global object used as accumulator',function(done) {
    var json = [{foo: 3}, {foo: 5}];
    var cmd = `-i data.json -define 'total = 0' -each 'global.total += foo, sum = global.total' -o`;
    api.applyCommands(cmd, {'data.json': json}, function(err, out) {
      assert.deepEqual(JSON.parse(out['data.json']), [{foo: 3, sum: 3}, {foo: 5, sum: 8}]);
      done();
    });
  });

});
