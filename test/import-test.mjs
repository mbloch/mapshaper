import api from '../mapshaper.js';
import assert from 'assert';
import { Catalog } from '../src/dataset/mapshaper-catalog';

describe('mapshaper-import.js', function () {

  it('supports importing JSON data on the command line', async function() {
    var cmd = `-i '[\n{"foo": "bar"}\n]' '[{"foo": "baz"}]' combine-files -merge-layers name=data -o`;
    var out = await api.applyCommands(cmd);
    var data = JSON.parse(out['data.json']);
    assert.deepEqual(data, [{foo: 'bar'}, {foo: 'baz'}]);
  })

  it('supports importing JSON data on the command line (double quotes)', async function() {
    var cmd = `-i "[{\\"foo\\": \\"bar\\"}]" -o`;
    var out = await api.applyCommands(cmd);
    var data = JSON.parse(out['layer.json']);
    assert.deepEqual(data, [{foo: 'bar'}]);
  })

  it('supports importing JSON data on the command line, no quotes no spaces', async function() {
    var cmd = `-i [{"foo":"bar"}] -o`;
    var out = await api.applyCommands(cmd);
    var data = JSON.parse(out['layer.json']);
    assert.deepEqual(data, [{foo: 'bar'}]);
  })

  it('import a point GeoJSON and a csv file', async function() {
    var a = 'test/data/three_points.geojson',
        b = 'test/data/text/two_states.csv';
    var combined = await api.cmd.importFiles(new Catalog(), {files: [a, b]});
    assert(api.internal.getDatasetCRS(combined).is_latlong);
    assert.deepEqual(combined.info.input_files, ['test/data/three_points.geojson', 'test/data/text/two_states.csv']);
    assert.deepEqual(combined.info.input_formats, ['geojson', 'dsv']);
  })

  it('import a polygon Shapefile and a polygon GeoJSON file', async function() {
    var a = 'test/data/six_counties.shp',
        b = 'test/data/two_states.json',
        combined = await api.cmd.importFiles(new Catalog(), {files: [a, b]});
    assert(api.internal.getDatasetCRS(combined).is_latlong);
    // TODO: check geometry
  })

  it('importing a projected and an unprojected polygon file throws an error', async function() {
    var err;
    try {
      var a = 'test/data/two_states_mercator.shp',
          b = 'test/data/two_states.shp',
          combined = await api.cmd.importFiles(new Catalog(), {files: [a, b]});
    } catch(e) {
      err = e;
    }
    assert.equal(err.name, 'UserError');
  })

  it('issue #153 topology was ignored when using -i combine-files option', async function() {
    var a = 'test/data/issues/153/a.json',
        b = 'test/data/issues/153/b.json';
    var combined = await api.cmd.importFiles(new Catalog(), {files: [a, b]});

    var targetArcs = [ [ [ 1, 1 ], [ 1, 0 ] ],
        [ [ 1, 0 ], [ 0, 0 ], [ 0, 1 ], [ 1, 1 ] ],
        [ [ 1, 1 ], [ 2, 1 ], [ 2, 0 ], [ 1, 0 ] ] ];
    var targetA = {
      geometry_type: 'polygon',
      name: 'a',
      shapes: [[[0, 1]]]
    };
    var targetB = {
      geometry_type: 'polygon',
      name: 'b',
      shapes: [[[2, ~0]]]
    }
    assert.deepEqual(combined.arcs.toArray(), targetArcs)
    assert.deepEqual(combined.layers[0], targetA);
    assert.deepEqual(combined.layers[1], targetB);

  })

  describe('-i json-path option', function () {
    it('nested path, object input', function(done) {
      var data = {
        data: {
          records: [{foo: 'a'}, {foo: 'b'}]
        }
      };
      api.applyCommands('-i json-path=data/records data.json -o',
          {'data.json': data},function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepEqual(json, [{foo: 'a'}, {foo: 'b'}]);
        done();
      });
    });

    it('array notation', function(done) {
      var data = {
        data: {
          races: [{
            records: [{foo: 'a'}, {foo: 'b'}]
          }]
        }
      };
      api.applyCommands('-i json-path=data.races[0].records data.json -o',
          {'data.json': data},function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepEqual(json, [{foo: 'a'}, {foo: 'b'}]);
        done();
      });
    });

    it('import GeoJSON data', function(done) {
      var data = {
        point: {
          type: 'Feature',
          properties: {id: 'foo'},
          geometry: {
            type: 'Point',
            coordinates: [3, 2]
          }
        }
      };
      api.applyCommands('-i data.json json-path=point -o', {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepEqual(json.features[0], data.point);
        done();
      })
    });

    it('nested path, string input', function(done) {
      var data = JSON.stringify({
        data: {
          records: [{foo: 'a'}, {foo: 'b'}]
        }
      });
      api.applyCommands('-i json-path=data/records data.json -o',
          {'data.json': data},function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepEqual(json, [{foo: 'a'}, {foo: 'b'}]);
        done();
      });
    });
  });


  describe('import polygons without topology', function () {
    //      b --- d
    //     / \   /
    //    /   \ /
    //   a --- c

    // cabc, dcbd
    var geo1 = {
      type: "GeometryCollection",
      geometries: [
        {
          type: "Polygon",
          coordinates: [[[3, 1], [1, 1], [2, 3], [3, 1]]]
        }, {
          type: "Polygon",
          coordinates: [[[4, 3], [3, 1], [2, 3], [4, 3]]]
        }
      ]
    };

    // feature collection with one null-geometry feature
    var geo2 = {
      type: "FeatureCollection",
      features: [
        {
          type: 'Feature',
          geometry: {
            type: "Polygon",
            coordinates: [[[3, 1], [1, 1], [2, 3], [3, 1]]]
          }, properties: {FID: 0}
        }, {
          type: 'Feature',
          geometry: null,
          properties: {FID: 1}
        }, {
          type: 'Feature',
          geometry: {
            type: "Polygon",
            coordinates: [[[4, 3], [3, 1], [2, 3], [4, 3]]]
          }, properties: {FID: 2}
        }
      ]
    };

    it("two triangles as GeometryCollection", function() {
      var geojson = JSON.stringify(geo1);
      var data = api.internal.importFileContent(geojson, 'json', {no_topology: true});
      var target = [[[3, 1], [1, 1], [2, 3], [3, 1]], [[4, 3], [3, 1], [2, 3], [4, 3]]];
      assert.deepEqual(target, data.arcs.toArray());
    })

    it("two triangles as FeatureCollection with one null-geometry feature", function() {
      var geojson = JSON.stringify(geo2);
      var data = api.internal.importFileContent(geojson, 'json', {no_topology: true});
      var target = [[[3, 1], [1, 1], [2, 3], [3, 1]], [[4, 3], [3, 1], [2, 3], [4, 3]]];
      assert.deepEqual(target, data.arcs.toArray());
      assert.deepEqual([[[0]], null, [[1]]], data.layers[0].shapes);
      assert.deepEqual([{FID: 0}, {FID: 1}, {FID: 2}], data.layers[0].data.getRecords());
    })

  })

})
