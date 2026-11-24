import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

function makeGrid(width, height, fn, opts) {
  var o = opts || {};
  var bands = o.bands || 1;
  var cell = o.cell || 10;
  var samples = new (o.type || Float32Array)(width * height * bands);
  var x, y, b, val;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      val = fn(x, y);
      for (b = 0; b < bands; b++) {
        samples[(y * width + x) * bands + b] = bands > 1 ? val[b] : val;
      }
    }
  }
  return {
    width: width,
    height: height,
    bands: bands,
    pixelType: o.type == Uint8Array ? 'uint8' : 'float32',
    samples: samples,
    sampleBands: Array.from({length: bands}, (d, i) => i),
    nodata: 'nodata' in o ? o.nodata : null,
    bbox: [0, 0, width * cell, height * cell],
    transform: [cell, 0, 0, 0, -cell, height * cell]
  };
}

// A projected elevation raster of 10 m pixels
function makeDataset(width, height, fn, opts) {
  var o = opts || {};
  var grid = makeGrid(width, height, fn, o);
  return {
    info: {crs_string: '+proj=merc +datum=WGS84'},
    layers: [{
      name: 'dem',
      raster_type: 'grid',
      raster: {
        sourceId: 'dem',
        interpretation: o.interpretation || 'continuous',
        grid: grid,
        derivation: {type: 'gray', sourceId: 'dem', bands: [0]},
        view: {recipe: {type: 'gray', bands: [0]}}
      }
    }]
  };
}

async function runOnDataset(dataset, commands) {
  var catalog = new internal.Catalog().addDataset(dataset);
  var job = new internal.Job(catalog);
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return job.catalog;
}

function findGrid(catalog, name) {
  var lyr = catalog.getLayers().map(o => o.layer).find(lyr => lyr.name == name);
  return lyr && lyr.raster.grid;
}

function ramp(x, y) {
  return x * 3 + y * 2;
}

describe('mapshaper-resample.mjs', function () {

  describe('parseResampleResolution()', function () {
    var parse = internal.parseResampleResolution;

    it('reads frame-relative resolutions, percentages and widths', function () {
      assert.deepEqual(parse('2x'), {type: 'frame', pixelsPerFramePixel: 2});
      assert.deepEqual(parse('1.5X'), {type: 'frame', pixelsPerFramePixel: 1.5});
      assert.deepEqual(parse('144dpi'), {type: 'frame', pixelsPerFramePixel: 2});
      assert.deepEqual(parse('50%'), {type: 'scale', scale: 0.5});
      assert.deepEqual(parse('4000px'), {type: 'width', width: 4000});
    });

    it('rejects a number without units, and other invalid values', function () {
      ['2', '', '0x', '-2x', '10.5px', 'full', '2 cm'].forEach(function(str) {
        assert.throws(function() { parse(str); }, /resolution/i, str);
      });
    });
  });

  describe('getAxisTable()', function () {
    it('averages pairs of pixels when halving', function () {
      var t = internal.getAxisTable(0, 2, 3, 6, 'average');
      assert.deepEqual(Array.from(t.indexes), [0, 1, 2, 3, 4, 5]);
      assert.deepEqual(Array.from(t.weights), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
      assert.deepEqual(Array.from(t.centers), [1, 3, 5]);
    });

    it('weights pixels by the part of the footprint they cover', function () {
      var t = internal.getAxisTable(0, 1.5, 2, 3, 'average');
      assert.deepEqual(Array.from(t.indexes), [0, 1, 1, 2]);
      assert.deepEqual(Array.from(t.weights).map(w => +w.toFixed(6)), [0.666667, 0.333333, 0.333333, 0.666667]);
    });

    it('output pixels that overlap the edge of the grid take the edge pixel', function () {
      var t = internal.getAxisTable(-0.4, 1, 3, 2, 'average');
      assert.deepEqual(Array.from(t.centers), [0, 1, 1]);
      assert.equal(internal.getAxisTable(-1, 1, 1, 2, 'average').centers[0], -1);
    });
  });

  describe('resampleRasterGrid()', function () {
    it('halving averages blocks of 2 x 2 pixels', function () {
      var grid = makeGrid(4, 2, ramp);
      var out = internal.resampleRasterGrid(grid, grid.bbox, 2, 1);
      assert.deepEqual(Array.from(out.samples), [(0 + 3 + 2 + 5) / 4, (6 + 9 + 8 + 11) / 4]);
      assert.deepEqual(out.transform, [20, 0, 0, 0, -20, 20]);
      assert(!out.coverage);
    });

    it('the same grid is copied exactly, by every method', function () {
      var grid = makeGrid(7, 5, function(x, y) { return Math.sin(x * 1.3) * 100 + y * y; });
      ['auto', 'average', 'bilinear', 'bicubic', 'nearest'].forEach(function(method) {
        var out = internal.resampleRasterGrid(grid, grid.bbox, 7, 5, method);
        assert.deepEqual(Array.from(out.samples), Array.from(grid.samples), method);
      });
    });

    ['bspline', 'bicubic'].forEach(function(method) {
      it('enlarging keeps a plane a plane (' + method + '), away from the edges', function () {
        var grid = makeGrid(10, 10, ramp);
        var out = internal.resampleRasterGrid(grid, grid.bbox, 40, 40, method);
        for (var y = 8; y < 32; y++) {
          for (var x = 8; x < 32; x++) {
            // output pixel centers in source pixel units, minus the half pixel
            // between a source pixel's edge and its center
            var expected = ramp((x + 0.5) / 4 - 0.5, (y + 0.5) / 4 - 0.5);
            assert(Math.abs(out.samples[y * 40 + x] - expected) < 1e-4);
          }
        }
      });
    });

    it('enlarging a sharp bend: bspline doesn\'t overshoot, bicubic does', function () {
      var grid = makeGrid(11, 1, function(x) { return x < 5 ? 0 : (x - 5) * 20; });
      var lowest = function(method) {
        return Math.min.apply(null, internal.resampleRasterGrid(grid, grid.bbox, 44, 1, method).samples);
      };
      assert.equal(lowest('bspline'), 0);
      assert.equal(lowest(), 0); // the default for enlarging
      assert(lowest('bicubic') < 0);
    });

    it('leaves out nodata pixels, and output pixels centered on them are empty', function () {
      var grid = makeGrid(4, 2, function(x) { return x == 0 ? -9999 : x * 10; }, {nodata: -9999});
      var out = internal.resampleRasterGrid(grid, grid.bbox, 2, 1, 'average');
      // the first output pixel is centered on the edge between columns 0 and
      // 1, so it takes column 1, and is covered
      assert(!out.coverage);
      assert.equal(out.samples[0], 10);
      assert.equal(out.samples[1], 25);
      out = internal.resampleRasterGrid(grid, grid.bbox, 4, 2, 'bicubic');
      assert.equal(out.coverage[0], 0);
      assert.equal(out.coverage[1], 1);
    });

    it('averages colors by alpha, so transparent pixels add no color', function () {
      var grid = makeGrid(2, 1, function(x) { return x == 0 ? [0, 0, 255, 255] : [255, 0, 0, 0]; },
        {bands: 4, type: Uint8Array});
      var out = internal.resampleRasterGrid(grid, grid.bbox, 1, 1, 'average');
      assert.deepEqual(Array.from(out.samples), [0, 0, 255, 128]);
    });

    it('nearest copies values', function () {
      var grid = makeGrid(3, 1, function(x) { return [7, 9, 4][x]; }, {type: Uint8Array});
      var out = internal.resampleRasterGrid(grid, grid.bbox, 6, 1, 'nearest');
      assert.deepEqual(Array.from(out.samples), [7, 7, 9, 9, 4, 4]);
    });
  });

  describe('-resample', function () {
    it('50% halves the raster, over the same area', async function () {
      var catalog = await runOnDataset(makeDataset(40, 20, ramp), '-resample 50%');
      var grid = findGrid(catalog, 'dem');
      assert.equal(grid.width, 20);
      assert.equal(grid.height, 10);
      assert.deepEqual(grid.bbox, [0, 0, 400, 200]);
    });

    it('a width in pixels keeps the aspect ratio', async function () {
      var grid = findGrid(await runOnDataset(makeDataset(40, 20, ramp), '-resample 30px'), 'dem');
      assert.equal(grid.width, 30);
      assert.equal(grid.height, 15);
    });

    it('2x makes two raster pixels per frame pixel, on the frame\'s pixel grid', async function () {
      // frame pixels are 25 m, so raster pixels are 12.5 m
      var catalog = await runOnDataset(makeDataset(100, 80, ramp),
        '-frame bbox=0,0,1000,800 width=40px -resample 2x target=dem');
      var grid = findGrid(catalog, 'dem');
      assert.equal(grid.width, 80);
      assert.equal(grid.height, 64);
      assert.deepEqual(grid.bbox, [0, 0, 1000, 800]);
      assert(!grid.coverage);
    });

    it('an edge between frame pixels moves out to the next one', async function () {
      // frame pixels are 25 m, starting at -10 m, so the raster's left edge is
      // 0.4 of a frame pixel in, and its right edge 0.4 of a pixel past 990 m
      var catalog = await runOnDataset(makeDataset(100, 80, ramp),
        '-frame bbox=-10,0,1240,800 width=50px -resample 1x target=dem');
      var grid = findGrid(catalog, 'dem');
      assert.deepEqual(grid.bbox, [-10, 0, 1015, 800]);
      assert.equal(grid.width, 41);
      assert(!grid.coverage || grid.coverage.indexOf(0) == -1);
    });

    it('dpi is relative to the frame\'s size in inches', async function () {
      // 2in is 144 frame pixels of 8.33 m, and 144dpi is two raster pixels each
      var catalog = await runOnDataset(makeDataset(100, 80, ramp),
        '-frame bbox=0,0,1200,800 width=2in -resample 144dpi target=dem');
      assert.equal(findGrid(catalog, 'dem').width, 240);
      assert.equal(findGrid(catalog, 'dem').height, 192);
    });

    it('crop keeps the frame and its bleed', async function () {
      var catalog = await runOnDataset(makeDataset(100, 80, ramp),
        '-frame bbox=200,200,600,600 width=40px -resample 1x bleed=5 target=dem');
      var grid = findGrid(catalog, 'dem');
      assert.deepEqual(grid.bbox, [150, 150, 650, 650]);
      assert.equal(grid.width, 50);
      catalog = await runOnDataset(makeDataset(100, 80, ramp),
        '-frame bbox=200,200,600,600 width=40px -resample 100% crop target=dem');
      grid = findGrid(catalog, 'dem');
      assert.deepEqual(grid.bbox, [100, 100, 700, 700]);
      assert.equal(grid.width, 60);
    });

    it('+ keeps the source layer', async function () {
      var catalog = await runOnDataset(makeDataset(40, 20, ramp), '-resample 50% + name=half');
      assert.equal(findGrid(catalog, 'dem').width, 40);
      assert.equal(findGrid(catalog, 'half').width, 20);
    });

    it('nodata pixels stay nodata', async function () {
      var catalog = await runOnDataset(makeDataset(40, 20, function(x) { return x < 10 ? -9999 : x; },
        {nodata: -9999}), '-resample 50%');
      var grid = findGrid(catalog, 'dem');
      assert.equal(grid.nodata, -9999);
      assert.equal(grid.samples[0], -9999);
      assert.equal(grid.samples[19], 39 - 0.5);
    });

    it('needs a frame for x, dpi and crop', async function () {
      await assert.rejects(runOnDataset(makeDataset(10, 10, ramp), '-resample 2x'), /frame/);
      await assert.rejects(runOnDataset(makeDataset(10, 10, ramp), '-resample 50% crop'), /frame/);
    });

    it('categorical rasters use nearest', async function () {
      var catalog = await runOnDataset(makeDataset(4, 1, function(x) { return [1, 2, 3, 4][x]; },
        {interpretation: 'categorical'}), '-resample 50%');
      assert.deepEqual(Array.from(findGrid(catalog, 'dem').samples), [2, 4]);
      await assert.rejects(runOnDataset(makeDataset(4, 1, ramp, {interpretation: 'categorical'}),
        '-resample 50% method=average'), /nearest/);
    });
  });
});
