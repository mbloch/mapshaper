import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-polygon-grid.js', function () {

  it('square grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=square interval=2000 + name=grid -o target=* bbox';
    api.applyCommands(cmd, {}, function(err, out) {
      var rect = JSON.parse(out['rectangle.json']);
      var grid = JSON.parse(out['grid.json']);
      assert(grid.bbox[0] < rect.bbox[0]);
      assert(grid.bbox[1] < rect.bbox[1]);
      assert(grid.bbox[2] > rect.bbox[2]);
      assert(grid.bbox[3] > rect.bbox[3]);
      done();
    });
  });

  it('hex grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=hex interval=2000 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('hex2 grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=hex2 interval=3000 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('-grid fails if target has lat-long coordinates', function (done) {
    var polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    };
    var cmd = '-i polygon.json -grid interval=1 -o';
    api.applyCommands(cmd, {'polygon.json': polygon}, function(err, out) {
      assert(err.message.indexOf('projected coordinates') > 0);
      done();
    });
  })

  it('-grid has the same CRS as the target dataset', function (done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
      '-proj from=webmercator -grid interval=5000 + name=grid -o target=* format=shapefile';
    api.applyCommands(cmd, {}, function(err, out) {
      assert(out['grid.prj']);
      assert.equal(out['grid.prj'], out['rectangle.prj']);
      done();
    });
  })

  it('interval option accepts distance units', function (done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
      '-proj from=webmercator -grid interval=3100m name=grid + ' +
      '-grid target=rectangle interval=3.1km name=grid2 -o target=*';
    api.applyCommands(cmd, {}, function(err, out) {
      var grid = JSON.parse(out['grid.json']);
      var grid2 = JSON.parse(out['grid2.json']);
      assert(grid.geometries.length > 0);
      assert.equal(grid.geometries.length, grid2.geometries.length);
      done();
    });
  })

  it('default output layer name is "grid"', function (done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
      '-grid interval=4500 -o';
    api.applyCommands(cmd, {}, function(err, out) {
      assert(!!out['grid.json']);
      done();
    });
  })

});
