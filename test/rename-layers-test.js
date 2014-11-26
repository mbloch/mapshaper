var assert = require('assert'),
    api = require("../");

describe('mapshaper-rename-layers.js', function () {
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