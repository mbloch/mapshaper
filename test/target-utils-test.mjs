import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-target-utils.js', function () {
  describe('findMatchingLayers()', function () {

    // shim so old tests will run against the current function signature
    function findMatchingLayers(layers, pattern) {
      layers = layers.map(lyr => ({layer: lyr}));
      return api.internal.findMatchingLayers(layers, pattern).map(o => o.layer);
    }

    it("simple match", function () {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];

      assert.deepEqual(findMatchingLayers(layers, 'layer1'),
        [{name: 'layer1'}]);
    })

    it("missing layer", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];
      assert.deepEqual(findMatchingLayers(layers, 'layer3'),
        []);
    });

    it("comma sep. + wildcard", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(findMatchingLayers(layers, 'points,layer*'),
         [{name: 'points'}, {name: 'layer1'}, {name: 'layer2'}
         ]);
    })

    it("all layers (*)", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(findMatchingLayers(layers, '*'),
        [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}]);
    })

    it("numerically indexed layers", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      var matches = findMatchingLayers(layers, '1,3');
      assert.deepEqual(matches,
       [{name: 'layer1'}, {name: 'points'}]);
    })

    it("no dupes", function() {
      var layers = [{name: 'points'}, {name: 'layer2'}];
      assert.deepEqual(findMatchingLayers(layers, '2,layer2,layer*,2'),
        [{name: 'layer2'}]);
    })

    it("layers with same suffix", function() {
        var layers = [{name: 'cz'}, {name: 'cz-points'}];
        assert.deepEqual(findMatchingLayers(layers, 'cz'),
          [{name: 'cz'}])
    })

    it('unmatched layer throws if flag is passed and no layer is matched', function() {
      var layers = [{layer: {name: 'foo'}}];
      assert.throws(function() {
        api.internal.findMatchingLayers(layers, 'bar', true)
      });
      // (but doesn't throw if layer is matched)
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'foo', true), layers);
    })

  })


})
