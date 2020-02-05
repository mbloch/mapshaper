var api = require('../'),
    assert = require('assert');

describe('mapshaper-import.js', function () {

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
