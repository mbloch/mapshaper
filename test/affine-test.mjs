import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-affine.js', function () {
  describe('-affine command', function () {
    it('separates two connected polygons', function(done) {
      //   b -- c
      //   | \  |
      //   |  \ |
      //   a -- d
      var geojson = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'a'},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 1], [1, 0], [0, 0], [0, 1]]]
          }
        }, {
          type: 'Feature',
          properties: {name: 'b'},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 1], [1, 1], [1, 0], [0, 1]]]
          }
        }]
      };

      api.applyCommands('-i polygons.json -affine shift=2,1 where=name=="b" -o gj2008',
          {'polygons.json': geojson}, function(err, output) {
            var geojson = JSON.parse(output['polygons.json']);
            assert.deepEqual(geojson.features[0].geometry.coordinates, [[[0, 1], [1, 0], [0, 0], [0, 1]]]);
            assert.deepEqual(geojson.features[1].geometry.coordinates, [[[2, 2], [3, 2], [3, 1], [2, 2]]]);
            done();
          });
    })

    it('rotates a point around an origin', function(done) {
      var geojson = {
        type: 'Point',
        coordinates: [2, 2]
      };
      api.applyCommands('-i point.json -affine rotate=90 anchor=2,1 -o',
        {'point.json': geojson}, function(err, output) {
          var geojson = JSON.parse(output['point.json']);
          assert.deepEqual(geojson.geometries[0].coordinates, [3, 1]);
          done();
        });

    })

    it('apply scale to two points', function(done) {
      var geojson = {
        type: 'MultiPoint',
        coordinates: [[2, 2], [4, 4]]
      };
      api.applyCommands('-i point.json -affine scale=2 -o',
        {'point.json': geojson}, function(err, output) {
          var geojson = JSON.parse(output['point.json']);
          assert.deepEqual(geojson.geometries[0].coordinates, [[1, 1], [5, 5]]);
          done();
        });

    })

  })


});
