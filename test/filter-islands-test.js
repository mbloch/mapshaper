var assert = require('assert'),
    api = require("../");

describe('mapshaper-filter-islands.js', function () {
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

    it ('-filter-islands remove-empty', function(done) {
      api.applyCommands('-filter-islands remove-empty', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 1);
        assert.deepEqual(output.features[0], geojson.features[0])
        done();
      });
    })

    it ('-filter-islands min-area=', function(done) {
      var target = {
        type: 'Polygon',
        coordinates: [[[1, 100], [1, 200], [2, 200], [2, 100], [1, 100]]]
      };
      api.applyCommands('-filter-islands min-area=1', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 2);
        assert.deepEqual(output.features[0].geometry, target);
        done();
      });
    })

    it ('-filter-islands min-vertices=', function(done) {
      var target = {
        type: 'Polygon',
        coordinates: [[[1, 100], [1, 200], [2, 200], [2, 100], [1, 100]]]
      };
      api.applyCommands('-filter-islands min-vertices=4', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 2);
        assert.deepEqual(output.features[0].geometry, target);
        done();
      });
    })

    it ('-filter-islands (combined options)', function(done) {
      api.applyCommands('-filter-islands remove-empty min-vertices=8', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.deepEqual(output.features, []);
        done();
      });
    })

  })

})