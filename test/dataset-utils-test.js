var api = require('../'),
  assert = require('assert'),
  format = api.utils.format;

describe('mapshaper-database-utils.js', function () {

  describe('copyLayer()', function () {
    it('duplicate data records', function () {
      var lyr = {
        data: new api.internal.DataTable([{foo: 'a', bar: null}])
      };
      var copy = api.internal.copyLayer(lyr);
      assert.deepEqual(copy.data.getRecords(), lyr.data.getRecords());
      assert.notEqual(copy.data.getRecords()[0], lyr.data.getRecords()[0])
    })

    it('duplicate shapes', function () {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[1, 3]], null]
      };
      var copy = api.internal.copyLayer(lyr);
      assert.deepEqual(copy, lyr);
      assert.notEqual(copy.shapes[0], lyr.shapes[0])
    })
  })

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
        [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}]);
    })

    it("all layers (*)", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '*'),
        [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}]);
    })

    it("numerically indexed layers", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '1,3'),
        [{name: 'layer1'}, {name: 'points'}]);
    })

    it("no dupes", function() {
      var layers = [{name: 'points'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '2,layer2,layer*,2'),
        [{name: 'layer2'}]);
    })

    it("layers with same suffix", function() {
        var layers = [{name: 'cz'}, {name: 'cz-points'}];
        assert.deepEqual(api.internal.findMatchingLayers(layers, 'cz'), [{name: 'cz'}])
    })

  })
})
