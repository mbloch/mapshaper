var assert = require('assert'),
    api = require("../");

describe('mapshaper-filter.js', function () {
  describe('Command line tests', function() {
    var geojson = {
      type:"FeatureCollection",
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {
          type: "MultiPolygon",
          coordinates: [[[[1, 100], [1, 200], [2, 200], [2, 100], [1, 100]]],
              [[[1, 1], [1, 2], [2, 1], [1, 1]]]]
        }
      }, {
        type: 'Feature',
        properties: {name: 'b'},
        geometry: null
      }]
    };

    it ('-filter remove-empty', function(done) {
      api.applyCommands('-filter remove-empty', geojson, function(err, output) {
        assert.equal(output.features.length, 1);
        assert.deepEqual(output.features[0], geojson.features[0])
        done();
      });
    })

    it ('-filter (combined options)', function(done) {
      api.applyCommands('-filter remove-empty "name != \'a\'"', geojson, function(err, output) {
        assert.deepEqual(output.features, []);
        done();
      });
    })
  })


  describe('filter()', function () {
    var nullArcs = new api.internal.ArcCollection([]);
    it('removes records based on attribute value', function () {
      var records = [{foo: 0}, {foo: 2}];
      var lyr = {
        shapes: [[[0]], [[1]]],
        data: new api.internal.DataTable(records)
      };
      api.filterFeatures(lyr, nullArcs, {expression: "foo == 2"});
      assert.deepEqual(lyr.data.getRecords(), [{foo: 2}]);
      assert.deepEqual(lyr.shapes, [[[1]]]);
    })

    it('removes records based on shape geometry', function () {
      var records = [{foo: 0}, {foo: 2}];
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0], [1]], [[1]]],
        data: new api.internal.DataTable(records)
      };
      api.filterFeatures(lyr, nullArcs, {expression: "$.partCount > 1"});
      assert.deepEqual(lyr.data.getRecords(), [{foo: 0}]);
      assert.deepEqual(lyr.shapes, [[[0], [1]]]);
    })
  })
})