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

  it ('All layers are targeted by default', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c,d -o gj2008 target=*', {'a.json': a, 'b.json': b}, function(err, output) {
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
    api.applyCommands('-i a.json -i b.json -rename-layers c=a,d=b -o gj2008 target=*', {'a.json': a, 'b.json': b}, function(err, output) {
      assert.deepEqual(JSON.parse(output['c.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['d.json']).geometries[0], b);
      done();
    })
  })

  it ('Matches unnamed layer', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    api.applyCommands('-i a.json -dissolve + -rename-layers c,d -o gj2008 target=*', {'a.json': a}, function(err, output) {
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

  it ('use last name + count if more layers than names', function() {
    var layers = [{}, {}],
        names = ['layer'];
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'layer1'}, {name: 'layer2'}]);
  })

  it ('use last name + count if more layers than names', function() {
    var layers = [{}, {}, {}, {}],
        names = ['counties', 'outline', 'innerlines'];
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'counties'}, {name: 'outline'}, {name: 'innerlines1'}, {name: 'innerlines2'}]);
  })

  it ('ignore excess names', function() {
    var layers = [{}, {}],
        names = ['a', 'b', 'c'];
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'a'}, {name: 'b'}]);
  })

  // it ('use layer1, layer2, ... if names are missing', function() {
  it ('use empty strings if names argument is empty', function() {
    var layers = [{}, {}],
        names = null;
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: ''}, {name: ''}]);
  })

  // it ('use layer1 for a single layer if no names are given', function() {
  it ('use empty string for a single layer if no names are given', function() {
    var layers = [{}],
        names = [];
    api.cmd.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: ''}]);
  })
});
