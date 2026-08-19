import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var GEOTIFF = 'test/data/geotiff/wgs84-geographic-epsg4326.tif';

// Builds a north-up single-band grid whose bbox is one map unit per pixel, so
// pixel centers land on half-unit coordinates.
function makeGrid(width, height, fn, opts) {
  var o = opts || {};
  var samples = new (o.arrayType || Float32Array)(width * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      samples[y * width + x] = fn(x, y);
    }
  }
  return {
    width: width,
    height: height,
    bands: 1,
    pixelType: 'float32',
    samples: samples,
    sampleBands: [0],
    nodata: 'nodata' in o ? o.nodata : null,
    bbox: [0, 0, width, height],
    transform: [1, 0, 0, 0, -1, height]
  };
}

function makeRasterLayer(grid) {
  return {
    name: 'raster',
    raster_type: 'grid',
    raster: {
      sourceId: 'raster',
      interpretation: 'continuous',
      grid: grid,
      derivation: {type: 'gray', sourceId: 'raster', bands: [0]},
      view: {recipe: {type: 'gray', bands: [0]}}
    }
  };
}

function makeRasterDataset(grid) {
  return {
    info: {crs_string: 'wgs84'},
    layers: [makeRasterLayer(grid)]
  };
}

function getCoordBounds(coords) {
  var xs = coords.map(function(p) { return p[0]; });
  var ys = coords.map(function(p) { return p[1]; });
  return [Math.min.apply(null, xs), Math.min.apply(null, ys),
    Math.max.apply(null, xs), Math.max.apply(null, ys)];
}

function isClosed(coords) {
  var a = coords[0];
  var b = coords[coords.length - 1];
  return coords.length > 3 && a[0] === b[0] && a[1] === b[1];
}

describe('mapshaper-contours.mjs', function () {

  describe('tracing', function () {
    it('traces a linear ramp as a straight line through pixel centers', function () {
      // Values 0,10,20,30,40 left to right. Level 15 falls midway between the
      // second and third columns, whose centers are at x=1.5 and x=2.5.
      var grid = makeGrid(5, 3, function(x) { return x * 10; });
      var lines = internal.traceRasterContours(grid, 0, [15]);
      assert.equal(lines.length, 1);
      assert.equal(lines[0].value, 15);
      assert.deepEqual(lines[0].coords, [[2, 2.5], [2, 1.5], [2, 0.5]]);
    });

    it('traces closed nested rings from a pyramid', function () {
      var grid = makeGrid(11, 11, function(x, y) {
        return 100 - Math.max(Math.abs(x - 5), Math.abs(y - 5)) * 10;
      });
      var lines = internal.traceRasterContours(grid, 0, [60, 90]);
      var inner, outer;
      assert.equal(lines.length, 2);
      lines.forEach(function(line) {
        assert(isClosed(line.coords), 'contour at ' + line.value + ' is not closed');
      });
      outer = getCoordBounds(lines[0].coords);
      inner = getCoordBounds(lines[1].coords);
      assert.equal(lines[0].value, 60);
      assert.equal(lines[1].value, 90);
      assert(inner[0] > outer[0] && inner[1] > outer[1] &&
        inner[2] < outer[2] && inner[3] < outer[3],
        'the higher contour is not inside the lower one');
    });

    it('splits a saddle into separate branches instead of crossing itself', function () {
      var grid = makeGrid(5, 5, function(x, y) {
        return (x - 2) * (x - 2) - (y - 2) * (y - 2);
      });
      var lines = internal.traceRasterContours(grid, 0, [0]);
      assert.equal(lines.length, 2);
      lines.forEach(function(line) {
        assert(!isClosed(line.coords));
        assert.equal(line.coords.length, 5);
      });
    });

    it('breaks contours around a nodata hole', function () {
      // A ramp with a nodata block in the middle. The level-35 contour runs
      // down column x=4, so the hole should cut it into two pieces.
      var grid = makeGrid(9, 9, function(x, y) {
        return (x > 2 && x < 6 && y > 2 && y < 6) ? -9999 : x * 10;
      }, {nodata: -9999});
      var lines = internal.traceRasterContours(grid, 0, [35]);
      assert.equal(lines.length, 2);
      lines.forEach(function(line) {
        line.coords.forEach(function(p) {
          assert.equal(p[0], 4);
        });
      });
      // The rows spanned by the hole (map y 3.5 to 5.5) carry no vertices.
      var ys = lines.reduce(function(memo, line) {
        return memo.concat(line.coords.map(function(p) { return p[1]; }));
      }, []);
      assert.deepEqual(ys.sort(function(a, b) { return b - a; }),
        [8.5, 7.5, 6.5, 2.5, 1.5, 0.5]);
    });

    it('skips NaN samples', function () {
      var grid = makeGrid(5, 3, function(x, y) {
        return y === 1 ? NaN : x * 10;
      });
      var lines = internal.traceRasterContours(grid, 0, [15]);
      // Only the cells that avoid the NaN row can be contoured, and a single
      // lattice row on each side of it cannot form a segment on its own.
      lines.forEach(function(line) {
        line.coords.forEach(function(p) {
          assert(p[1] !== 1.5);
        });
      });
    });

    it('produces nothing from a flat raster', function () {
      var grid = makeGrid(5, 5, function() { return 42; });
      assert.deepEqual(internal.traceRasterContours(grid, 0, [42]), []);
    });

    it('reads the requested band', function () {
      var grid = makeGrid(4, 2, function() { return 0; });
      var samples = new Float32Array(4 * 2 * 2);
      var i;
      for (i = 0; i < 8; i++) {
        samples[i * 2] = 0;          // band 0 is flat
        samples[i * 2 + 1] = (i % 4) * 10; // band 1 is a ramp
      }
      grid.bands = 2;
      grid.samples = samples;
      assert.deepEqual(internal.traceRasterContours(grid, 0, [15]), []);
      assert.equal(internal.traceRasterContours(grid, 1, [15]).length, 1);
    });

    it('positions contours half a pixel inside the grid bbox', function () {
      var grid = makeGrid(4, 4, function(x) { return x * 10; });
      grid.bbox = [100, 200, 140, 240]; // 10 map units per pixel
      var lines = internal.traceRasterContours(grid, 0, [15]);
      var bounds = getCoordBounds(lines[0].coords);
      assert.equal(bounds[0], 120); // between centers at 115 and 125
      assert.equal(bounds[1], 205); // center of the bottom row
      assert.equal(bounds[3], 235); // center of the top row
    });
  });

  describe('levels', function () {
    it('picks a round interval when none is given', function () {
      var grid = makeGrid(20, 20, function(x, y) { return 1240 + x * 20 + y; });
      var levels = internal.getContourLevels(grid, 0, {});
      assert(levels.length > 5 && levels.length < 40);
      levels.forEach(function(level) {
        assert.equal(level % 20, 0, level + ' is not a round value');
      });
    });

    it('aligns interval= to base=', function () {
      var grid = makeGrid(10, 2, function(x) { return x * 100; });
      assert.deepEqual(internal.getContourLevels(grid, 0, {interval: 200}),
        [200, 400, 600, 800]);
      assert.deepEqual(internal.getContourLevels(grid, 0, {interval: 200, base: 50}),
        [50, 250, 450, 650, 850]);
    });

    it('sorts and dedupes an explicit levels= list', function () {
      var grid = makeGrid(4, 2, function(x) { return x; });
      assert.deepEqual(internal.getContourLevels(grid, 0, {levels: [5, 1, 5, 3]}),
        [1, 3, 5]);
    });

    it('keeps fractional levels free of floating point noise', function () {
      var grid = makeGrid(10, 2, function(x) { return x * 0.1; });
      var levels = internal.getContourLevels(grid, 0, {interval: 0.1});
      assert.deepEqual(levels, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    });

    it('ignores nodata pixels when measuring the data range', function () {
      var grid = makeGrid(10, 2, function(x, y) {
        return y === 0 ? 1e6 : x * 10;
      }, {nodata: 1e6});
      var range = internal.getRasterSampleRange(grid, 0);
      assert.equal(range.min, 0);
      assert.equal(range.max, 90);
    });

    it('returns no levels for a flat raster', function () {
      var grid = makeGrid(5, 5, function() { return 7; });
      assert.deepEqual(internal.getContourLevels(grid, 0, {}), []);
    });

    it('rejects an interval that would generate too many levels', function () {
      var grid = makeGrid(4, 2, function(x) { return x * 1e6; });
      assert.throws(function () {
        internal.getContourLevels(grid, 0, {interval: 0.001});
      }, /limit is 2000/);
    });

    it('rejects a non-positive interval', function () {
      var grid = makeGrid(4, 2, function(x) { return x; });
      assert.throws(function () {
        internal.getContourLevels(grid, 0, {interval: -5});
      }, /must be a positive number/);
    });

    it('builds closed-band breaks from strict interior levels', function () {
      assert.deepEqual(internal.getClosedContourBreaks(
        [-10, 0, 10, 20, 30, 40], {min: 0, max: 30}), [0, 10, 20, 30]);
      assert.deepEqual(internal.getClosedContourBreaks([], {min: 7, max: 7}),
        [7, 7]);
      assert.deepEqual(internal.getClosedContourBreaks([], {
        min: Infinity,
        max: -Infinity
      }), []);
    });
  });

  describe('validation', function () {
    it('rejects a rotated raster', function () {
      var grid = makeGrid(4, 4, function(x) { return x; });
      grid.transform = [1, 0.5, 0, 0.5, -1, 4];
      assert.throws(function () {
        internal.validateRasterGridForContours(grid);
      }, /rotated or skewed/);
    });

    it('rejects a raster too small to contour', function () {
      var grid = makeGrid(1, 4, function(x, y) { return y; });
      assert.throws(function () {
        internal.validateRasterGridForContours(grid);
      }, /too small/);
    });

    it('rejects an out-of-range band', function () {
      var grid = makeGrid(4, 4, function(x) { return x; });
      assert.throws(function () {
        internal.getContourBand(grid, {band: 3});
      }, /this raster has 1 band/);
    });

    it('rejects a non-raster layer', function () {
      var dataset = {
        layers: [{name: 'points', geometry_type: 'point', shapes: [[[0, 0]]]}],
        info: {}
      };
      assert.throws(function () {
        api.cmd.contours(dataset.layers[0], dataset, {interval: 10});
      }, /requires a raster layer/);
    });
  });

  describe('command', function () {
    it('creates a polyline layer with contour values', function () {
      var dataset = makeRasterDataset(makeGrid(5, 3, function(x) { return x * 10; }));
      var layers = api.cmd.contours(dataset.layers[0], dataset, {levels: [15, 25]});
      assert.equal(layers.length, 1);
      assert.equal(layers[0].geometry_type, 'polyline');
      assert.equal(layers[0].shapes.length, 2);
      assert.deepEqual(layers[0].data.getRecords(), [{value: 15}, {value: 25}]);
      // The polylines need arcs, which a raster-only dataset does not have.
      assert(dataset.arcs);
      assert.equal(dataset.arcs.size(), 2);
    });

    it('honours field=', function () {
      var dataset = makeRasterDataset(makeGrid(5, 3, function(x) { return x * 10; }));
      var layers = api.cmd.contours(dataset.layers[0], dataset, {levels: [15], field: 'elev'});
      assert.deepEqual(layers[0].data.getRecords(), [{elev: 15}]);
    });

    it('returns an empty polyline layer when nothing crosses a level', function () {
      var dataset = makeRasterDataset(makeGrid(5, 3, function() { return 5; }));
      var layers = api.cmd.contours(dataset.layers[0], dataset, {levels: [99]});
      assert.equal(layers.length, 1);
      assert.equal(layers[0].geometry_type, 'polyline');
      assert.deepEqual(layers[0].shapes, []);
    });

    it('reads the current samples, not the imported ones', function () {
      // The point of contouring the working store: an in-place edit to the
      // samples, as -blur makes, has to show up in the contours.
      var dataset = makeRasterDataset(makeGrid(5, 3, function(x) { return x * 10; }));
      var lyr = dataset.layers[0];
      var samples = lyr.raster.grid.samples;
      var before = api.cmd.contours(lyr, dataset, {levels: [15]});
      var beforeX = internal.getLayerBounds(before[0], dataset.arcs).xmin;
      var after, afterX, i;
      assert.equal(beforeX, 2);
      for (i = 0; i < samples.length; i++) {
        samples[i] += 3;
      }
      after = api.cmd.contours(lyr, dataset, {levels: [15]});
      afterX = internal.getLayerBounds(after[0], dataset.arcs).xmin;
      assert(afterX < beforeX, 'contour did not move after the samples changed');
    });

    it('creates closed polygon bands with lower and upper bounds', function () {
      var dataset = makeRasterDataset(makeGrid(5, 3, function(x) { return x * 10; }));
      var layers = api.cmd.contours(dataset.layers[0], dataset, {
        levels: [15, 25],
        closed: true,
        no_smoothing: true
      });
      var records = layers[0].data.getRecords().slice().sort(function(a, b) {
        return a.lower - b.lower;
      });
      var bounds = internal.getLayerBounds(layers[0], dataset.arcs).toArray();
      var area = layers[0].shapes.reduce(function(sum, shape) {
        return sum + api.geom.getPlanarShapeArea(shape, dataset.arcs);
      }, 0);
      assert.equal(layers[0].geometry_type, 'polygon');
      assert.deepEqual(records, [
        {lower: 0, upper: 15},
        {lower: 15, upper: 25},
        {lower: 25, upper: 40}
      ]);
      assert.deepEqual(bounds, [0, 0, 5, 3]);
      assert.equal(area, 15);
    });

    it('creates nested closed bands with shared holes', function () {
      var grid = makeGrid(11, 11, function(x, y) {
        return 100 - Math.max(Math.abs(x - 5), Math.abs(y - 5)) * 10;
      });
      var dataset = makeRasterDataset(grid);
      var layers = api.cmd.contours(dataset.layers[0], dataset, {
        levels: [60, 90],
        closed: true,
        no_smoothing: true
      });
      var records = layers[0].data.getRecords().slice().sort(function(a, b) {
        return a.lower - b.lower;
      });
      var area = layers[0].shapes.reduce(function(sum, shape) {
        return sum + api.geom.getPlanarShapeArea(shape, dataset.arcs);
      }, 0);
      assert.deepEqual(records, [
        {lower: 50, upper: 60},
        {lower: 60, upper: 90},
        {lower: 90, upper: 100}
      ]);
      assert(layers[0].shapes.some(function(shape) {
        return shape.length > 1;
      }), 'expected a band with a hole');
      assert.equal(area, 121);
    });

    it('closes around nodata using the same skipped-cell rule as isolines', function () {
      var grid = makeGrid(5, 5, function(x, y) {
        return x === 2 && y === 2 ? -9999 : 5;
      }, {nodata: -9999});
      var domain = internal.getContourCellDomain(grid, 0);
      var rings = internal.traceContourDomainRings(domain);
      var dataset = makeRasterDataset(grid);
      var layers = api.cmd.contours(dataset.layers[0], dataset, {
        closed: true,
        no_smoothing: true
      });
      var area = api.geom.getPlanarShapeArea(layers[0].shapes[0], dataset.arcs);
      assert.equal(domain.activeCount, 12);
      assert.equal(rings.length, 2);
      assert.equal(internal.pointIsInContourDomain(2.5, 2.5, domain), false);
      assert.equal(internal.pointIsInContourDomain(0.25, 0.25, domain), true);
      // Four 1x1 contour cells touching the nodata sample are excluded.
      assert.equal(area, 21);
      assert.deepEqual(layers[0].data.getRecords(), [{lower: 5, upper: 5}]);
    });

    it('classifies disconnected value ranges separated by nodata', function () {
      var grid = makeGrid(7, 3, function(x) {
        if (x === 3) return -9999;
        return x < 3 ? 0 : 100;
      }, {nodata: -9999});
      var dataset = makeRasterDataset(grid);
      var layers = api.cmd.contours(dataset.layers[0], dataset, {
        levels: [50],
        closed: true,
        no_smoothing: true
      });
      var records = layers[0].data.getRecords().slice().sort(function(a, b) {
        return a.lower - b.lower;
      });
      assert.deepEqual(records, [
        {lower: 0, upper: 50},
        {lower: 50, upper: 100}
      ]);
    });

    it('returns an empty polygon layer from an all-invalid raster', function () {
      var grid = makeGrid(5, 5, function() { return -9999; }, {nodata: -9999});
      var dataset = makeRasterDataset(grid);
      var layers = api.cmd.contours(dataset.layers[0], dataset, {
        closed: true
      });
      assert.equal(layers[0].geometry_type, 'polygon');
      assert.deepEqual(layers[0].shapes, []);
      assert.deepEqual(layers[0].data.getRecords(), []);
    });

    it('excludes cells touching an uncovered pixel', function () {
      var grid = makeGrid(4, 4, function() { return 10; });
      grid.coverage = new Uint8Array(16);
      grid.coverage.fill(1);
      grid.coverage[5] = 0;
      var domain = internal.getContourCellDomain(grid, 0);
      assert.equal(domain.activeCount, 5);
      assert.equal(internal.pointIsInContourDomain(1.5, 2.5, domain), false);
    });

    it('smooths closed contour boundaries unless no-smoothing is set', function () {
      function getDataset() {
        return makeRasterDataset(makeGrid(25, 25, function(x, y) {
          return Math.round(100 - Math.sqrt(
            Math.pow(x - 12, 2) + Math.pow(y - 12, 2)) * 5);
        }));
      }
      var smoothed = getDataset();
      var raw = getDataset();
      var smoothLayers = api.cmd.contours(smoothed.layers[0], smoothed, {
        levels: [60],
        closed: true
      });
      var rawLayers = api.cmd.contours(raw.layers[0], raw, {
        levels: [60],
        closed: true,
        no_smoothing: true
      });
      assert.deepEqual(internal.getLayerBounds(
        smoothLayers[0], smoothed.arcs).toArray(), [0, 0, 25, 25]);
      assert.deepEqual(internal.getLayerBounds(
        rawLayers[0], raw.arcs).toArray(), [0, 0, 25, 25]);
      assert.notDeepEqual(smoothed.arcs.getVertexData().xx,
        raw.arcs.getVertexData().xx);
    });
  });

  describe('smoothing', function () {
    // The smoother reads coordinates in the lng/lat range as degrees, so these
    // grids are placed where a UTM-style easting and northing would be. Then a
    // coordinate unit is a meter, and one pixel of the grid is one meter.
    var ORIGIN_X = 500000;
    var ORIGIN_Y = 4000000;

    function placeGrid(grid) {
      grid.bbox = [ORIGIN_X, ORIGIN_Y, ORIGIN_X + grid.width, ORIGIN_Y + grid.height];
      grid.transform = [1, 0, ORIGIN_X, 0, -1, ORIGIN_Y + grid.height];
      return grid;
    }

    // A cone quantized to whole units, which is what makes marching squares
    // produce a visible staircase.
    function coneDataset(quantize) {
      var grid = placeGrid(makeGrid(60, 60, function(x, y) {
        var v = 100 - Math.sqrt(Math.pow(x - 29.5, 2) + Math.pow(y - 29.5, 2));
        return quantize ? Math.round(v) : v;
      }));
      var dataset = makeRasterDataset(grid);
      delete dataset.info.crs_string; // smooth in planar coordinate units
      return dataset;
    }

    function vertexCount(dataset) {
      return dataset.arcs.getPointCount();
    }

    it('smooths contours by default', function () {
      var smoothed = coneDataset(true);
      var raw = coneDataset(true);
      api.cmd.contours(smoothed.layers[0], smoothed, {levels: [80]});
      api.cmd.contours(raw.layers[0], raw, {levels: [80], no_smoothing: true});
      assert.notDeepEqual(smoothed.arcs.getVertexData().xx,
        raw.arcs.getVertexData().xx);
    });

    it('leaves geometry untouched with no-smoothing', function () {
      var a = coneDataset(true);
      var b = coneDataset(true);
      api.cmd.contours(a.layers[0], a, {levels: [80], no_smoothing: true});
      api.cmd.contours(b.layers[0], b, {levels: [80], no_smoothing: true});
      // Two identical runs must agree exactly, so the comparison below is
      // meaningful rather than incidentally equal.
      assert.equal(vertexCount(a), vertexCount(b));
      assert.deepEqual(internal.traceRasterContours(
        a.layers[0].raster.grid, 0, [80])[0].coords.length, vertexCount(a));
    });

    // Eleven pixels of a real elevation model, coarse and steep enough that
    // neighboring contours run a fraction of a pixel apart -- the case that
    // smoothing by a whole pixel used to pull into a tangle.
    var STEEP_ROWS = [
      [193.17, 215.82, 267.06, 232.73, 97.81, 8.19, -15.96, 32.32, 167.67, 236.52, 174.24],
      [232.08, 212.39, 222.54, 223.01, 188.13, 121.83, 21.87, -6.07, 54.95, 136.04, 66.75],
      [285.31, 238.65, 205.21, 189.74, 194.18, 157.32, 124.96, 25.57, -18.25, 13.08, 7.22],
      [246.51, 224.75, 203.61, 177.07, 112.03, 48.06, 136.63, 199.47, 125.7, 0.59, -6.77],
      [239.31, 201.86, 175.71, 169.97, 163.36, 50.06, 96.44, 228.69, 180.56, 30.7, -4.48],
      [186.16, 139.57, 149.4, 222.85, 246.77, 66.8, 37.71, 97.56, 48.48, 22.96, -1.98],
      [121.85, 75.2, 149.67, 235.39, 277.71, 215.89, 60.85, -2.82, -3.49, 0.63, 0.02],
      [178.87, 53.67, 147.13, 190.91, 96.35, 91.34, 43.59, -4.41, -0.99, -0.55, 0.05],
      [202.72, 41.3, 110.65, 108.12, 29.3, -9.77, -1.88, 0.14, 0.05, 0.02, 0],
      [39.89, -1.08, 6.18, -5.15, -0.21, -0.17, -0.23, 0.02, 0, 0, 0],
      [19.93, -4.42, -1.43, -0.14, -0.16, 0.01, 0, 0, 0, 0, 0]
    ];

    function steepDataset() {
      var grid = placeGrid(makeGrid(11, 11, function(x, y) {
        return STEEP_ROWS[y][x];
      }));
      var dataset = makeRasterDataset(grid);
      delete dataset.info.crs_string; // smooth in planar coordinate units
      return dataset;
    }

    function crossingCount(dataset) {
      return internal.findSegmentIntersections(dataset.arcs, {}).length;
    }

    it('does not let smoothing pull contour lines across each other', function () {
      var dataset = steepDataset();
      var loose = steepDataset();
      api.cmd.contours(dataset.layers[0], dataset, {interval: 20});
      // Confirm the grid still exercises the problem: smoothing it by a whole
      // pixel, as this command once did, tangles the lines.
      var lyrs = api.cmd.contours(loose.layers[0], loose,
        {interval: 20, no_smoothing: true});
      api.cmd.smooth(loose, {distance: 1, no_corners: true, no_prefilter: true}, lyrs);
      assert(crossingCount(loose) > 0, 'test grid no longer produces crossings');
      assert.equal(crossingCount(dataset), 0);
    });

    it('keeps traced vertices clear of grid points before smoothing', function () {
      // Every sample is a whole number, so a contour at a whole number would
      // otherwise pass exactly through the grid points it touches. The samples
      // sit at pixel centers, half a unit inside this grid's bbox.
      var grid = makeGrid(5, 5, function(x, y) { return x + y; });
      var onGridPoint = function(lines) {
        return lines[0].coords.some(function(xy) {
          return (xy[0] - 0.5) % 1 === 0 && (xy[1] - 0.5) % 1 === 0;
        });
      };
      assert(onGridPoint(internal.traceRasterContours(grid, 0, [4], 0)),
        'expected the exact trace to touch grid points');
      assert(!onGridPoint(internal.traceRasterContours(
        grid, 0, [4], internal.getCornerClearance({}))));
    });

    it('places crossings exactly with no-smoothing', function () {
      assert.equal(internal.getCornerClearance({no_smoothing: true}), 0);
      assert(internal.getCornerClearance({}) > 0);
    });

    it('moves contours closer to the true shape of a quantized surface', function () {
      // The level-80 contour of the cone is a circle of radius 20 centered on
      // the grid. Quantizing to whole units puts a staircase on it; smoothing
      // should reduce the deviation from the true circle.
      function radialError(dataset) {
        var arcs = dataset.arcs;
        var sum = 0, n = 0;
        var i, iter, r;
        for (i = 0; i < arcs.size(); i++) {
          iter = arcs.getArcIter(i);
          while (iter.hasNext()) {
            r = Math.sqrt(Math.pow(iter.x - 30, 2) + Math.pow(iter.y - 30, 2));
            sum += Math.pow(r - 20, 2);
            n++;
          }
        }
        return Math.sqrt(sum / n);
      }
      var smoothed = coneDataset(true);
      var raw = coneDataset(true);
      api.cmd.contours(smoothed.layers[0], smoothed, {levels: [80]});
      api.cmd.contours(raw.layers[0], raw, {levels: [80], no_smoothing: true});
      assert(radialError(smoothed) < radialError(raw),
        'smoothed contour is further from the true circle (' +
        radialError(smoothed).toFixed(3) + ' vs ' + radialError(raw).toFixed(3) + ')');
    });

    it('selects an interval of a quarter pixel in coordinate units without a CRS', function () {
      var grid = makeGrid(10, 10, function(x) { return x; });
      grid.bbox = [0, 0, 50, 50]; // 5 units per pixel
      assert.equal(internal.getContourSmoothingDistance(grid, null), 1.25);
    });

    it('converts the interval to meters for a projected CRS', function () {
      var grid = makeGrid(10, 10, function(x) { return x; });
      grid.bbox = [0, 0, 50, 50]; // 5 units per pixel
      assert.equal(internal.getContourSmoothingDistance(grid, {to_meter: 1}), 1.25);
      // A CRS in feet: a quarter of a five-foot pixel is about 0.381 m.
      assert(Math.abs(internal.getContourSmoothingDistance(
        grid, {to_meter: 0.3048}) - 0.381) < 1e-9);
    });

    it('converts the interval to meters for a lat-long CRS', function () {
      var grid = makeGrid(10, 10, function(x) { return x; });
      // One degree per pixel, centered on the equator where a degree of
      // longitude and a degree of latitude are the same length.
      grid.bbox = [0, -5, 10, 5];
      var d = internal.getContourSmoothingDistance(grid, {is_latlong: true});
      assert(Math.abs(d - 111195 / 4) < 500, 'expected about 28km, got ' + d);
    });

    it('does not collapse the interval to zero at the poles', function () {
      var grid = makeGrid(10, 10, function(x) { return x; });
      grid.bbox = [0, 80, 10, 90]; // a degree of longitude is tiny up here
      var d = internal.getContourSmoothingDistance(grid, {is_latlong: true});
      assert(d > 0, 'interval collapsed to ' + d);
    });

    it('averages the two resolutions of a non-square grid', function () {
      var grid = makeGrid(10, 10, function(x) { return x; });
      grid.bbox = [0, 0, 40, 90]; // 4 units per pixel across, 9 down
      assert.equal(internal.getContourSmoothingDistance(grid, null), 1.5);
    });

    it('picks a sane interval for a one-arcsecond DEM', function () {
      // An SRTM-style tile: 3601 samples of one arcsecond, at latitude 45.
      var grid = makeGrid(8, 8, function(x) { return x; });
      grid.bbox = [10, 45, 10 + 8 / 3600, 45 + 8 / 3600];
      var d = internal.getContourSmoothingDistance(grid, {is_latlong: true});
      assert(d > 5 && d < 8, 'expected roughly 6.5m, got ' + d);
    });
  });

  describe('CLI', function () {
    it('parses contour options', function () {
      var cmd = internal.parseCommands('-contours interval=100 base=50 band=2 field=elev')[0];
      assert.equal(cmd.name, 'contours');
      assert.equal(cmd.options.interval, 100);
      assert.equal(cmd.options.base, 50);
      assert.equal(cmd.options.band, 2);
      assert.equal(cmd.options.field, 'elev');
    });

    it('parses a levels= list', function () {
      var cmd = internal.parseCommands('-contours levels=0,100,500')[0];
      assert.deepEqual(cmd.options.levels, [0, 100, 500]);
    });

    it('parses the no-smoothing flag', function () {
      assert.equal(internal.parseCommands('-contours interval=10')[0]
        .options.no_smoothing, undefined);
      assert.equal(internal.parseCommands('-contours interval=10 no-smoothing')[0]
        .options.no_smoothing, true);
    });

    it('parses the closed flag', function () {
      assert.equal(internal.parseCommands('-contours interval=10 closed')[0]
        .options.closed, true);
    });

    it('converts a GeoTIFF to contour lines', async function () {
      var out = await api.applyCommands(
        '-i ' + GEOTIFF + ' -contours levels=100 -o out.json', {});
      var geojson = JSON.parse(out['out.json']);
      assert.equal(geojson.features.length, 1);
      assert.equal(geojson.features[0].geometry.type, 'LineString');
      assert.equal(geojson.features[0].properties.value, 100);
    });

    it('converts a GeoTIFF to closed contour bands', async function () {
      var out = await api.applyCommands(
        '-i ' + GEOTIFF +
        ' -contours levels=100 closed no-smoothing -o out.json', {});
      var geojson = JSON.parse(out['out.json']);
      assert.equal(geojson.features.length, 2);
      assert.deepEqual(geojson.features.map(function(feature) {
        return feature.properties;
      }), [
        {lower: 0, upper: 100},
        {lower: 100, upper: 255}
      ]);
      geojson.features.forEach(function(feature) {
        assert(/Polygon$/.test(feature.geometry.type));
      });
    });

    it('replaces the raster layer by default', async function () {
      // A second -contours run against the raster fails once it is gone.
      await assert.rejects(function () {
        return api.applyCommands('-i ' + GEOTIFF +
          ' -contours levels=100 -contours levels=150 -o out.json', {});
      }, /requires a raster layer/);
    });

    it('keeps the raster layer when + is used', async function () {
      var out = await api.applyCommands('-i ' + GEOTIFF +
        ' -contours levels=100 + name=iso' +
        ' -contours target=wgs84-geographic-epsg4326 levels=150 + name=iso2' +
        ' -o target=iso2 out.json', {});
      var geojson = JSON.parse(out['out.json']);
      assert.equal(geojson.features[0].properties.value, 150);
    });
  });
});
