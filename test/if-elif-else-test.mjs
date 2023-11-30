import api from '../mapshaper.js';
import assert from 'assert';


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

  // before, expressions like "A" == "A" were getting stripped of outer quotes
  // causing a syntax error
  it ('test string comparison', async function() {
    var json = [{foo: 'bar'}];
    var cmd = `-i data.json -if '"A" == "A"' -each 'foo = "baz"' -endif -o`;
    var out = await api.applyCommands(cmd, {'data.json': json});
    assert.deepEqual(JSON.parse(out['data.json']), [{foo: 'baz'}]);
  })


  it ('test this.size getter', function(done) {
    var data = {
      type: 'GeometryCollection',
      geometries: [{type: 'Point', coordinates: [1,2]}, {type: 'Point', coordinates: [2, 1]}]
    };
    var cmd = `-i data.json -if 'this.size === 2' -dissolve -each 'foo = "bar"'  -o format=json`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        foo: 'bar'
      }]);
      done();
    });
  });

  // not-empty was removed
  // it ('test not-empty flag', function(done) {
  //   var data = [{name: 'a'}, {name: 'b'}];
  //   var cmd = `-i data.json -if not-empty -each 'id = this.id' -else -each 'fid = this.id' \
  //     -endif -each 'name = name + name' -o`;
  //   api.applyCommands(cmd, {'data.json': data}, function(err, out) {
  //     var data = JSON.parse(out['data.json']);
  //     assert.deepEqual(data, [{
  //       name: 'aa', id: 0
  //     }, {
  //       name: 'bb', id: 1
  //     }]);
  //     done();
  //   });
  // });


  it ('test field_type(), field_exists() and field_includes()', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'this.field_exists("name")' -each 'a = true' -endif -if 'this.field_type("name") == "string"' -each 'b = true' -endif -if 'this.field_includes("name", "b")' -each 'c = true' -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'a', a: true, b: true, c: true
      }, {
        name: 'b', a: true, b: true, c: true
      }]);
      done();
    });
  });


  it ('test file_exists() function', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'file_exists("package.json")' -each 'name = "c"' -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'c'
      }, {
        name: 'c'
      }]);
      done();
    });
  });

  it ('test global namespace', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -calc 'N = count()' -if 'global.N === 2' -each 'name = "c"' -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'c'
      }, {
        name: 'c'
      }]);
      done();
    });
  });

  it ('test layer_exists() function', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'layer_exists("data")' -each 'name = "c"' -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'c'
      }, {
        name: 'c'
      }]);
      done();
    });
  });

  it ('test layer_exists() == false', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'layer_exists("foo") == false' -each 'name = "c"' -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'c'
      }, {
        name: 'c'
      }]);
      done();
    });
  });

  it ('test layer_exists(name, geotype)', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'layer_exists("data", "polygon")' -each 'name = "c"' -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{
        name: 'a'
      }, {
        name: 'b'
      }]);
      done();
    });
  });

  it ('test layer_exists(name, geotype) test2', function(done) {
    var table = [{name: 'a'}, {name: 'b'}];
    var point = {
      type: 'Feature',
      properties: {name: 'c'},
      geometry: {type: 'Point', coordinates: [3, 4]}
    };
    var cmd = `-i table.json point.json combine-files -target 1 name=data \
      -target 2 name=data -if 'layer_exists("data", "point")' -target data type=point -o`;
    api.applyCommands(cmd, {'table.json': table, 'point.json': point}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert.equal(data.type, 'FeatureCollection');
      done();
    });
  });

  it ('multiple target error', function(done) {
    var data1 = [{name: 'a'}, {name: 'b'}];
    var data2 = [{name: 'c'}, {name: 'd'}];
    var cmd = `-i a.json b.json combine-files -if '!empty' -each 'name = "c"' -endif -o`;
    api.applyCommands(cmd, {'a.json': data1, 'b.json': data2}, function(err, out) {
      assert(err && err.message.includes('This expression requires a single target'));
      done();
    });
  });
})
