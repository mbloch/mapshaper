var api = require('../'),
  assert = require('assert');

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-commands.js', function () {

  describe('runCommandString()', function () {
    var file1 = fixPath("test_data/two_states.shp"),
        file2 = fixPath("test_data/six_counties.shp");

    it("-fields", function () {
      var cmd = "-i " + file1 + " -fields NAME=STATE_NAME,FIPS";
      api.runCommandString(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), ['NAME', 'FIPS']);
      })
    })

    it('-dissolve', function() {
      var cmd = "-i " + file2 + " -dissolve + copy-fields NAME,STATE_FIPS sum-fields POP2000,MULT_RACE";
        api.runCommandString(cmd, function(err, data) {
        assert.equal(data.layers.length, 2);
        var lyr1 = data.layers[0]; // original lyr
        assert.equal(lyr1.data.size(), 6); // original data table hasn't been replaced

        var lyr2 = data.layers[1]; // dissolved lyr
        assert.deepEqual(lyr2.data.getRecords(),
            [{NAME: 'District of Columbia', STATE_FIPS: '11', POP2000: 1916238, MULT_RACE: 76770}]);
      })
    })

    it('-split', function() {
      var cmd = "-i " + file1 + " -split STATE";
      api.runCommandString(cmd, function(err, data) {
        assert.equal(data.layers.length, 2);
        assert.equal(data.layers[0].shapes.length, 1);
        assert.equal(data.layers[1].shapes.length, 1);
      })
    })

    it('-join', function() {
      var csv = fixPath("test_data/states.csv"),
          cmd = "-i " + file1 + " -join " + csv +
            " keys=FIPS,STATE_FIPS:str fields=POP2010,SUB_REGION",
          target = [{"STATE_NAME":"Oregon","FIPS":"41","STATE":"OR","LAT":43.94,"LONG":-120.55,"POP2010":3831074,"SUB_REGION":"Pacific"},
          {"STATE_NAME":"Washington","FIPS":"53","STATE":"WA","LAT":47.38,"LONG":-120.00,"POP2010":6724540,"SUB_REGION":"Pacific"}];
      api.runCommandString(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getRecords(), target);
      })

    })

  })

  describe('wildcardToRxp()', function () {
    var ex1 = "layer1"
    it(ex1, function () {
      assert.equal(api.utils.wildcardToRegExp(ex1).source, 'layer1');
    })

    var ex2 = "layer*";
    it(ex2, function() {
      assert.equal(api.utils.wildcardToRegExp(ex2).source, 'layer.*');
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
