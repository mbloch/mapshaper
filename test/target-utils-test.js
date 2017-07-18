var api = require('../'),
  assert = require('assert');

describe('mapshaper-target-utils.js', function () {
  describe('findMatchingLayers()', function () {

    it("simple match", function () {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];

      assert.deepEqual(api.internal.findMatchingLayers(layers, 'layer1'),
        [{name: 'layer1', match_id: 0}]);
    })

    it("missing layer", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'layer3'),
        []);
    });

    it("comma sep. + wildcard", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'points,layer*'),
         [{name: 'points', match_id: 0}, {name: 'layer1', match_id: 1}, {name: 'layer2', match_id: 2}
         ]);
    })

    it("all layers (*)", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '*'),
        [{name: 'layer1', match_id: 0}, {name: 'layer2', match_id: 1},
        {name: 'points', match_id: 2}, {name: 'polygons', match_id: 3}]);
    })

    it("numerically indexed layers", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      var matches = api.internal.findMatchingLayers(layers, '1,3');
      assert.deepEqual(matches,
       [{name: 'layer1', match_id: 0}, {name: 'points', match_id: 1}]);
    })

    it("no dupes", function() {
      var layers = [{name: 'points'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '2,layer2,layer*,2'),
        [{name: 'layer2', match_id: 0}]);
    })

    it("layers with same suffix", function() {
        var layers = [{name: 'cz'}, {name: 'cz-points'}];
        assert.deepEqual(api.internal.findMatchingLayers(layers, 'cz'),
          [{name: 'cz', match_id: 0}])
    })

  })


})
