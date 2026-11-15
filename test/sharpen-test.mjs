import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

function makeDataset(width, height, raster) {
  var cell = 0.001;
  var bbox = [0, 0, width * cell, height * cell];
  raster.grid.bbox = bbox;
  raster.grid.transform = [cell, 0, 0, 0, -cell, bbox[3]];
  return {
    info: {crs_string: 'wgs84'},
    layers: [{name: 'img', raster_type: 'grid', raster: raster}]
  };
}

function makeElevationDataset(width, height, fn) {
  var samples = new Float32Array(width * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) samples[y * width + x] = fn(x, y);
  }
  return makeDataset(width, height, {
    sourceId: 'dem',
    interpretation: 'continuous',
    grid: {width: width, height: height, bands: 1, pixelType: 'float32', samples: samples,
      sampleBands: [0], nodata: null}
  });
}

// @fn(x, y) returns [r, g, b] or [r, g, b, a]
function makeImageDataset(width, height, bands, fn) {
  var samples = new Uint8Array(width * height * bands);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      samples.set(fn(x, y), (y * width + x) * bands);
    }
  }
  return makeDataset(width, height, {
    sourceId: 'img',
    interpretation: 'image',
    grid: {width: width, height: height, bands: bands, pixelType: 'uint8', samples: samples,
      sampleBands: bands == 4 ? [0, 1, 2, 3] : [0, 1, 2], nodata: null},
    view: {recipe: {type: 'rgb', bands: bands == 4 ? [0, 1, 2, 3] : [0, 1, 2], scaling: 'none'}}
  });
}

async function runOnDataset(dataset, commands) {
  var catalog = new internal.Catalog().addDataset(dataset);
  var job = new internal.Job(catalog);
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return job.catalog;
}

function firstRaster(catalog) {
  return catalog.getLayers()[0].layer.raster;
}

// a north-south ridge: the west face is lit, the east face is shaded
var W = 81;
function ridge(x) { return 1000 - Math.abs(x - 40) * 20; }
var HILLSHADE = '-hillshade smoothing=off lighting=hard azimuth=270';

describe('mapshaper-sharpen.mjs', function () {

  describe('sharpenTones()', function () {
    var w = 30, h = 5;
    function makeTones(fn) {
      var tones = new Float32Array(w * h);
      for (var i = 0; i < tones.length; i++) tones[i] = fn(i % w);
      return tones;
    }

    it('increases contrast across a shadow/highlight edge', function () {
      // signed tones: shadow opacity 0.4 meets highlight opacity 0.2
      var tones = makeTones(function(x) { return x < 15 ? -0.4 : 0.2; });
      internal.sharpenTones(tones, null, w, h, 1, 2, 0);
      assert(tones[2 * w + 14] < -0.4);
      assert(tones[2 * w + 15] > 0.2);
      assert(Math.abs(tones[2 * w + 1] + 0.4) < 1e-6);
      assert(Math.abs(tones[2 * w + 28] - 0.2) < 1e-6);
    })

    it('leaves flat (zero) tones alone and respects the threshold', function () {
      var tones = makeTones(function(x) { return x < 15 ? 0 : -0.01; });
      internal.sharpenTones(tones, null, w, h, 1, 2, 0.02);
      assert.equal(tones[2 * w + 14], 0);
      assert(Math.abs(tones[2 * w + 15] + 0.01) < 1e-6);
    })

    it('writeHillshadeRgba() clamps sharpened tones to valid opacities', function () {
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1.3, 1.2, 0]), null, 'shadow');
      assert.deepEqual(Array.from(rgba), [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
    })
  })

  describe('hillshades', function () {
    it('-hillshade has no sharpening option', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(W, 41, ridge), HILLSHADE + ' sharpening=1'),
        /sharpening/);
    })

    it('increases shading contrast across a ridge, and keeps the hillshade settings', async function () {
      var plain = await runOnDataset(makeElevationDataset(W, 41, ridge), HILLSHADE);
      var sharp = await runOnDataset(makeElevationDataset(W, 41, ridge), HILLSHADE + ' -sharpen 1');
      function alphaAt(catalog, x) {
        return firstRaster(catalog).grid.samples[(20 * W + x) * 4 + 3];
      }
      assert(alphaAt(sharp, 41) > alphaAt(plain, 41)); // shadow side, next to the crest
      assert(alphaAt(sharp, 39) > alphaAt(plain, 39)); // highlight side
      assert.equal(alphaAt(sharp, 20), alphaAt(plain, 20)); // uniform slope
      assert.equal(firstRaster(sharp).derivation.type, 'hillshade');
      assert.equal(sharp.getLayers()[0].layer.name, 'img');
    })

    it('a sharpened hillshade can be blended', async function () {
      var catalog = await runOnDataset(makeElevationDataset(W, 41, ridge),
        HILLSHADE + ' + name=hs -sharpen target=hs -blend source=hs target=img');
      assert.equal(catalog.getLayers().length, 1);
    })
  })

  describe('images', function () {
    // a vertical edge between two colors with the same hue
    function edge(x) { return x < 10 ? [100, 60, 40] : [160, 120, 100]; }

    it('sharpens an edge by lightness, leaving flat areas and hues alone', async function () {
      var catalog = await runOnDataset(makeImageDataset(20, 5, 3, edge), '-sharpen 1');
      var s = firstRaster(catalog).grid.samples;
      function px(x) { var j = (2 * 20 + x) * 3; return [s[j], s[j + 1], s[j + 2]]; }
      var dark = px(9), light = px(10);
      assert(dark[0] < 100 && light[0] > 160);
      // the same amount is added to each channel
      assert.equal(100 - dark[0], 60 - dark[1]);
      assert.equal(160 - light[0], 120 - light[1]);
      assert.deepEqual(px(0), [100, 60, 40]);
      assert.deepEqual(px(19), [160, 120, 100]);
    })

    it('leaves alpha and transparent pixels unchanged', async function () {
      var catalog = await runOnDataset(makeImageDataset(20, 5, 4, function(x) {
        return x == 5 ? [0, 0, 0, 0] : edge(x).concat([200]);
      }), '-sharpen 1');
      var s = firstRaster(catalog).grid.samples;
      var j = (2 * 20 + 5) * 4;
      assert.deepEqual(Array.from(s.subarray(j, j + 4)), [0, 0, 0, 0]);
      assert.equal(s[(2 * 20 + 9) * 4 + 3], 200);
    })

    it('threshold= skips small differences', async function () {
      var catalog = await runOnDataset(makeImageDataset(20, 5, 3, edge), '-sharpen 1 threshold=0.5');
      var s = firstRaster(catalog).grid.samples;
      assert.deepEqual(Array.from(s.subarray((2 * 20 + 9) * 3, (2 * 20 + 9) * 3 + 3)), [100, 60, 40]);
    })

    it('+ adds a layer named "sharpen"', async function () {
      var catalog = await runOnDataset(makeImageDataset(20, 5, 3, edge), '-sharpen +');
      var names = catalog.getLayers().map(function(o) { return o.layer.name; });
      assert.deepEqual(names.sort(), ['img', 'sharpen']);
    })
  })

  describe('errors', function () {
    it('rejects elevation rasters', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, ridge), '-sharpen'), /-hillshade first/);
    })

    it('rejects invalid options', async function () {
      var img = function() { return makeImageDataset(5, 5, 3, function() { return [1, 2, 3]; }); };
      await assert.rejects(runOnDataset(img(), '-sharpen amount=5'), /amount=/);
      await assert.rejects(runOnDataset(img(), '-sharpen radius=0'), /radius=/);
      await assert.rejects(runOnDataset(img(), '-sharpen threshold=2'), /threshold=/);
    })
  })
})
