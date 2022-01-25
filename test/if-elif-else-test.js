var api = require('..'),
    assert = require('assert');

describe('mapshaper-if-elif-else-endif.js', function () {
  it ('test empty flag', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if empty -each 'id = this.id' -else -each 'fid = this.id' \
      -endif -each 'name = name + name' -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'aa', fid: 0
      }, {
        name: 'bb', fid: 1
      }]);
      done();
    });
  });

  it ('test expression', function(done) {
    var data = {
      type: 'GeometryCollection',
      geometries: [{type: 'Point', coordinates: [1,2]}, {type: 'Point', coordinates: [2, 1]}]
    };
    var cmd = `-i data.json -if false -elif 'this.type == "point"' -each 'id = this.id' \
      -elif 'this.type == "point"' -each 'id = "BAR"' -endif -o format=json`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        id: 0
      }, {
        id: 1
      }]);
      done();
    });
  });

  it ('test not-empty flag', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if not-empty -each 'id = this.id' -else -each 'fid = this.id' \
      -endif -each 'name = name + name' -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'aa', id: 0
      }, {
        name: 'bb', id: 1
      }]);
      done();
    });
  });


})
