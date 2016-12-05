var assert = require('assert'),
    api = require("../");

describe('mapshaper-split-on-grid.js', function () {
  describe('splitLayerOnGrid()', function (done) {
    it('assign cell id to layer containing one point', function () {
      var geojson = {
        type: 'Point',
        coordinates: [1, 1]
      };
      var target = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {cell_id: "r0c0"},
          geometry: {
            type: "Point",
            coordinates: [1, 1]
          }
        }]
      }
      api.applyCommands('-split-on-grid 3,3 id-field=cell_id', geojson, function(err, data) {
        assert.deepEqual(JSON.parse(data), target);
        done();
      })
    })

    it('Split point layer into two layers', function () {
      var geojson = {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0, 0]
        }, {
          type: "Point",
          coordinates: [1, 1]
        }]
      };
      var target = [{
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0, 0]
        }]
      }, {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [1, 1]
        }]
      }];

      api.applyCommands('-split-on-grid 2,2', geojson, function(err, data) {
        assert.deepEqual(JSON.parse(data), target);
        done();
      });

    })
  })
})
