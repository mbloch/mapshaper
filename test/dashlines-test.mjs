import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;

describe('mapshaper-dashlines.js', function () {
  it ('-split-lines alias works', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1000, 0]]
    };
    var cmd = '-i data.json -split-lines dash-length=500 -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'MultiLineString',
        coordinates: [
          [[0, 0], [500, 0]], [[500, 0], [1000, 0]]
        ]
      }
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });

  it ('projected, no gap, scaled', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [0, 1200]]
    };
    var cmd = '-i data.json -dashlines dash-length=302 scaled -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'MultiLineString',
        coordinates: [[[0, 0], [0, 300]], [[0, 300], [0, 600]], [[0, 600], [0, 900]], [[0, 900], [0, 1200]]]
      };
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });

  it ('projected, no gap; avoid tiny segments', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1000.1, 0]]
    };
    var cmd = '-i data.json -dashlines dash-length=500 -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'MultiLineString',
        coordinates: [
          [[0, 0], [500, 0]], [[500, 0], [1000.1, 0]]
        ]
      }
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });

  it ('projected, no gap', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1000, 0], [1100, 0]]
    };
    var cmd = '-i data.json -dashlines dash-length=300 -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'MultiLineString',
        coordinates: [
          [[0, 0], [300, 0]], [[300, 0], [600, 0]], [[600, 0], [900, 0]], [[900, 0], [1000, 0], [1100, 0]]
        ]
      }
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });


  it ('projected, gap, scaled down', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1000, 0]]
    };
    var cmd = '-i data.json -dashlines dash-length=600 gap-length=600 scaled -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'LineString',
        coordinates: [[250, 0], [750, 0]]
      };
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });

  it ('projected, gap, scaled way down', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1000, 0]]
    };
    var cmd = '-i data.json -dashlines dash-length=2000 gap-length=2000 scaled -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'LineString',
        coordinates: [[250, 0], [750, 0]]
      };
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });


  it ('projected, gap, scaled up', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1000, 0]]
    };
    var cmd = '-i data.json -dashlines dash-length=400 gap-length=400 scaled -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      var expect = {
        type: 'LineString',
        coordinates: [[250, 0], [750, 0]]
      };
      assert.deepEqual(json.geometries[0], expect);
      done();
    });
  });



})
