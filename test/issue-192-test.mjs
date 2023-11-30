import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #192: Error clipping a polyline layer', function () {
  it ('clip polyline layer containing null geometry', function(done) {

    var a = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [[0, 1], [10, 1]]
        }
      }, {
        type: 'Feature',
        properties: {},
        geometry: null
      }]
    }

    var b = {
      type: 'Polygon',
      coordinates: [[[1, 0], [1, 2], [2, 2], [2, 0], [1, 0]]]
    };

    var cmd = '-i b.json -i a.json -clip b -o';

    api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, output) {
      var geom = JSON.parse(output['a.json']);
      assert.deepEqual(geom, {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[1, 1], [2, 1]]
        }]
      });
      done();
    });
  });

  it ('clip point layer containing null geometry', function(done) {
    var a = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [1, 1]
        }
      }, {
        type: 'Feature',
        properties: {},
        geometry: null
      }]
    }

    var b = {
      type: 'Polygon',
      coordinates: [[[1, 0], [1, 2], [2, 2], [2, 0], [1, 0]]]
    };

    var cmd = '-i b.json -i a.json -clip b -o';

    api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, output) {
      var geom = JSON.parse(output['a.json']);
      assert.deepEqual(geom, {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [1, 1]
        }]
      });
      done();
    });

  });

  it ('clip polygon layer containing null geometry', function(done) {
    var a = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 3], [2, 3], [2, 1], [1, 1]]]
        }
      }, {
        type: 'Feature',
        properties: {},
        geometry: null
      }]
    }

    var b = {
      type: 'Polygon',
      coordinates: [[[1, 0], [1, 2], [2, 2], [2, 0], [1, 0]]]
    };

    var cmd = '-i b.json -i a.json -clip b -o gj2008';

    api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, output) {
      var geom = JSON.parse(output['a.json']);
      assert.deepEqual(geom, {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]
        }]
      });
      done();
    });

  });


});
