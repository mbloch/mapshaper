import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-rename-layers.js', function () {

  it ('Accept field names with spaces, in quotes', function(done) {
    var csv = 'County FIPS,"State FIPS"\n10001,10';
    api.applyCommands('-i csv.csv -rename-fields "CFIPS=County FIPS,SFIPS=State FIPS" -o format=json', {'csv.csv': csv}, function(err, output) {
      var json = JSON.parse(output['csv.json']);
      assert.deepEqual(json, [{CFIPS: 10001, SFIPS: 10}]);
      done();
    });
  });

  it ('Accept field names with spaces, with alternate quotes', function(done) {
    var csv = 'County FIPS,"State FIPS"\n10001,10';
    api.applyCommands('-i csv.csv -rename-fields CFIPS="County FIPS",SFIPS="State FIPS" -o format=json', {'csv.csv': csv}, function(err, output) {
      var json = JSON.parse(output['csv.json']);
      done();
    });
  });

  it ('Uses the default target by default', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c -o gj2008 target=*', {'a.json': a, 'b.json': b}, function(err, output) {
      assert.deepEqual(JSON.parse(output['a.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['c.json']).geometries[0], b);
      assert(!('b.json' in output));
      done();
    })
  })

  it ('Targets all layers when target=* is set', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c,d target=* -o gj2008 target=*', {'a.json': a, 'b.json': b}, function(err, output) {
      assert.deepEqual(JSON.parse(output['c.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['d.json']).geometries[0], b);
      done();
    })
  })

  it ('Supports assignment syntax like -rename-fields', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c=a,d=b target=* -o gj2008 target=*', {'a.json': a, 'b.json': b}, function(err, output) {
      assert.deepEqual(JSON.parse(output['c.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['d.json']).geometries[0], b);
      done();
    })
  })

  it ('Assignment syntax is limited to the target layers', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c=a,d=b -o gj2008 target=*', {'a.json': a, 'b.json': b}, function(err, output) {
      assert.deepEqual(JSON.parse(output['a.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['d.json']).geometries[0], b);
      assert(!('c.json' in output));
      done();
    })
  })

  it ('Matches unnamed layer', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    api.applyCommands('-i a.json -dissolve + -rename-layers c,d target=* -o gj2008 target=*', {'a.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['c.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['d.json']).geometries[0], a);
      done();
    })
  })

  it ('assign new names to layers', function() {
    var layers = [{}, {}],
        names = ['a', 'b'];
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'a'}, {name: 'b'}]);
  })

  it ('throws if there are fewer names than target layers', function() {
    var layers = [{}, {}],
        names = ['layer'];
    assert.throws(function() {
      api.cmd.renameLayers(layers, names);
    }, /Expected one name for each target layer/);
  })

  it ('throws if there are fewer names than target layers (multiple names)', function() {
    var layers = [{}, {}, {}, {}],
        names = ['counties', 'outline', 'innerlines'];
    assert.throws(function() {
      api.cmd.renameLayers(layers, names);
    }, /received 3 names for 4 target layers/);
  })

  it ('throws if there are more names than target layers', function() {
    var layers = [{}, {}],
        names = ['a', 'b', 'c'];
    assert.throws(function() {
      api.cmd.renameLayers(layers, names);
    }, /received 3 names for 2 target layers/);
  })

  it ('throws if names argument is empty', function() {
    var layers = [{}, {}],
        names = null;
    assert.throws(function() {
      api.cmd.renameLayers(layers, names);
    }, /received 0 names for 2 target layers/);
  })

  it ('throws if a single target layer has no names', function() {
    var layers = [{}],
        names = [];
    assert.throws(function() {
      api.cmd.renameLayers(layers, names);
    }, /received 0 names for 1 target layer/);
  })

  it ('can assign an empty name to a single target layer', function() {
    var layers = [{}],
        names = [''];
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: ''}]);
  })

  it ('returns a UserError when list names do not match target layers', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c,d', {'a.json': a, 'b.json': b}, function(err) {
      assert.equal(err.name, 'UserError');
      assert(/received 2 names for 1 target layer/.test(err.message));
      done();
    })
  })
});
