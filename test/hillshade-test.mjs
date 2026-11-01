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

  describe('getHillshadeMaxShade()', function () {
    // a plane rising @slopeDeg toward @riseDeg (math angle in grid
    // coordinates, where y increases southward); 45 rises toward the
    // southeast, so it faces a northwest light
    function planeShade(slopeDeg, lights, riseDeg) {
      var t = Math.tan(slopeDeg * Math.PI / 180);
      var r = (riseDeg == null ? 45 : riseDeg) * Math.PI / 180;
      var elev = makeElevation(5, 5, function(x, y) { return (x * Math.cos(r) + y * Math.sin(r)) * t; });
      return internal.computeHillshade(elev, null, 5, 5, constantCells(5, 1), constantCells(5, 1), lights, 1)[12];
    }

    it('is 1 / sin(altitude) for a single light', function () {
      assert(Math.abs(internal.getHillshadeMaxShade(internal.getHillshadeLights(315, 45, true)) - Math.SQRT2) < 1e-9);
      assert(Math.abs(internal.getHillshadeMaxShade(internal.getHillshadeLights(315, 30, true)) - 2) < 1e-9);
    })

    it('is the brightest any slope gets under the default blend of lights', function () {
      var lights = internal.getHillshadeLights();
      var max = internal.getHillshadeMaxShade(lights);
      var brightest = 0;
      for (var deg = 0; deg <= 60; deg++) {
        for (var rise = 0; rise < 90; rise += 2) {
          brightest = Math.max(brightest, planeShade(deg, lights, rise));
        }
      }
      assert(max < Math.SQRT2);
      assert(Math.abs(brightest - max) < 0.005);
    })

    it('a slope facing the blend of lights gets the full highlight', async function () {
      var tones = internal.getHillshadeTones(Float32Array.from([1.249]), null, 'opaque',
        {gamma: 0.75, maxShade: internal.getHillshadeMaxShade(internal.getHillshadeLights())});
      assert(tones[0] > 0.99);
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
        {maxOpacity: 0.5, gamma: 1, maxShade: 1 / flat, highlightRatio: 0.6});
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 255, 255, Math.round(0.5 * 0.6 * 255)]);
      assert.equal(rgba[7], 0);
      assert.equal(rgba[11], 128);
      assert(rgba[3] < rgba[11]);
    })

    it('highlightRatio scales highlights relative to max opacity, capped at 1', function () {
      var flat = Math.sin(Math.PI / 4);
      var facing = 1.01 / flat;
      var half = 1 + 0.5 * (1 / flat - 1);
      var shade = Float32Array.from([facing, half, 0]);
      var rgba = internal.renderHillshadeRgba(shade, null, 'shadow',
        {maxOpacity: 0.5, gamma: 1, maxShade: 1 / flat, highlightRatio: 1});
      assert.equal(rgba[3], 128);
      assert(Math.abs(rgba[7] - 64) <= 1);
      assert.equal(rgba[11], 128);
      rgba = internal.renderHillshadeRgba(shade, null, 'shadow',
        {maxOpacity: 0.5, gamma: 1, maxShade: 1 / flat, highlightRatio: 4});
      assert.equal(rgba[3], 255);
      assert(Math.abs(rgba[7] - 128) <= 1); // scaled, not clipped
    })

    it('colors replace black and white; a color\'s alpha scales its opacity', function () {
      var colors = {shadow: {r: 40, g: 30, b: 90, a: 0.5}, highlight: {r: 255, g: 240, b: 180, a: 1}};
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1, 0.5, 0]), null, 'shadow', colors);
      assert.deepEqual(Array.from(rgba), [40, 30, 90, 128, 255, 240, 180, 128, 0, 0, 0, 0]);
    })

    it('defaults: max opacity 0.55, gamma 0.75', function () {
      var rgba = internal.renderHillshadeRgba(Float32Array.from([0, 0.75]), null, 'shadow');
      assert.equal(rgba[3], Math.round(0.55 * 255));
      assert.equal(rgba[7], Math.round(Math.pow(0.25, 0.75) * 0.55 * 255));
    })

    function oklch(rgba, i) {
      var o = internal.rgbToOklab({r: rgba[i], g: rgba[i + 1], b: rgba[i + 2]});
      return {l: o.l, c: Math.hypot(o.a, o.b)};
    }

    function rampColors(shadow, highlight, base) {
      return internal.getHillshadeRampColors(shadow && internal.parseColor(shadow),
        base && internal.parseColor(base), highlight && internal.parseColor(highlight));
    }

    function opaqueColors(shadow, highlight, base) {
      return {ramp: internal.getHillshadeColorRamp(rampColors(shadow, highlight, base))};
    }

    function hex(rgb) {
      return internal.formatColor(rgb);
    }

    it('opaque style: tones run from the shadow color through the base to the highlight color', function () {
      var colors = opaqueColors('#305440', '#fcffe7', '#9dba98');
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1, 0, 1, -0.5, 0.5]), null, 'opaque', colors);
      var shadowL = oklch(rgba, 0).l, baseL = oklch(rgba, 4).l, highlightL = oklch(rgba, 8).l;
      assert.deepEqual(Array.from(rgba.subarray(0, 12)), [0x30, 0x54, 0x40, 255, 0x9d, 0xba, 0x98, 255, 0xfc, 0xff, 0xe7, 255]);
      // lightness in equal steps (OKLCH), not sRGB values
      assert(Math.abs(oklch(rgba, 12).l - (shadowL + baseL) / 2) < 0.01);
      assert(Math.abs(oklch(rgba, 16).l - (baseL + highlightL) / 2) < 0.01);
    })

    it('opaque style keeps chroma between colors of different hues', function () {
      // a blend in sRGB or OKLab passes close to gray between yellow and blue
      var colors = opaqueColors('#3c4f6e', '#fff4c8', '#9aa8a0');
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-0.5]), null, 'opaque', colors);
      assert(oklch(rgba, 0).c > 0.03);
    })

    it('opaque style: tones beyond -1 and 1 get the end colors', function () {
      var colors = opaqueColors('#305440', '#fcffe7', '#9dba98');
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1.5, 1.5]), null, 'opaque', colors);
      assert.deepEqual(Array.from(rgba), [0x30, 0x54, 0x40, 255, 0xfc, 0xff, 0xe7, 255]);
    })

    it('opaque colors: given colors are used as they are', function () {
      var stops = rampColors('#305440', '#fcffe7', '#9dba98');
      assert.deepEqual([hex(stops.shadow), hex(stops.base), hex(stops.highlight)],
        ['#305440', '#9dba98', '#fcffe7']);
    })

    it('opaque colors: by default, the base is #dfdfdf and the highlight white', function () {
      var stops = rampColors();
      assert.equal(hex(stops.base), '#dfdfdf');
      assert.equal(hex(stops.highlight), '#ffffff');
    })

    it('opaque colors: a missing base is 80% of the lightness from shadow to highlight', function () {
      var stops = rampColors('#305440', '#fcffe7');
      var l = function(rgb) { return internal.rgbToOklab(rgb).l; };
      assert(Math.abs(l(stops.base) - (0.2 * l(stops.shadow) + 0.8 * l(stops.highlight))) < 0.005);
      assert.equal(hex(rampColors('#000000').base), hex(rampColors('#000000', '#ffffff').base));
    })

    it('opaque colors: a missing shadow puts the base 80% of the way to the highlight, with the base\'s hue', function () {
      var l = function(rgb) { return internal.rgbToOklab(rgb).l; };
      [[null, null], ['#e0d8c0', null], ['#c8dcc0', '#fcffe7'], ['#c8d8e8', '#fff8e0']].forEach(function(pair) {
        var stops = rampColors(null, pair[1], pair[0]);
        var base = internal.oklabToOklch(internal.rgbToOklab(stops.base));
        var shadow = internal.oklabToOklch(internal.rgbToOklab(stops.shadow));
        assert(Math.abs(l(stops.base) - (0.2 * l(stops.shadow) + 0.8 * l(stops.highlight))) < 0.005, pair);
        if (base.c > 0.02) assert(Math.abs(shadow.h - base.h) < 3, pair);
      });
      // too dark a base for the extrapolation gives black
      assert.equal(hex(rampColors(null, null, '#808080').shadow), '#000000');
    })

    it('opaque style: invalid pixels are clear', function () {
      var rgba = internal.renderHillshadeRgba(shade, valid, 'opaque', {gamma: 1, maxShade: 1 / 0.7},
        opaqueColors());
      assert.equal(rgba[3], 255);
      assert(oklch(rgba, 4).l < oklch(rgba, 0).l);
      assert(oklch(rgba, 8).l > oklch(rgba, 0).l);
      assert.deepEqual(Array.from(rgba.subarray(12, 16)), [0, 0, 0, 0]);
    })

    it('without base-color, flat ground is #dfdfdf, or 80% of the way from shadow to highlight, at any altitude', async function () {
      function flatPixel(catalog) {
        return Array.from(catalog.getLayers()[0].layer.raster.grid.samples.subarray(0, 4));
      }
      var flat = function() { return makeElevationDataset(10, 10, function() { return 100; }); };
      var gray = flatPixel(await runOnDataset(flat(), '-hillshade style=opaque'));
      var base = rampColors('#305440', '#fcffe7').base;
      assert.deepEqual(gray, [223, 223, 223, 255]);
      assert.deepEqual(flatPixel(await runOnDataset(flat(), '-hillshade style=opaque altitude=20')), gray);
      assert.deepEqual(flatPixel(await runOnDataset(flat(), '-hillshade style=opaque shadow-color=#305440 highlight-color=#fcffe7')),
        [base.r, base.g, base.b, 255]);
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

    it('keeps a tilted plane, up to the edges', function () {
      var elev = makeElevation(w, h, function(x, y) { return 3 * x + 2 * y; });
      var out = smooth(elev, null);
      for (var i = 0; i < out.length; i++) {
        assert(Math.abs(out[i] - elev[i]) < 1e-3);
      }
    })

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
      assert(totalChange({threshold: 2}).sum < totalChange({threshold: 20}).sum * 0.8);
    })

    it('accepts a radius', function () {
      assert(totalChange({radius: 1}).sum > 0);
      assert.notEqual(totalChange({radius: 1}).sum, totalChange({radius: 6}).sum);
    })
  })

  describe('getSlopeThresholds()', function () {
    var w = 20, h = 12;
    var cells = constantCells(h, 10);
    function thresholds(fn, o, valid) {
      return internal.getSlopeThresholds(makeElevation(w, h, fn), valid || null, w, h, cells, cells, 1,
        Object.assign({min: 1, max: 20, slopeFactor: 3, slopeRadius: 0}, o));
    }

    it('flat terrain gets the minimum', function () {
      thresholds(function() { return 50; }).forEach(function(t) { assert.equal(t, 1); });
    })

    it('rises with slope, up to the maximum', function () {
      // a 10-degree slope
      var plane = function(x) { return x * 10 * Math.tan(10 * Math.PI / 180); };
      var t = thresholds(plane, {max: 40});
      assert(Math.abs(t[5 * w + 10] - 31) < 1e-3);
      assert.equal(thresholds(plane)[5 * w + 10], 20);
    })

    it('averages slope over slopeRadius', function () {
      // a single steep step: next to it, slope is averaged with flat ground
      var step = function(x) { return x < 10 ? 0 : 50; };
      var sharp = thresholds(step, {max: 90});
      var averaged = thresholds(step, {max: 90, slopeRadius: 3});
      assert(averaged[5 * w + 10] < sharp[5 * w + 10]);
      assert(averaged[5 * w + 6] > sharp[5 * w + 6]);
    })

    it('ignores pixels without data', function () {
      var valid = new Uint8Array(w * h);
      var t;
      for (var i = 0; i < valid.length; i++) valid[i] = i % w < 10 ? 0 : 1;
      t = thresholds(function(x) { return x < 10 ? -9999 : 50; }, {}, valid);
      assert.equal(t[5 * w + 10], 1);
    })
  })

  describe('dynamic FPS thresholds', function () {
    var w = 31, h = 21, c = 15;
    var cells = constantCells(h, 10);
    // a shallow V-shaped drainage, its sides about 3 degrees steep
    var elev = makeElevation(w, h, function(x, y) { return 0.5 * Math.abs(x - c) + 0.1 * y; });
    function depth(z) {
      var i = 10 * w + c;
      return (z[i - 3] + z[i + 3]) / 2 - z[i];
    }

    it('keep a shallow drainage that a fixed threshold rounds off', function () {
      var low = new Float32Array(w * h).fill(1);
      var fixed = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1, {rounds: 3, threshold: 20});
      var dynamic = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1,
        {rounds: 3, threshold: 20, thresholds: low});
      assert(depth(fixed) < depth(elev) * 0.9);
      assert(depth(dynamic) > depth(elev) * 0.99);
    })

    it('two-level smoothing of gentle terrain is single-level smoothing', function () {
      var low = new Float32Array(w * h).fill(1);
      var opts = {rounds: 3, threshold: 20, thresholds: low};
      var single = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1, opts);
      var two = internal.twoLevelSmooth(elev, null, w, h, cells, cells, 1,
        Object.assign({blendRange: [5, 15]}, opts), {rounds: 1, threshold: 20});
      assert.deepEqual(Array.from(two), Array.from(single));
    })
  })

  describe('twoLevelSmooth()', function () {
    // odd dimensions, so the coarse grid has partial blocks
    var w = 41, h = 31;
    var cells = constantCells(h, 10);
    function smooth(elev, valid, opts) {
      return internal.twoLevelSmooth(elev, valid, w, h, cells, cells, 1,
        Object.assign({rounds: 3}, opts), {rounds: 1});
    }

    it('keeps a tilted plane, up to the edges', function () {
      var elev = makeElevation(w, h, function(x, y) { return 3 * x + 2 * y; });
      var out = smooth(elev, null);
      assert.equal(out.length, w * h);
      for (var i = 0; i < out.length; i++) {
        assert(Math.abs(out[i] - elev[i]) < 0.01);
      }
    })

    it('removes steep one-pixel spikes, which full-resolution FPS keeps as features', function () {
      function spikes(x, y) { return 2 * x + y + (x % 5 == 2 && y % 5 == 2 ? 30 : 0); }
      // deviation of slopes from the plane's
      function roughness(z) {
        var sum = 0, i;
        for (var y = 3; y < h - 3; y++) {
          for (var x = 3; x < w - 3; x++) {
            i = y * w + x;
            sum += Math.abs(z[i + 1] - z[i - 1] - 4) + Math.abs(z[i + w] - z[i - w] - 2);
          }
        }
        return sum;
      }
      var elev = makeElevation(w, h, spikes);
      var one = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1, {rounds: 3});
      var two = smooth(elev, null);
      assert(roughness(one) > roughness(elev) * 0.9);
      assert(roughness(two) < roughness(elev) * 0.1);
    })

    it('leaves pixels without data unchanged, and applies maxChange to the result', function () {
      var elev = makeElevation(w, h, function(x, y) { return x < 10 ? -9999 : 100 + ((x * 7 + y * 3) % 5) * 4; });
      var valid = new Uint8Array(w * h);
      for (var i = 0; i < valid.length; i++) valid[i] = elev[i] > -9999 ? 1 : 0;
      var out = smooth(elev, valid, {maxChange: 0.5});
      for (i = 0; i < out.length; i++) {
        if (!valid[i]) assert.equal(out[i], -9999);
        else assert(Math.abs(out[i] - elev[i]) <= 0.5 + 1e-4);
      }
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

  describe('computeTextureShading()', function () {
    it('is positive on ridges, negative in valleys and zero on a plane', function () {
      var w = 61, h = 61;
      var cells = constantCells(h, 10);
      var ridge = makeElevation(w, h, function(x) { return 500 - Math.abs(x - 30) * 10; });
      var plane = makeElevation(w, h, function(x, y) { return x * 3 + y * 2; });
      var valley = makeElevation(w, h, function(x) { return Math.abs(x - 30) * 10; });
      var at = function(elev, x) {
        return internal.computeTextureShading(elev, null, w, h, cells, 1, 0.5, 4)[30 * w + x];
      };
      assert(at(ridge, 30) > 0.1);
      assert(at(valley, 30) < -0.1);
      assert(Math.abs(at(plane, 30)) < 1e-3);
      assert(Math.abs(at(ridge, 15)) < 1e-3); // a uniform slope, away from the crest
    })
  })

  describe('applyTextureTones()', function () {
    it('darkens drainages up to its opacity and leaves ridges alone', function () {
      var a = 0.5 * Math.tanh(1);
      // flat ground, shadow, full shadow, highlight, ridge
      var tones = new Float32Array([0, -0.4, -1, 0.3, 0.3]);
      internal.applyTextureTones(tones, new Float32Array([-1, -1, -1, -1, 2]), null, 0.5);
      assert.deepEqual(Array.from(tones).map(function(v) { return +v.toFixed(4); }),
        [-a, -(1 - 0.6 * (1 - a)), -1, 0.3 - a, 0.3].map(function(v) { return +v.toFixed(4); }));
    })

    it('lightens ridges up to the highlight opacity', function () {
      var h = 0.4 * Math.tanh(1);
      // flat ground, highlight, shadow, drainage
      var tones = new Float32Array([0, 0.5, -0.3, 0]);
      internal.applyTextureTones(tones, new Float32Array([1, 1, 1, -1]), null, 0.5, 0.4);
      assert.deepEqual(Array.from(tones).map(function(v) { return +v.toFixed(4); }),
        [h, 0.5 + h * 0.5, -0.3 + h, -0.5 * Math.tanh(1)].map(function(v) { return +v.toFixed(4); }));
    })
  })

  describe('blendAmbientLight()', function () {
    it('darkens shading where the sky is hidden, and leaves open ground alone', function () {
      var shade = new Float32Array([0.2, 1.2, 1.2, 0.8]);
      internal.blendAmbientLight(shade, new Float32Array([1, 1, 0.5, 1.2]), null, 0.5);
      assert.deepEqual(Array.from(shade).map(function(v) { return +v.toFixed(3); }), [0.2, 1.2, 0.9, 0.88]);
    })
  })

  describe('sharpenTones()', function () {
    var w = 30, h = 5;

    it('increases contrast across a shadow/highlight edge', function () {
      // signed tones: shadow opacity 0.4 meets highlight opacity 0.2
      var tones = makeElevation(w, h, function(x) { return x < 15 ? -0.4 : 0.2; });
      internal.sharpenTones(tones, null, w, h, 1, 2, 0);
      assert(tones[2 * w + 14] < -0.4);
      assert(tones[2 * w + 15] > 0.2);
      assert(Math.abs(tones[2 * w + 1] + 0.4) < 1e-6);
      assert(Math.abs(tones[2 * w + 28] - 0.2) < 1e-6);
    })

    it('leaves flat (zero) tones alone and respects the threshold', function () {
      var tones = makeElevation(w, h, function(x) { return x < 15 ? 0 : -0.01; });
      internal.sharpenTones(tones, null, w, h, 1, 2, 0.02);
      assert.equal(tones[2 * w + 14], 0);
      assert(Math.abs(tones[2 * w + 15] + 0.01) < 1e-6);
    })

    it('writeHillshadeRgba() clamps sharpened tones to valid opacities', function () {
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1.3, 1.2, 0]), null, 'shadow');
      assert.deepEqual(Array.from(rgba), [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
    })

    it('leaves flat ground alone', function () {
      var tones = Float32Array.from([0, 0, 0, -1, -1, -1]);
      internal.sharpenTones(tones, null, 6, 1, 1, 2, 0);
      assert.deepEqual(Array.from(tones.subarray(0, 3)), [0, 0, 0]);
      assert(tones[3] < -1);
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
      var catalog = await runOnDataset(dataset, '-hillshade style=opaque');
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
      var plain = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade smoothing=off');
      var flattened = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade min-elevation=0');
      var textured = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade min-elevation=0 texture=1');
      assert(seaAlpha(plain) > 0);
      assert.equal(seaAlpha(flattened), 0);
      assert.equal(seaAlpha(textured), 0);
      assert.equal(flattened.getLayers()[0].layer.raster.derivation.min_elevation, 0);
    })

    it('raiseLowElevations() and restoreLowElevations()', function () {
      var elev = Float32Array.from([-5, 3, -2, 10]);
      var valid = Uint8Array.from([1, 1, 0, 1]);
      var raised = internal.raiseLowElevations(elev, valid, 0);
      assert.deepEqual(Array.from(elev), [0, 3, -2, 10]);
      assert.deepEqual(Array.from(raised), [1, 0, 0, 0]);
      var before = Float32Array.from(elev);
      elev.set([1.5, -0.5, -2, 9]);
      internal.restoreLowElevations(elev, before, valid, 0);
      // sea reset; land sinks at most halfway to the minimum
      assert.deepEqual(Array.from(elev), [0, 1.5, -2, 9]);
    })

    it('rejects out-of-range max-opacity= and gamma=', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade max-opacity=2'), /max-opacity/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade gamma=0'), /gamma/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade workers=-1'), /workers/);
    })

    describe('workers=', function () {
      this.timeout(20000);
      function ridges(x, y) {
        return 300 * Math.sin(x / 9) * Math.cos(y / 13) + 80 * Math.sin((x * 3 + y) / 4) - 60;
      }
      async function hillshadeSamples(options) {
        var catalog = await runOnDataset(makeElevationDataset(240, 180, ridges), '-hillshade ' + options);
        return Buffer.from(catalog.getLayers()[0].layer.raster.grid.samples);
      }

      ['', 'smoothing=high fps-min-threshold=1 texture=0.5 aerial=0.4 min-elevation=0',
        'smoothing=lowpass light-adjust=20 single-light style=opaque'].forEach(function(options) {
        it('workers give the same output as the main thread: ' + (options || 'defaults'), async function () {
          var main = await hillshadeSamples(options + ' workers=0');
          var workers = await hillshadeSamples(options + ' workers=3');
          assert(main.equals(workers));
        });
      });

      it('starts workers (the tests above would pass in the main thread too)', async function () {
        var w = 200, h = 150;
        var r = await internal.runHillshadeStages({
          elev: makeElevation(w, h, ridges),
          valid: null,
          width: w,
          height: h,
          cellWidths: constantCells(h, 100),
          cellHeights: constantCells(h, 100)
        }, null, {lights: internal.getHillshadeLights(315, 45), exaggeration: 1, style: 'shadow',
          toneOpts: {}}, {workers: 2});
        assert.equal(r.workers, 2);
        assert.equal(r.tones.length, w * h);
      });

      it('is not recorded in the derivation', async function () {
        var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade workers=2');
        assert(!('workers' in catalog.getLayers()[0].layer.raster.derivation));
      });

      it('automatic: none for small rasters', function () {
        assert.equal(internal.getHillshadeWorkerCount(null, 1000), 0);
        assert.equal(internal.getHillshadeWorkerCount(2, 1000), 2);
        assert.equal(internal.getHillshadeWorkerCount(0, 1e8), 0);
      });
    });

    it('records lighting and smoothing options in the derivation', async function () {
      var catalog = await runOnDataset(makeElevationDataset(30, 30, function(x, y) {
        return 50 * Math.sin(x / 3) + y * 5;
      }), '-hillshade light-adjust=30 ambient=0.3 texture=0.4 aerial=0.5 smoothing=lowpass');
      var d = catalog.getLayers()[0].layer.raster.derivation;
      assert.equal(d.light_adjust, 30);
      assert.equal(d.ambient, 0.3);
      assert.equal(d.texture, 0.4);
      assert.equal(d.texture_detail, 0.5);
      assert.equal(d.aerial, 0.5);
      assert.equal(d.smoothing, 'lowpass');
    })

    it('texture= sets the opacity of drainage shading, independently of max-opacity=', async function () {
      var w = 41;
      function valley(x) { return Math.abs(x - 20) * 20; }
      function alphaAt(catalog) {
        return catalog.getLayers()[0].layer.raster.grid.samples[(20 * w + 20) * 4 + 3];
      }
      var none = await runOnDataset(makeElevationDataset(w, 41, valley), '-hillshade max-opacity=0');
      var light = await runOnDataset(makeElevationDataset(w, 41, valley), '-hillshade max-opacity=0 texture=0.5');
      var strong = await runOnDataset(makeElevationDataset(w, 41, valley), '-hillshade max-opacity=0 texture=1');
      assert.equal(alphaAt(none), 0);
      assert(alphaAt(light) > 0);
      assert(alphaAt(light) <= 128);
      assert(Math.abs(alphaAt(strong) - 2 * alphaAt(light)) <= 1);
    })

    it('texture-highlights= lightens ridges, relative to texture=', async function () {
      var w = 41;
      function ridge(x) { return 1000 - Math.abs(x - 20) * 20; }
      function pixelAt(catalog) {
        var s = catalog.getLayers()[0].layer.raster.grid.samples, j = (20 * w + 20) * 4;
        return [s[j], s[j + 3]];
      }
      var dark = await runOnDataset(makeElevationDataset(w, 41, ridge), '-hillshade max-opacity=0 texture=0.5');
      var lit = await runOnDataset(makeElevationDataset(w, 41, ridge),
        '-hillshade max-opacity=0 texture=0.5 texture-highlights=1');
      assert.equal(pixelAt(dark)[1], 0);
      assert.equal(pixelAt(lit)[0], 255);
      assert(pixelAt(lit)[1] > 0 && pixelAt(lit)[1] <= 128);
      assert.equal(lit.getLayers()[0].layer.raster.derivation.texture_highlights, 1);
    })

    it('rejects out-of-range lighting options and unknown smoothing methods', async function () {
      var dem = function() { return makeElevationDataset(5, 5, slope); };
      await assert.rejects(runOnDataset(dem(), '-hillshade light-adjust=90'), /light-adjust/);
      await assert.rejects(runOnDataset(dem(), '-hillshade ambient=2'), /ambient/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture=2'), /texture/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture=0.5 texture-detail=3'), /texture-detail/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture=0.5 texture-highlights=-1'), /texture-highlights/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture-highlights=1'), /require texture/);
      await assert.rejects(runOnDataset(dem(), '-hillshade aerial=-1'), /aerial/);
      await assert.rejects(runOnDataset(dem(), '-hillshade sharpening=5'), /sharpening/);
      await assert.rejects(runOnDataset(dem(), '-hillshade sharpening=1 sharpen-radius=0'), /sharpen-radius/);
      await assert.rejects(runOnDataset(dem(), '-hillshade sharpening=1 sharpen-threshold=2'), /sharpen-threshold/);
      await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=bogus'), /smoothing/);
    })

    it('sharpening= increases alpha contrast across a ridge', async function () {
      // a north-south ridge: the west face is lit, the east face is shaded
      var w = 81;
      function ridge(x) { return 1000 - Math.abs(x - 40) * 20; }
      function alphaAt(catalog, x) {
        return catalog.getLayers()[0].layer.raster.grid.samples[(20 * w + x) * 4 + 3];
      }
      var plain = await runOnDataset(makeElevationDataset(w, 41, ridge), '-hillshade smoothing=off single-light azimuth=270 sharpening=0');
      var sharp = await runOnDataset(makeElevationDataset(w, 41, ridge),
        '-hillshade smoothing=off single-light azimuth=270 sharpening=1');
      assert(alphaAt(sharp, 41) > alphaAt(plain, 41)); // shadow side, next to the crest
      assert(alphaAt(sharp, 39) > alphaAt(plain, 39)); // highlight side
      assert.equal(alphaAt(sharp, 20), alphaAt(plain, 20)); // uniform slope, away from the crest
      assert.equal(sharp.getLayers()[0].layer.raster.derivation.sharpening, 1);
      assert.equal(sharp.getLayers()[0].layer.raster.derivation.sharpen_radius, 3);
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
      await assert.rejects(runOnDataset(dem(), '-hillshade fps-passes=0'), /fps-passes/);
    })

    describe('smoothing=', function () {
      var dem = function() {
        return makeElevationDataset(20, 20, function(x, y) { return 50 * Math.sin(x / 2) + y * 5; });
      };
      async function getDerivation(cmd) {
        var catalog = await runOnDataset(dem(), cmd);
        return catalog.getLayers()[0].layer.raster.derivation;
      }
      function getAlpha(catalog) {
        return Array.from(catalog.getLayers()[0].layer.raster.grid.samples).filter(function(v, i) {
          return i % 4 == 3;
        });
      }

      it('auto (the default) is low: one FPS pass', async function () {
        var d = await getDerivation('-hillshade');
        assert.equal(d.smoothing, 'low');
        assert.equal(d.fps_passes, 1);
        assert.equal(d.lowpass_radius, null);
        assert.equal((await getDerivation('-hillshade smoothing=auto')).smoothing, 'low');
      })

      it('presets set FPS passes, threshold, radius and levels', async function () {
        function settings(d) { return [d.fps_passes, d.fps_threshold, d.fps_radius, d.fps_levels]; }
        assert.deepEqual(settings(await getDerivation('-hillshade smoothing=low')), [1, 15, 4, 1]);
        assert.deepEqual(settings(await getDerivation('-hillshade smoothing=medium')), [3, 20, 4, 1]);
        assert.deepEqual(settings(await getDerivation('-hillshade smoothing=high')), [3, 20, 4, 2]);
      })

      it('high is smoother than medium', async function () {
        function detail(catalog) {
          var a = getAlpha(catalog), sum = 0;
          for (var i = 1; i < a.length - 1; i++) sum += Math.abs(2 * a[i] - a[i - 1] - a[i + 1]);
          return sum;
        }
        // steep one-pixel spikes on a slope
        var rough = function() {
          return makeElevationDataset(40, 40, function(x, y) {
            return x * 20 + y * 10 + (x % 5 == 2 && y % 5 == 2 ? 400 : 0);
          });
        };
        var medium = await runOnDataset(rough(), '-hillshade smoothing=medium');
        var high = await runOnDataset(rough(), '-hillshade smoothing=high');
        assert(detail(high) < detail(medium));
      })

      it('FPS settings override the preset', async function () {
        var d = await getDerivation('-hillshade smoothing=high fps-passes=2 fps-threshold=25');
        assert.equal(d.smoothing, 'high');
        assert.deepEqual([d.fps_passes, d.fps_threshold, d.fps_radius, d.fps_levels], [2, 25, 4, 2]);
        assert.deepEqual(getAlpha(await runOnDataset(dem(), '-hillshade fps-passes=1 fps-threshold=15')),
          getAlpha(await runOnDataset(dem(), '-hillshade smoothing=low')));
      })

      it('fps-levels= switches two-level smoothing on or off for any preset', async function () {
        assert.deepEqual(getAlpha(await runOnDataset(dem(), '-hillshade smoothing=medium fps-levels=2')),
          getAlpha(await runOnDataset(dem(), '-hillshade smoothing=high')));
        assert.equal((await getDerivation('-hillshade smoothing=high fps-levels=1')).fps_levels, 1);
        assert.notDeepEqual(getAlpha(await runOnDataset(dem(), '-hillshade smoothing=high fps-levels=1')),
          getAlpha(await runOnDataset(dem(), '-hillshade smoothing=high')));
        await assert.rejects(runOnDataset(dem(), '-hillshade fps-levels=3'), /fps-levels/);
        await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=lowpass fps-levels=2'), /FPS settings/);
      })

      it('pasting the printed settings reproduces the result', async function () {
        var cmd = '-hillshade smoothing=high fps-passes=2 sharpening=0.5 highlight-color=#fff0b4';
        var first = await runOnDataset(dem(), cmd);
        var settings = internal.formatHillshadeSettings(first.getLayers()[0].layer.raster.derivation);
        var second = await runOnDataset(dem(), '-hillshade ' + settings);
        assert.deepEqual(getAlpha(second), getAlpha(first));
        assert.deepEqual(Array.from(second.getLayers()[0].layer.raster.grid.samples),
          Array.from(first.getLayers()[0].layer.raster.grid.samples));
      })

      it('off and none skip smoothing', async function () {
        var off = await runOnDataset(dem(), '-hillshade smoothing=off');
        var none = await runOnDataset(dem(), '-hillshade smoothing=none');
        var d = off.getLayers()[0].layer.raster.derivation;
        assert.equal(d.smoothing, 'none');
        assert.equal(d.fps_passes, null);
        assert.deepEqual(getAlpha(off), getAlpha(none));
        assert.notDeepEqual(getAlpha(off), getAlpha(await runOnDataset(dem(), '-hillshade')));
      })

      it('lowpass-radius= sets the blur radius of smoothing=lowpass', async function () {
        var d = await getDerivation('-hillshade smoothing=lowpass');
        assert.equal(d.lowpass_radius, 1);
        assert.equal(d.fps_passes, null);
        assert.equal((await getDerivation('-hillshade smoothing=lowpass lowpass-radius=2.5')).lowpass_radius, 2.5);
        await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=lowpass lowpass-radius=0'), /lowpass-radius/);
      })

      it('rejects settings that don\'t apply to the smoothing method', async function () {
        await assert.rejects(runOnDataset(dem(), '-hillshade lowpass-radius=2'), /lowpass-radius/);
        await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=lowpass fps-passes=2'), /FPS settings/);
        await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=off fps-radius=3'), /FPS settings/);
      })

      it('fps-min-threshold= turns on dynamic smoothing, with default settings', async function () {
        var d = await getDerivation('-hillshade smoothing=high fps-min-threshold=1');
        assert.deepEqual([d.fps_min_threshold, d.fps_slope_factor, d.fps_slope_radius, d.fps_blend],
          [1, 3, 10, '5,15']);
        assert.equal((await getDerivation('-hillshade fps-min-threshold=1')).fps_blend, null);
        assert.equal((await getDerivation('-hillshade')).fps_min_threshold, null);
      })

      it('dynamic smoothing changes gentle terrain, but not steep terrain', async function () {
        var gentle = function() {
          return makeElevationDataset(20, 20, function(x, y) { return 2 * Math.sin(x / 2) + y * 0.5; });
        };
        assert.notDeepEqual(getAlpha(await runOnDataset(gentle(), '-hillshade fps-min-threshold=1')),
          getAlpha(await runOnDataset(gentle(), '-hillshade')));
        assert.deepEqual(getAlpha(await runOnDataset(dem(), '-hillshade fps-min-threshold=1')),
          getAlpha(await runOnDataset(dem(), '-hillshade')));
      })

      it('dynamic smoothing settings can be set, and pasted', async function () {
        var cmd = '-hillshade smoothing=high fps-min-threshold=2 fps-slope-factor=4 fps-slope-radius=5 fps-blend=3,12';
        var first = await runOnDataset(dem(), cmd);
        var d = first.getLayers()[0].layer.raster.derivation;
        var second = await runOnDataset(dem(), '-hillshade ' + internal.formatHillshadeSettings(d));
        assert.deepEqual([d.fps_min_threshold, d.fps_slope_factor, d.fps_slope_radius, d.fps_blend],
          [2, 4, 5, '3,12']);
        assert.deepEqual(getAlpha(second), getAlpha(first));
        assert.equal((await getDerivation('-hillshade smoothing=high fps-min-threshold=1 fps-blend=off')).fps_blend, 'off');
      })

      it('rejects dynamic smoothing settings that don\'t apply', async function () {
        await assert.rejects(runOnDataset(dem(), '-hillshade fps-slope-factor=2'), /need fps-min-threshold/);
        await assert.rejects(runOnDataset(dem(), '-hillshade fps-min-threshold=25'), /not be larger/);
        await assert.rejects(runOnDataset(dem(), '-hillshade fps-min-threshold=1 fps-blend=5,15'), /two-level/);
        await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=high fps-min-threshold=1 fps-blend=15,5'),
          /fps-blend/);
        await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=lowpass fps-min-threshold=1'), /FPS settings/);
        await assert.rejects(runOnDataset(dem(), '-hillshade fps-min-threshold=0'), /fps-min-threshold/);
      })

      it('generalize= is no longer an option', async function () {
        await assert.rejects(runOnDataset(dem(), '-hillshade generalize=2'), /generalize/);
      })
    })

    it('highlights=, shadow-color= and highlight-color= style the shading', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, function(x, y) {
        return 200 * Math.sin(x / 3) + y * 5;
      }), '-hillshade highlights=1 shadow-color=#203050 highlight-color=rgb(255,240,180)');
      var lyr = catalog.getLayers()[0].layer;
      var samples = lyr.raster.grid.samples;
      var shadows = 0, highlights = 0, i, rgb;
      for (i = 0; i < samples.length; i += 4) {
        if (samples[i + 3] === 0) continue;
        rgb = Array.from(samples.subarray(i, i + 3)).join(',');
        if (rgb == '32,48,80') shadows++;
        else if (rgb == '255,240,180') highlights++;
        else assert.fail('unexpected color: ' + rgb);
      }
      assert(shadows > 0 && highlights > 0);
      assert.equal(lyr.raster.derivation.highlights, 1);
      assert.equal(lyr.raster.derivation.shadow_color, '#203050');
      assert.equal(lyr.raster.derivation.highlight_color, 'rgb(255,240,180)');
    })

    it('rejects invalid highlights= and colors', async function () {
      var dem = function() { return makeElevationDataset(5, 5, slope); };
      await assert.rejects(runOnDataset(dem(), '-hillshade highlights=-1'), /highlights/);
      await assert.rejects(runOnDataset(dem(), '-hillshade shadow-color=notacolor'), /shadow-color/);
      await assert.rejects(runOnDataset(dem(), '-hillshade highlight-color=#12'), /highlight-color/);
    })

    it('formatHillshadeSettings() prints the settings used as command options', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope),
        '-hillshade verbose single-light sharpening=0.5 highlight-color=#fff0b4');
      var d = catalog.getLayers()[0].layer.raster.derivation;
      var str = internal.formatHillshadeSettings(d);
      var exaggeration = +d.exaggeration.toFixed(3);
      assert(exaggeration > 1); // automatic, from about 111 m pixels
      assert.equal(str, 'style=shadow azimuth=315 altitude=45 single-light exaggeration=' + exaggeration +
        ' max-opacity=0.55 highlights=0.6 gamma=0.75 highlight-color=#fff0b4 smoothing=low' +
        ' fps-levels=1 fps-passes=1 fps-radius=4 fps-threshold=15 light-adjust=0 ambient=0.5 texture=0 aerial=0' +
        ' sharpening=0.5 sharpen-radius=3 sharpen-threshold=0');
    })

    it('rejects non-raster layers', async function () {
      await assert.rejects(api.applyCommands('-rectangle bbox=0,0,1,1 -hillshade'), /raster layer/);
    })

    it('style=gray and style=grey are names of the opaque style', async function () {
      var dem = function() { return makeElevationDataset(10, 10, slope); };
      var opaque = await runOnDataset(dem(), '-hillshade style=opaque');
      var samples = Array.from(opaque.getLayers()[0].layer.raster.grid.samples);
      for (var name of ['gray', 'grey']) {
        var lyr = (await runOnDataset(dem(), '-hillshade style=' + name)).getLayers()[0].layer;
        assert.equal(lyr.raster.derivation.style, 'opaque');
        assert.deepEqual(Array.from(lyr.raster.grid.samples), samples);
      }
    })

    it('base-color= sets the color of flat ground, and implies style=opaque', async function () {
      var catalog = await runOnDataset(makeElevationDataset(10, 10, function() { return 100; }),
        '-hillshade base-color=#e0d8c0');
      var lyr = catalog.getLayers()[0].layer;
      assert.equal(lyr.raster.derivation.style, 'opaque');
      assert.equal(lyr.raster.derivation.base_color, '#e0d8c0');
      assert.deepEqual(Array.from(lyr.raster.grid.samples.subarray(0, 4)), [224, 216, 192, 255]);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade style=shadow base-color=red'),
        /base-color/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade base-color=bogus'),
        /base-color/);
    })

    it('opaque style records the colors it used, and no opacities', async function () {
      var d = (await runOnDataset(makeElevationDataset(10, 10, slope), '-hillshade style=opaque'))
        .getLayers()[0].layer.raster.derivation;
      var stops = internal.getHillshadeRampColors(null, null, null);
      assert.equal(d.base_color, '#dfdfdf');
      assert.equal(d.highlight_color, '#ffffff');
      assert.equal(d.shadow_color, internal.formatColor(stops.shadow));
      assert.equal(d.max_opacity, null);
      assert.equal(d.highlights, null);
    })

    it('opaque style rejects max-opacity= and highlights=', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade style=opaque max-opacity=0.8'),
        /max-opacity/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade base-color=#e0d8c0 highlights=0.5'),
        /highlights/);
    })

    it('rejects an unknown style', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade style=bogus'),
        /Unsupported style/);
    })
  })
})
