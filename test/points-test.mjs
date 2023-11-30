import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-points.js', function () {

  it ('interpolated points', function(done) {
    var a = {
      type: 'LineString',
      coordinates: [[0, 0], [300, 0], [300, 300], [300, 310], [300, 311], [300, 600]]
    };
    var expected = {
      type: 'MultiPoint',
      coordinates: [[0, 0], [200, 0], [300, 100], [300, 300], [300, 500], [300, 600]]
    };
    api.applyCommands('-i a.json -points interpolated interval=200 -o', {'a.json': a}, function(err, output) {
      var geom = JSON.parse(output['a.json']).geometries[0];
      assert.deepEqual(geom, expected);
      done();
    })
  })

  it ('interpolated points with interval in km', function(done) {
    var a = {
      type: 'LineString',
      coordinates: [[100, 100], [100, 10000]]
    };
    var expected = {
      type: 'MultiPoint',
      coordinates: [[100, 100], [100, 2100], [100, 4100], [100, 6100], [100, 8100], [100, 10000]]
    };
    var cmd = '-i a.json -proj from=webmercator -points interpolated interval=2km -o';
    api.applyCommands(cmd, {'a.json': a}, function(err, output) {
      var geom = JSON.parse(output['a.json']);
      assert.deepEqual(geom.geometries[0], expected);
      done();
    })
  })

  it ('-points command with midpoints option', function(done) {
    var a = {
      type: 'MultiLineString',
      coordinates: [[[2, 2], [3, 3], [4, 4]], [[0, 0], [0, -4]]]
    };
    var expected = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'MultiPoint',
        coordinates: [[3, 3], [0, -2]]
      }]
    };
    api.applyCommands('-i a.json -points midpoints -o', {'a.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['a.json']), expected);
      done();
    })
  })

  it ('-points command with vertices option', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[2, 2], [3, 2], [2, 1], [2, 2]]]
    };
    var expected = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'MultiPoint',
        coordinates: [[2, 2], [3, 2], [2, 1]]
      }]
    };
    api.applyCommands('-i a.json -points vertices -o', {'a.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['a.json']), expected);
      done();
    })
  })

  it ('-points command with vertices2 option', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[2, 2], [3, 2], [2, 1], [2, 2]]]
    };
    var expected = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'MultiPoint',
        coordinates: [[2, 2], [3, 2], [2, 1], [2, 2]]
      }]
    };
    api.applyCommands('-i a.json -points vertices2 -o', {'a.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['a.json']), expected);
      done();
    })
  })

  describe('-points command with automatic x,y field detection', function () {
    it('identifies lat lng fields', function (done) {
      var csv = 'lat,lng\n10,10\n2,5';
      var target = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [10, 10]
        }, {
          type: 'Point',
          coordinates: [5, 2]
        }]
      };
      api.applyCommands('-i data.csv -points -filter-fields -o data.json', {'data.csv': csv}, function(err, data) {
        var output = JSON.parse(data['data.json']);
        assert.deepEqual(output, target);
        done();
      });
    });

    it('identifies X Y fields', function (done) {
      var csv = 'Y,X\n10,10\n2,5';
      var target = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [10, 10]
        }, {
          type: 'Point',
          coordinates: [5, 2]
        }]
      };
      api.applyCommands('-i data.csv -points -filter-fields -o data.json', {'data.csv': csv}, function(err, data) {
        var output = JSON.parse(data['data.json']);
        assert.deepEqual(output, target);
        done();
      });
    });


    it('error if lat and/or lng not found', function (done) {
      var csv = 'lat\n10\n2';
      api.applyCommands('-i data.csv -points -o data.json', {'data.csv': csv}, function(err, data) {
        assert(!!err);
        assert(/Missing/.test(err.message));
        done();
      });
    });

  })

  describe('findXField() and findYField()', function() {
    it('findXField()', function() {
      'LNG,LON,lon,lng,long,longitude,X,x'.split(',').forEach(function(name) {
        assert.equal(api.internal.findXField([name]), name);
      });
    });

    it('findYField()', function() {
      'LATITUDE,latitude,lat,y,Y'.split(',').forEach(function(name) {
        assert.equal(api.internal.findYField([name]), name);
      });
    });

  });

  describe('coordinateFromValue()', function () {
    var coordinateFromValue = api.internal.coordinateFromValue;
    it('numbers are unchanged', function () {
      assert.strictEqual(coordinateFromValue(0), 0);
      assert.strictEqual(coordinateFromValue(0.1), 0.1);
    });

    it('DMS is parsed', function() {
      // more tests in dms-test.js
      assert.strictEqual(coordinateFromValue('90°30\'S'), -90.5);
    })

    it('numeric strings are parsed', function() {
      assert.strictEqual(coordinateFromValue('-12.9'), -12.9);
      assert.strictEqual(coordinateFromValue('+12.9'), 12.9);
    })

    it('non-numeric and non-finite values become NaN', function() {
      assert(isNaN(coordinateFromValue('abc')));
      assert(isNaN(coordinateFromValue(null)));
      assert(isNaN(coordinateFromValue('')));
      assert(isNaN(coordinateFromValue(Infinity)));
      assert(isNaN(coordinateFromValue(undefined)));
    })
  })

})
