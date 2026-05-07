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

  it('square2 grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=square2 interval=3000 + name=grid -o target=* bbox';
    api.applyCommands(cmd, {}, function(err, out) {
      var rect = JSON.parse(out['rectangle.json']);
      var grid = JSON.parse(out['grid.json']);
      var rectWidth = rect.bbox[2] - rect.bbox[0];
      var rectHeight = rect.bbox[3] - rect.bbox[1];
      var gridWidth = grid.bbox[2] - grid.bbox[0];
      var gridHeight = grid.bbox[3] - grid.bbox[1];
      assert(grid.bbox[0] < rect.bbox[0]);
      assert(grid.bbox[1] < rect.bbox[1]);
      assert(grid.bbox[2] > rect.bbox[2]);
      assert(grid.bbox[3] > rect.bbox[3]);
      assert(gridWidth < rectWidth + 20000);
      assert(gridHeight < rectHeight + 20000);
      assertGridCellsIntersectBBox(grid, rect.bbox);
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

  it('rhombus grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=rhombus interval=3000 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('rhombus2 grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=rhombus2 interval=3000 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('triangle grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=triangle interval=3000 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('triangle2 grid fully encloses the target layer', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=triangle2 interval=3000 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('triangle grid culls cells outside the target rectangle', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=triangle interval=3000 + name=grid -o target=* bbox';
    api.applyCommands(cmd, {}, function(err, out) {
      var rect = JSON.parse(out['rectangle.json']);
      var grid = JSON.parse(out['grid.json']);
      assertGridCellsIntersectBBox(grid, rect.bbox);
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

  it('cols option sets grid resolution', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=square cols=5 + name=grid -o target=* bbox';
    api.applyCommands(cmd, {}, function(err, out) {
      var rect = JSON.parse(out['rectangle.json']);
      var grid = JSON.parse(out['grid.json']);
      var eps = 1e-6;
      assert(grid.geometries.length > 0);
      assert(grid.bbox[0] <= rect.bbox[0] + eps);
      assert(grid.bbox[1] <= rect.bbox[1] + eps);
      assert(grid.bbox[2] >= rect.bbox[2] - eps);
      assert(grid.bbox[3] >= rect.bbox[3] - eps);
      done();
    });
  });

  it('rows option sets grid resolution', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=hex rows=5 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('cols and rows options can be combined', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=triangle cols=5 rows=5 + name=grid -dissolve ' +
        '-erase target=rectangle grid -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var output = JSON.parse(out['rectangle.json']);
      assert.deepEqual(output.geometries, []);
      done();
    });
  });

  it('cells option sets grid resolution', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=rhombus cells=25 + name=grid -o target=* bbox';
    api.applyCommands(cmd, {}, function(err, out) {
      var grid = JSON.parse(out['grid.json']);
      assert(grid.geometries.length > 0);
      done();
    });
  });

  it('-grid rejects interval with cols, rows or cells', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid interval=2000 cols=5 -o';
    api.applyCommands(cmd, {}, function(err) {
      assert(err);
      assert(err.message.indexOf('Use interval= or cols=/rows=/cells=') > -1);
      done();
    });
  });

  it('cell-scale option scales cells from their centers', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid type=square interval=2000 cell-scale=0.5 + name=grid -o target=grid bbox';
    api.applyCommands(cmd, {}, function(err, out) {
      var grid = JSON.parse(out['grid.json']);
      var coords = grid.geometries[0].coordinates[0];
      var bbox = coords.reduce(function(memo, p) {
        memo[0] = Math.min(memo[0], p[0]);
        memo[1] = Math.min(memo[1], p[1]);
        memo[2] = Math.max(memo[2], p[0]);
        memo[3] = Math.max(memo[3], p[1]);
        return memo;
      }, [Infinity, Infinity, -Infinity, -Infinity]);
      assert.equal(bbox[2] - bbox[0], 1000);
      assert.equal(bbox[3] - bbox[1], 1000);
      done();
    });
  });

  it('-grid rejects out-of-range cell-scale values', function(done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
        '-grid interval=2000 cell-scale=2 -o';
    api.applyCommands(cmd, {}, function(err) {
      assert(err);
      assert(err.message.indexOf('cell-scale= option') > -1);
      done();
    });
  });

  it('default output layer name is "grid"', function (done) {
    var cmd = '-i test/data/features/grid/rectangle.json ' +
      '-grid interval=4500 -o';
    api.applyCommands(cmd, {}, function(err, out) {
      assert(!!out['grid.json']);
      done();
    });
  })

});

function assertGridCellsIntersectBBox(grid, bbox) {
  grid.geometries.forEach(function(geom) {
    assert(bboxesIntersect(getGeometryBBox(geom), bbox));
  });
}

function getGeometryBBox(geom) {
  return geom.coordinates[0].reduce(function(memo, p) {
    memo[0] = Math.min(memo[0], p[0]);
    memo[1] = Math.min(memo[1], p[1]);
    memo[2] = Math.max(memo[2], p[0]);
    memo[3] = Math.max(memo[3], p[1]);
    return memo;
  }, [Infinity, Infinity, -Infinity, -Infinity]);
}

function bboxesIntersect(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
