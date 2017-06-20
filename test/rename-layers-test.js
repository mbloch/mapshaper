var assert = require('assert'),
    api = require("../");

describe('mapshaper-rename-layers.js', function () {

  it ('All layers are targeted by default', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
    };
    var b = {
      type: 'Point',
      coordinates: [3, 3]
    };
    api.applyCommands('-i a.json -i b.json -rename-layers c,d -o target=*', {'a.json': a, 'b.json': b}, function(err, output) {
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
    api.applyCommands('-i a.json -dissolve + -rename-layers c,d -o target=*', {'a.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['c.json']).geometries[0], a);
      assert.deepEqual(JSON.parse(output['d.json']).geometries[0], a);
      done();
    })
  })

  it ('assign new names to layers', function() {
    var layers = [{}, {}],
        names = ['a', 'b'];
    api.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'a'}, {name: 'b'}]);
  })

  it ('use last name + count if more layers than names', function() {
    var layers = [{}, {}],
        names = ['layer'];
    api.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'layer1'}, {name: 'layer2'}]);
  })

  it ('use last name + count if more layers than names', function() {
    var layers = [{}, {}, {}, {}],
        names = ['counties', 'outline', 'innerlines'];
    api.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'counties'}, {name: 'outline'}, {name: 'innerlines1'}, {name: 'innerlines2'}]);
  })

  it ('ignore excess names', function() {
    var layers = [{}, {}],
        names = ['a', 'b', 'c'];
    api.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'a'}, {name: 'b'}]);
  })

  it ('use layer1, layer2, ... if names are missing', function() {
    var layers = [{}, {}],
        names = null;
    api.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'layer1'}, {name: 'layer2'}]);
  })

  it ('use layer1 for a single layer if no names are given', function() {
    var layers = [{}],
        names = [];
    api.renameLayers(layers, names);
    assert.deepEqual(layers, [{name: 'layer1'}]);
  })

});