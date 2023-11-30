import assert from 'assert';
import api from '../mapshaper.js';
var internal = api.internal;

describe('mapshaper-filter.js', function () {

  describe('Command line options', function() {
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
        assert.equal(err.name, 'UserError');
        done();
      });
    })

    it ('-filter preserves layer name', function(done) {
      var lyr = {
        name: 'foo',
        geometry_type: 'point',
        shapes: [[[0,0]]]
      },
      catalog = new internal.Catalog().addDataset({layers: [lyr]}),
      job = new internal.Job(catalog),
      parsed = internal.parseCommands('-filter "true"');
      internal.runParsedCommands(parsed, job, function(err, job) {
        if (err) throw err;
        assert.equal(job.catalog.getActiveLayer().layer.name, 'foo');
        done();
      });
    })

    it ('-filter + ...', function(done) {
      // filter a layer with no-replace; check that modifying data in the filtered layer does not change the source layer.
      api.applyCommands('-filter \'name == "b"\' + name=filtered -each target=filtered \'name="foo"\'', geojson, function(err, data) {
        if (err) console.log(err);
        var output = JSON.parse(data);
        assert.deepEqual(output.features[0].properties, {name: 'foo'})
        assert.equal(output.features.length, 1);
        done();
      });
    })

    it ('-filter remove-empty', function(done) {
      api.applyCommands('-filter remove-empty -o gj2008', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 1);
        assert.deepEqual(output.features[0], geojson.features[0])
        done();
      });
    })

    it ('-filter remove-empty with invert option', function(done) {
      api.applyCommands('-filter invert remove-empty', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 1);
        assert.deepEqual(output.features[0], geojson.features[1])
        done();
      });
    })

    it('-filter ids=', function(done) {
      var cmd = '-i data.csv -filter ids=3,5 -o';
      var input = 'name\na\nb\nc\nd\ne\nf\ng\nh';
      api.applyCommands(cmd, {'data.csv': input}, function(err, out) {
        var output = out['data.csv'];
        assert.equal(output, 'name\nd\nf');
        done();
      })

    });

    it ('-filter (combined options)', function(done) {
      api.applyCommands('-filter remove-empty "name != \'a\'"', geojson, function(err, json) {
        var output = JSON.parse(json);
        var target = {type: "GeometryCollection", geometries: []}; // empty
        assert.deepEqual(output, target);
        done();
      });
    })

    it ('-filter bbox= option with points', function(done) {
      var points = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [0, 0]
        }, {
          type: 'Point',
          coordinates: [2, 2]
        }, {
          type: 'MultiPoint',
          coordinates: [[2, 2], [0, 0]]
        }]
      };
      api.applyCommands('-i points.json -filter bbox=1,1,3,3 -o', {'points.json': points}, function(err, out) {
        var output = JSON.parse(out['points.json'])
        assert.deepEqual(output.geometries, [{
            type: 'Point',
            coordinates: [2, 2]
          }, {
            type: 'MultiPoint',
            coordinates: [[2, 2], [0, 0]] // entire feature is retained, including point outside bbox
          }]);
        done();
      });
    })

    it ('-filter expression and bbox= option with points', function(done) {
      var points = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [0, 0]
        }, {
          type: 'Point',
          coordinates: [2, 2]
        }, {
          type: 'MultiPoint',
          coordinates: [[2, 2], [0, 0]]
        }]
      };
      api.applyCommands('-i points.json -filter "this.id != 2" bbox=1,1,3,3 -o', {'points.json': points}, function(err, out) {
        var output = JSON.parse(out['points.json'])
        assert.deepEqual(output.geometries, [{
            type: 'Point',
            coordinates: [2, 2]
          }]);
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
      api.cmd.filterFeatures(lyr, nullArcs, {expression: "foo == 2"});
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
      api.cmd.filterFeatures(lyr, nullArcs, {expression: "$.partCount > 1"});
      assert.deepEqual(lyr.data.getRecords(), [{foo: 0}]);
      assert.deepEqual(lyr.shapes, [[[0], [1]]]);
    })
  })
})