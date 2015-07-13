var assert = require('assert'),
    api = require("../"),
    internal = api.internal;

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

    it ('empty expression throws an error', function(done) {
      api.applyCommands('-filter ""', JSON.stringify(geojson), function(err) {
        assert.equal(err.name, 'APIError');
        done();
      });
    })

    it ('-filter preserves layer name', function(done) {
      var lyr = {
        name: 'foo',
        geometry_type: 'point',
        shapes: [[[0,0]]]
      },
      dataset = {layers: [lyr]},
      parsed = internal.parseCommands('-filter "true"');
      internal.runParsedCommands(parsed, dataset, function(err, dataset) {
        if (err) throw err;
        assert.equal(dataset.layers[0].name, 'foo');
        done();
      });
    })

    it ('-filter + ...', function(done) {
      // filter a layer with no-replace; check that modifying data in the filtered layer does not change the source layer.
      api.applyCommands('-filter \'name == "b"\' + name=filtered -each target=filtered \'name="foo"\'', geojson, function(err, data) {
        assert.equal(data.length, 2);
        var output1 = JSON.parse(data[0]);
        var output2 = JSON.parse(data[1]);
        assert.deepEqual(geojson, output1);
        assert.deepEqual(output2.features[0].properties, {name: 'foo'})
        assert.equal(output2.features.length, 1);
        done();
      });
    })

    it ('-filter remove-empty', function(done) {
      api.applyCommands('-filter remove-empty', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 1);
        assert.deepEqual(output.features[0], geojson.features[0])
        done();
      });
    })

    it ('-filter (combined options)', function(done) {
      api.applyCommands('-filter remove-empty "name != \'a\'"', geojson, function(err, json) {
        var output = JSON.parse(json);
        var target = {type: "GeometryCollection", geometries: []}; // empty
        assert.deepEqual(output, target);
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