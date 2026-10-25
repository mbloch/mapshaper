import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

function makeElevation(width, height, fn) {
  var elev = new Float32Array(width * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      elev[y * width + x] = fn(x, y);
    }
  }
  return elev;
}

function constantCells(height, size) {
  return new Float64Array(height).fill(size);
}

function shadeAt(fn, lights) {
  var w = 5, h = 5;
  var elev = makeElevation(w, h, fn);
  var shade = internal.computeHillshade(elev, null, w, h, constantCells(h, 1), constantCells(h, 1),
    lights || internal.getHillshadeLights(315, 45, true), 1);
  return shade[2 * w + 2];
}

// A north-up lat-long elevation grid of about 111 m pixels near the equator
function makeElevationDataset(width, height, fn, opts) {
  var o = opts || {};
  var cell = 0.001;
  var bbox = [0, 0, width * cell, height * cell];
  return {
    info: {crs_string: 'wgs84'},
    layers: [{
      name: 'dem',
      raster_type: 'grid',
      raster: {
        sourceId: 'dem',
        interpretation: 'continuous',
        grid: {
          width: width,
          height: height,
          bands: 1,
          pixelType: 'float32',
          samples: makeElevation(width, height, fn),
          sampleBands: [0],
          nodata: 'nodata' in o ? o.nodata : null,
          bbox: bbox,
          transform: [cell, 0, 0, 0, -cell, bbox[3]]
        },
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

describe('mapshaper-hillshade.mjs', function () {

  describe('getHillshadeLights()', function () {
    it('single light', function () {
      assert.deepEqual(internal.getHillshadeLights(300, 30, true), [{azimuth: 300, altitude: 30, weight: 1}]);
    })

    it('default blend centers on the main light and has weights summing to 1', function () {
      var lights = internal.getHillshadeLights();
      var total = lights.reduce(function(sum, o) { return sum + o.weight; }, 0);
      assert.deepEqual(lights.map(function(o) { return o.azimuth; }), [225, 270, 315, 360]);
      assert(Math.abs(total - 1) < 1e-9);
    })
  })

  describe('getAutoExaggeration()', function () {
    it('is 1 at large scales and grows with pixel size, up to 10', function () {
      assert.equal(internal.getAutoExaggeration(10), 1);
      assert.equal(internal.getAutoExaggeration(50), 1);
      assert(Math.abs(internal.getAutoExaggeration(1000) - Math.sqrt(20)) < 1e-9);
      assert.equal(internal.getAutoExaggeration(1e6), 10);
    })
  })

  describe('computeHillshade()', function () {
    it('flat ground is 1', function () {
      assert(Math.abs(shadeAt(function() { return 100; }) - 1) < 1e-6);
      assert(Math.abs(shadeAt(function() { return 100; }, internal.getHillshadeLights()) - 1) < 1e-6);
    })

    it('slopes facing a northwest light are brighter, slopes facing away are darker', function () {
      // y increases southward, so x + y rises toward the southeast
      var facingLight = shadeAt(function(x, y) { return (x + y) * 0.5; });
      var facingAway = shadeAt(function(x, y) { return -(x + y) * 0.5; });
      assert(facingLight > 1);
      assert(facingAway < 1);
    })

    it('exaggeration steepens slopes', function () {
      var w = 5, h = 5;
      var elev = makeElevation(w, h, function(x, y) { return -(x + y) * 0.2; });
      var lights = internal.getHillshadeLights(315, 45, true);
      var a = internal.computeHillshade(elev, null, w, h, constantCells(h, 1), constantCells(h, 1), lights, 1)[12];
      var b = internal.computeHillshade(elev, null, w, h, constantCells(h, 1), constantCells(h, 1), lights, 3)[12];
      assert(b < a);
    })

    it('invalid pixels are skipped and do not create edges', function () {
      var w = 5, h = 5;
      var elev = makeElevation(w, h, function() { return 100; });
      var valid = new Uint8Array(w * h).fill(1);
      elev[12] = -32768;
      valid[12] = 0;
      var shade = internal.computeHillshade(elev, valid, w, h, constantCells(h, 1), constantCells(h, 1),
        internal.getHillshadeLights(), 1);
      assert.equal(shade[12], 0);
      assert(Math.abs(shade[11] - 1) < 1e-6);
      assert(Math.abs(shade[7] - 1) < 1e-6);
    })
  })

  describe('renderHillshadeRgba()', function () {
    var shade = Float32Array.from([1, 0.5, 1.4, 0]);
    var valid = Uint8Array.from([1, 1, 1, 0]);

    it('shadow style: flat and lit pixels are clear, shaded pixels are black with alpha', function () {
      var rgba = internal.renderHillshadeRgba(shade, valid, 'shadow', {maxOpacity: 1, gamma: 1});
      assert.deepEqual(Array.from(rgba), [0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0]);
    })

    it('max opacity caps the darkest shadows', function () {
      var rgba = internal.renderHillshadeRgba(Float32Array.from([0, 0.5]), null, 'shadow', {maxOpacity: 0.5, gamma: 1});
      assert.equal(rgba[3], 128);
      assert.equal(rgba[7], 64);
    })

    it('gamma below 1 strengthens faint shading without changing full shadow', function () {
      var s = Float32Array.from([0.9, 0]);
      var linear = internal.renderHillshadeRgba(s, null, 'shadow', {maxOpacity: 1, gamma: 1});
      var curved = internal.renderHillshadeRgba(s, null, 'shadow', {maxOpacity: 1, gamma: 0.5});
      assert.equal(linear[3], 26);
      assert.equal(curved[3], 81); // sqrt(0.1) * 255
      assert.equal(curved[7], 255);
    })

    it('lit slopes get white highlights, capped below the shadow opacity', function () {
      var flat = Math.sin(Math.PI / 4);
      var facing = 1.01 / flat; // just past a slope facing the light, to avoid float32 rounding
      var rgba = internal.renderHillshadeRgba(Float32Array.from([facing, 1, 0]), null, 'shadow',
        {maxOpacity: 0.5, gamma: 1, flatBrightness: flat});
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 255, 255, Math.round(0.5 * 0.6 * 255)]);
      assert.equal(rgba[7], 0);
      assert.equal(rgba[11], 128);
      assert(rgba[3] < rgba[11]);
    })

    it('defaults: max opacity 0.55, gamma 0.5', function () {
      var rgba = internal.renderHillshadeRgba(Float32Array.from([0, 0.75]), null, 'shadow');
      assert.equal(rgba[3], Math.round(0.55 * 255));
      assert.equal(rgba[7], Math.round(0.5 * 0.55 * 255));
    })

    it('gray style is opaque, with flat ground at the light\'s brightness', function () {
      var rgba = internal.renderHillshadeRgba(shade, valid, 'gray', {gamma: 1, flatBrightness: 0.7});
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [179, 179, 179, 255]);
      assert.equal(rgba[4], 89);
      assert.equal(rgba[8], 250);
      assert.deepEqual(Array.from(rgba.subarray(12, 16)), [0, 0, 0, 0]);
    })
  })

  describe('generalizeTerrain()', function () {
    it('leaves flat ground unchanged', function () {
      var elev = makeElevation(20, 20, function() { return 250; });
      var out = internal.generalizeTerrain(elev, null, 20, 20, 2);
      assert(out.every(function(v) { return Math.abs(v - 250) < 1e-3; }));
    })

    it('smooths out pixel-scale roughness', function () {
      var w = 30, h = 30;
      var elev = makeElevation(w, h, function(x, y) { return (x + y) % 2 ? 10 : -10; });
      var out = internal.generalizeTerrain(elev, null, w, h, 2);
      var center = out[15 * w + 15];
      assert(Math.abs(center) < 2);
    })

    it('keeps nodata pixels unchanged', function () {
      var w = 20, h = 20;
      var elev = makeElevation(w, h, function(x) { return x * 10; });
      var valid = new Uint8Array(w * h).fill(1);
      for (var i = 0; i < w; i++) {
        elev[i] = -32768;
        valid[i] = 0;
      }
      var out = internal.generalizeTerrain(elev, valid, w, h, 2);
      assert.equal(out[5], -32768);
      assert(out[w * 10 + 10] > 50 && out[w * 10 + 10] < 150);
    })
  })

  describe('featurePreservingSmooth()', function () {
    var w = 41, h = 30;
    // a sharp ridge along x = 20, with noise that is small relative to the ridge
    function noisyRidge(x, y) {
      var noise = ((x * 7919 + y * 104729) % 13) / 12 - 0.5;
      return 100 - 5 * Math.abs(x - 20) + noise;
    }
    function smooth(elev, valid) {
      return internal.featurePreservingSmooth(elev, valid, w, h,
        constantCells(h, 10), constantCells(h, 10), 1, {});
    }

    it('leaves flat ground unchanged', function () {
      var elev = makeElevation(w, h, function() { return 250; });
      var out = smooth(elev, new Uint8Array(w * h).fill(1));
      assert(out.every(function(v) { return Math.abs(v - 250) < 1e-3; }));
    })

    it('removes noise but keeps the ridge crest sharp', function () {
      var elev = makeElevation(w, h, noisyRidge);
      var out = smooth(elev, new Uint8Array(w * h).fill(1));
      var before = 0, after = 0, n = 0;
      for (var y = 8; y < h - 8; y++) {
        for (var x = 8; x < w - 8; x++) {
          if (Math.abs(x - 20) < 2) continue;
          before += Math.abs(elev[y * w + x] - (100 - 5 * Math.abs(x - 20)));
          after += Math.abs(out[y * w + x] - (100 - 5 * Math.abs(x - 20)));
          n++;
        }
      }
      assert(after < before / 2, 'noise: ' + before / n + ' -> ' + after / n);
      assert(Math.abs(out[15 * w + 20] - 100) < 1.5, 'crest: ' + out[15 * w + 20]);
    })

    it('keeps nodata pixels unchanged', function () {
      var elev = makeElevation(w, h, noisyRidge);
      var valid = new Uint8Array(w * h).fill(1);
      elev[0] = -32768;
      valid[0] = 0;
      var out = smooth(elev, valid);
      assert.equal(out[0], -32768);
    })

    function totalChange(opts) {
      var elev = makeElevation(w, h, noisyRidge);
      var out = internal.featurePreservingSmooth(elev, new Uint8Array(w * h).fill(1), w, h,
        constantCells(h, 10), constantCells(h, 10), 1, opts);
      var max = 0, sum = 0;
      for (var i = 0; i < elev.length; i++) {
        max = Math.max(max, Math.abs(out[i] - elev[i]));
        sum += Math.abs(out[i] - elev[i]);
      }
      return {max: max, sum: sum};
    }

    it('maxChange limits how far elevations move', function () {
      assert(totalChange({}).max > 0.2);
      assert(totalChange({maxChange: 0.1}).max <= 0.1 + 1e-4);
    })

    it('a lower threshold smooths less', function () {
      assert(totalChange({threshold: 2}).sum < totalChange({threshold: 20}).sum / 2);
    })

    it('accepts a radius', function () {
      assert(totalChange({radius: 1}).sum > 0);
      assert.notEqual(totalChange({radius: 1}).sum, totalChange({radius: 6}).sum);
    })
  })

  describe('computeLightAdjustment()', function () {
    var w = 60, h = 60;
    function adjustment(fn, azimuth) {
      var elev = makeElevation(w, h, fn);
      var offsets = internal.computeLightAdjustment(elev, new Uint8Array(w * h).fill(1), w, h,
        azimuth, 45, 6);
      return offsets[30 * w + 30] * 180 / Math.PI;
    }

    it('turns a NW light toward the west on north-south ridges', function () {
      var deg = adjustment(function(x) { return 100 * Math.sin(x / 4); }, 315);
      assert(Math.abs(deg + 45) < 1e-3, String(deg));
    })

    it('turns a NW light toward the north on east-west ridges', function () {
      var deg = adjustment(function(x, y) { return 100 * Math.sin(y / 4); }, 315);
      assert(Math.abs(deg - 45) < 1e-3, String(deg));
    })

    it('does not adjust light that already crosses the ridges', function () {
      var deg = adjustment(function(x, y) { return 100 * Math.sin((x - y) / 4); }, 315);
      assert(Math.abs(deg) < 1e-3, String(deg));
    })

    it('does not adjust light on flat ground', function () {
      assert.equal(adjustment(function() { return 10; }, 315), 0);
    })
  })

  describe('computeOpenness()', function () {
    it('is 1 on flat ground and lower in a valley', function () {
      var w = 41, h = 41;
      var elev = makeElevation(w, h, function(x) { return Math.abs(x - 20) * 20; });
      var flat = makeElevation(w, h, function() { return 0; });
      var valid = new Uint8Array(w * h).fill(1);
      var cells = constantCells(h, 10);
      var open = internal.computeOpenness(flat, valid, w, h, cells, cells, 1, 10);
      assert(Math.abs(open[20 * w + 20] - 1) < 1e-6);
      open = internal.computeOpenness(elev, valid, w, h, cells, cells, 1, 10);
      assert(open[20 * w + 20] < 0.6);
      assert(open[20 * w + 20] < open[20 * w + 30]);
    })
  })

  describe('blendAmbientLight()', function () {
    it('mixes directional and ambient light', function () {
      var shade = new Float32Array([0.2, 1.2]);
      internal.blendAmbientLight(shade, new Float32Array([1, 0.5]), null, 0.5);
      assert.deepEqual(Array.from(shade).map(function(v) { return +v.toFixed(3); }), [0.6, 0.85]);
    })
  })

  describe('applyAerialPerspective()', function () {
    it('reduces contrast at low elevations only', function () {
      var n = 200;
      var elev = new Float32Array(n), shade = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        elev[i] = i * 10;
        shade[i] = 0.5;
      }
      internal.applyAerialPerspective(shade, elev, null, 1);
      assert(Math.abs(shade[0] - 1) < 0.01);
      assert(Math.abs(shade[n - 1] - 0.5) < 0.01);
      assert(shade[100] > 0.6 && shade[100] < 0.9);
    })
  })

  describe('getHillshadeCellSizes()', function () {
    it('lat-long pixels narrow toward the poles', function () {
      var grid = {width: 2, height: 2, bbox: [0, 59, 2, 61]};
      var cells = internal.getHillshadeCellSizes(grid, internal.parseCrsString('wgs84'));
      var degree = 6371008.8 * Math.PI / 180;
      assert(Math.abs(cells.heights[0] - degree) < 1);
      assert(Math.abs(cells.widths[0] - degree * Math.cos(60.5 * Math.PI / 180)) < 1);
      assert(cells.widths[0] < cells.widths[1]);
    })

    it('projected pixels are corrected by the scale factor', function () {
      var crs = internal.parseCrsString('webmercator');
      var y60 = 8399737.89; // 60 degrees north
      var grid = {width: 10, height: 1, bbox: [0, y60 - 500, 10000, y60 + 500]};
      var cells = internal.getHillshadeCellSizes(grid, crs);
      assert(Math.abs(cells.widths[0] - 500) < 2);
    })
  })

  describe('-hillshade command', function () {
    function slope(x, y) { return (x + y) * 20; }

    it('replaces the elevation layer, keeping its name', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade');
      var layers = catalog.getLayers();
      var grid;
      assert.equal(layers.length, 1);
      assert.equal(layers[0].layer.name, 'dem');
      grid = layers[0].layer.raster.grid;
      assert.equal(grid.bands, 4);
      assert.equal(grid.pixelType, 'uint8');
      assert.equal(grid.width, 20);
      assert.equal(layers[0].layer.raster.interpretation, 'image');
      assert.equal(layers[0].layer.raster.derivation.type, 'hillshade');
      assert.equal(layers[0].layer.raster.derivation.azimuth, 315);
    })

    it('+ keeps the elevation layer and adds a layer named "hillshade"', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade +');
      var names = catalog.getLayers().map(function(o) { return o.layer.name; });
      assert.deepEqual(names.sort(), ['dem', 'hillshade']);
    })

    it('name= names the output layer', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade + name=relief');
      assert(catalog.getLayers().some(function(o) { return o.layer.name == 'relief'; }));
    })

    it('nodata pixels are transparent', async function () {
      var dataset = makeElevationDataset(10, 10, function(x, y) { return y < 2 ? -9999 : slope(x, y); },
        {nodata: -9999});
      var catalog = await runOnDataset(dataset, '-hillshade style=gray');
      var samples = catalog.getLayers()[0].layer.raster.grid.samples;
      assert.equal(samples[3], 0);
      assert.equal(samples[(5 * 10 + 5) * 4 + 3], 255);
    })

    it('flat ground is clear in shadow style', async function () {
      var catalog = await runOnDataset(makeElevationDataset(10, 10, function() { return 100; }), '-hillshade');
      var samples = catalog.getLayers()[0].layer.raster.grid.samples;
      for (var i = 3; i < samples.length; i += 4) {
        assert.equal(samples[i], 0);
      }
    })

    it('min-elevation=0 flattens the sea floor, including near the coast', async function () {
      // sea floor deepening eastward (facing away from the light), then land
      function coast(x) { return x < 10 ? -100 - x * 100 : 200 + (x - 10) * 10; }
      function seaAlpha(catalog) {
        var samples = catalog.getLayers()[0].layer.raster.grid.samples;
        var max = 0;
        for (var y = 0; y < 20; y++) {
          for (var x = 0; x < 9; x++) {
            max = Math.max(max, samples[(y * 20 + x) * 4 + 3]);
          }
        }
        return max;
      }
      var plain = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade generalize=0');
      var flattened = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade min-elevation=0');
      assert(seaAlpha(plain) > 0);
      assert.equal(seaAlpha(flattened), 0);
      assert.equal(flattened.getLayers()[0].layer.raster.derivation.min_elevation, 0);
    })

    it('raiseLowElevations() and restoreLowElevations()', function () {
      var elev = Float32Array.from([-5, 3, -2, 10]);
      var valid = Uint8Array.from([1, 1, 0, 1]);
      var raised = internal.raiseLowElevations(elev, valid, 0);
      assert.deepEqual(Array.from(elev), [0, 3, -2, 10]);
      assert.deepEqual(Array.from(raised), [1, 0, 0, 0]);
      elev.set([1.5, -0.5, -2, 9]);
      internal.restoreLowElevations(elev, valid, raised, 0);
      assert.deepEqual(Array.from(elev), [0, 0, -2, 9]);
    })

    it('rejects out-of-range max-opacity= and gamma=', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade max-opacity=2'), /max-opacity/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade gamma=0'), /gamma/);
    })

    it('records lighting and smoothing options in the derivation', async function () {
      var catalog = await runOnDataset(makeElevationDataset(30, 30, function(x, y) {
        return 50 * Math.sin(x / 3) + y * 5;
      }), '-hillshade light-adjust=30 ambient=0.3 aerial=0.5 smoothing=lowpass');
      var d = catalog.getLayers()[0].layer.raster.derivation;
      assert.equal(d.light_adjust, 30);
      assert.equal(d.ambient, 0.3);
      assert.equal(d.aerial, 0.5);
      assert.equal(d.smoothing, 'lowpass');
    })

    it('rejects out-of-range lighting options and unknown smoothing methods', async function () {
      var dem = function() { return makeElevationDataset(5, 5, slope); };
      await assert.rejects(runOnDataset(dem(), '-hillshade light-adjust=90'), /light-adjust/);
      await assert.rejects(runOnDataset(dem(), '-hillshade ambient=2'), /ambient/);
      await assert.rejects(runOnDataset(dem(), '-hillshade aerial=-1'), /aerial/);
      await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=bogus'), /smoothing/);
    })

    it('accepts FPS settings and rejects out-of-range values', async function () {
      var dem = function() { return makeElevationDataset(20, 20, slope); };
      var catalog = await runOnDataset(dem(), '-hillshade fps-threshold=10 fps-radius=2 maximum-change=50');
      var d = catalog.getLayers()[0].layer.raster.derivation;
      assert.equal(d.fps_threshold, 10);
      assert.equal(d.fps_radius, 2);
      assert.equal(d.maximum_change, 50);
      await assert.rejects(runOnDataset(dem(), '-hillshade fps-threshold=90'), /fps-threshold/);
      await assert.rejects(runOnDataset(dem(), '-hillshade fps-radius=0'), /fps-radius/);
      await assert.rejects(runOnDataset(dem(), '-hillshade maximum-change=-5'), /maximum-change/);
    })

    it('rejects non-raster layers', async function () {
      await assert.rejects(api.applyCommands('-rectangle bbox=0,0,1,1 -hillshade'), /raster layer/);
    })

    it('rejects an unknown style', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade style=bogus'),
        /Unsupported style/);
    })
  })
})
