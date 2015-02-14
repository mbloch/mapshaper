var api = require('../'),
  assert = require('assert'),
  format = api.utils.format;

describe('mapshaper-database-utils.js', function () {

  describe('findMatchingLayers()', function () {

    it("simple match", function () {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'layer1'),
        [{name: 'layer1'}]);
    })

    it("missing layer", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'layer3'),[]);
    });

    it("comma sep. + wildcard", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'points,layer*'),
        [{name: 'points'}, {name: 'layer1'}, {name: 'layer2'}]);
    })

    it("all layers (*)", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '*'),
        [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}]);
    })

    it("numerically indexed layers", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '0,2'),
        [{name: 'layer1'}, {name: 'points'}]);
    })

    it("no dupes", function() {
      var layers = [{name: 'points'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '1,layer2,layer*,1'),
        [{name: 'layer2'}]);
    })

  })
})
