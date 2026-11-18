import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var BLACK = {r: 0, g: 0, b: 0};
var WHITE = {r: 255, g: 255, b: 255};

function oklch(r, g, b) {
  var lab = internal.rgbToOklab({r: r, g: g, b: b});
  return {l: lab.l, c: Math.sqrt(lab.a * lab.a + lab.b * lab.b), h: Math.atan2(lab.b, lab.a)};
}

function blendOne(rgb, amount, opts) {
  var samples = new Uint8Array(rgb);
  return Array.from(internal.blendShadingPixels(samples, rgb.length, new Float32Array([amount]),
    Object.assign({shadow: BLACK, highlight: WHITE, shadowChroma: 0, highlightChroma: 1}, opts)));
}

// A lat-long dataset with an elevation layer and an RGB image on the same grid
function makeDataset(width, height, elevFn, rgb) {
  var cell = 0.001;
  var bbox = [0, 0, width * cell, height * cell];
  var transform = [cell, 0, 0, 0, -cell, bbox[3]];
  var elev = new Float32Array(width * height);
  var img = new Uint8Array(width * height * 3);
  var x, y, i;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      elev[i] = elevFn(x, y);
      img.set(rgb, i * 3);
    }
  }
  return {
    info: {crs_string: 'wgs84'},
    layers: [{
      name: 'dem',
      raster_type: 'grid',
      raster: {
        sourceId: 'dem',
        interpretation: 'continuous',
        grid: {width: width, height: height, bands: 1, pixelType: 'float32', samples: elev,
          sampleBands: [0], nodata: null, bbox: bbox, transform: transform},
        derivation: {type: 'gray', sourceId: 'dem', bands: [0]},
        view: {recipe: {type: 'gray', bands: [0]}}
      }
    }, {
      name: 'img',
      raster_type: 'grid',
      raster: {
        sourceId: 'img',
        interpretation: 'image',
        grid: {width: width, height: height, bands: 3, pixelType: 'uint8', samples: img,
          sampleBands: [0, 1, 2], nodata: null, bbox: bbox.concat(), transform: transform.concat()}
      }
    }]
  };
}

function ridge(x, y) {
  return 300 * Math.sin(x / 3) + 200 * Math.cos(y / 4);
}

async function run(dataset, commands) {
  var catalog = new internal.Catalog().addDataset(dataset);
  var job = new internal.Job(catalog);
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return catalog;
}

function findLayer(catalog, name) {
  return catalog.getLayers().find(function(o) { return o.layer.name == name; }).layer;
}

describe('mapshaper-blend.mjs', function () {

  describe('blendShadingPixels()', function () {
    it('leaves unshaded pixels unchanged', function () {
      assert.deepEqual(blendOne([40, 160, 60], 0), [40, 160, 60]);
    });

    it('writes to @out if given (as the GUI preview does, to a canvas)', function () {
      var samples = new Uint8Array([40, 160, 60, 255, 40, 160, 60, 128]);
      var amounts = new Float32Array([-0.5, 0.4]);
      var opts = {shadow: BLACK, highlight: WHITE, shadowChroma: 0, highlightChroma: 1};
      var out = new Uint8ClampedArray(8).fill(7);
      assert.equal(internal.blendShadingPixels(samples, 4, amounts, opts, out), out);
      assert.deepEqual(Array.from(out),
        Array.from(internal.blendShadingPixels(samples, 4, amounts, opts)));
    });

    it('chroma 0 stacks the shadow and highlight colors', function () {
      var stack = {shadowChroma: 0, highlightChroma: 0};
      assert.deepEqual(blendOne([40, 160, 60], -0.5, stack), [20, 80, 30]);
      assert.deepEqual(blendOne([40, 160, 60], 0.5, stack), [148, 208, 158]);
    });

    it('takes lightness from the stacked result', function () {
      var stacked = blendOne([40, 160, 60], 0.4, {highlightChroma: 0});
      var out = blendOne([40, 160, 60], 0.4);
      assert(Math.abs(oklch.apply(null, out).l - oklch.apply(null, stacked).l) < 0.005);
    });

    it('chroma 1 keeps the color in highlights, unlike stacking', function () {
      var src = oklch(40, 160, 60);
      var stacked = oklch.apply(null, blendOne([40, 160, 60], 0.3, {highlightChroma: 0}));
      var out = oklch.apply(null, blendOne([40, 160, 60], 0.3));
      assert(Math.abs(out.c - src.c) < 0.01);
      assert(stacked.c < src.c - 0.03);
      assert(Math.abs(out.h - src.h) < 0.03);
    });

    it('shadow chroma moves from the stacked color to the image color', function () {
      var stacked = oklch.apply(null, blendOne([120, 140, 100], -0.4));
      var half = oklch.apply(null, blendOne([120, 140, 100], -0.4, {shadowChroma: 0.5}));
      var full = oklch.apply(null, blendOne([120, 140, 100], -0.4, {shadowChroma: 1}));
      var src = oklch(120, 140, 100);
      assert(Math.abs(full.c - src.c) < 0.005);
      assert(Math.abs(full.h - src.h) < 0.05);
      assert(Math.abs(half.c - (stacked.c + full.c) / 2) < 0.005);
    });

    it('fits colors that leave the gamut', function () {
      var src = oklch(40, 160, 60);
      var stacked = oklch.apply(null, blendOne([40, 160, 60], -0.5));
      var full = oklch.apply(null, blendOne([40, 160, 60], -0.5, {shadowChroma: 1}));
      assert(full.c > stacked.c + 0.005 && full.c < src.c);
    });

    it('stacks the shading alone on transparent pixels', function () {
      assert.deepEqual(blendOne([40, 160, 60, 0], -0.5), [0, 0, 0, 128]);
      assert.deepEqual(blendOne([40, 160, 60, 0], -0.5, {shadowChroma: 1}), [0, 0, 0, 128]);
    });

    it('chroma 0 on a partly transparent pixel matches stacking', function () {
      // 0.5 black over 50% [40, 160, 60]: alpha 0.75, color (0.25 / 0.75) of the image
      assert.deepEqual(blendOne([40, 160, 60, 128], -0.5), [13, 53, 20, 192]);
    });
  });

  describe('decoding', function () {
    it('shadow style: alpha is the amount, the color gives the sign', function () {
      var px = new Uint8Array([0, 0, 0, 102, 255, 255, 255, 51, 0, 0, 0, 0]);
      var a = internal.decodeShadowStyleShading(px, BLACK, WHITE);
      assert.deepEqual(Array.from(a).map(function(v) { return Math.round(v * 100) / 100; }), [-0.4, 0.2, 0]);
    });

    it('opaque: the overlay opacity that takes the base to the pixel', function () {
      var base = {r: 223, g: 223, b: 223};
      var px = new Uint8Array([223, 223, 223, 255, 0, 0, 0, 255, 255, 255, 255, 255, 112, 112, 112, 255, 9, 9, 9, 0]);
      var a = Array.from(internal.decodeOpaqueShading(px, base));
      assert.equal(a[0], 0);
      assert(Math.abs(a[1] + 1) < 1e-6);
      assert(Math.abs(a[2] - 1) < 1e-6);
      assert(Math.abs(a[3] + (1 - 112 / 223)) < 0.01);
      assert.equal(a[4], 0);
    });
  });

  describe('guessBaseColor()', function () {
    it('finds the most common gray, skipping black', function () {
      var px = [];
      var add = function(v, a, n) { for (var i = 0; i < n; i++) px.push(v, v, v, a); };
      add(0, 255, 50);
      add(180, 255, 20);
      add(181, 255, 5);
      add(120, 255, 10);
      add(60, 0, 100);
      assert.deepEqual(internal.guessBaseColor(new Uint8Array(px)), {r: 180, g: 180, b: 180});
    });

    it('returns null with no visible pixels', function () {
      assert.strictEqual(internal.guessBaseColor(new Uint8Array([9, 9, 9, 0])), null);
    });
  });

  describe('rasterLooksLikeHillshade()', function () {
    function makeImage(bands, pixel, opts) {
      var n = 100;
      var samples = new Uint8Array(n * bands);
      for (var i = 0; i < n; i++) samples.set(pixel, i * bands);
      return Object.assign({
        interpretation: 'image',
        grid: {width: 10, height: 10, bands: bands, samples: samples, bbox: [0, 0, 1, 1]}
      }, opts);
    }

    it('takes layers made by -hillshade, but not elevation or color imagery', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs +');
      assert.equal(internal.rasterLooksLikeHillshade(findLayer(catalog, 'hs').raster), true);
      assert.equal(internal.rasterLooksLikeHillshade(findLayer(catalog, 'dem').raster), false);
      assert.equal(internal.rasterLooksLikeHillshade(findLayer(catalog, 'img').raster), false);
    });

    it('takes gray 8-bit images from elsewhere', function () {
      assert.equal(internal.rasterLooksLikeHillshade(makeImage(1, [120])), true);
      assert.equal(internal.rasterLooksLikeHillshade(makeImage(3, [120, 122, 119])), true);
      assert.equal(internal.rasterLooksLikeHillshade(makeImage(4, [0, 0, 0, 90])), true);
      assert.equal(internal.rasterLooksLikeHillshade(makeImage(3, [120, 140, 110])), false);
    });

    it('leaves out palette rasters and -blend output', function () {
      var palette = makeImage(1, [3]);
      palette.grid.colorModel = 'palette';
      assert.equal(internal.rasterLooksLikeHillshade(palette), false);
      assert.equal(internal.rasterLooksLikeHillshade(
        makeImage(3, [120, 120, 120], {derivation: {type: 'blend'}})), false);
    });
  });

  describe('scaleShadingAmounts()', function () {
    it('scales shadows and highlights separately, up to full opacity', function () {
      var amounts = new Float32Array([-0.6, 0.3, 0.6]);
      var out = internal.scaleShadingAmounts(amounts, 2, 0.5, new Float32Array(3));
      assert.deepEqual(Array.from(out), [-1, 0.15, 0.3].map(Math.fround));
      assert.deepEqual(Array.from(amounts), [-0.6, 0.3, 0.6].map(Math.fround));
      internal.scaleShadingAmounts(amounts, 1, 1, out);
      assert.deepEqual(Array.from(out), Array.from(amounts));
      internal.scaleShadingAmounts(amounts, 0, 2);
      assert.deepEqual(Array.from(amounts), [0, 0.6, 1].map(Math.fround));
    });
  });

  describe('resampleShadingAmounts()', function () {
    var shading = {amounts: new Float32Array([0, 1, 0, 1]), width: 2, height: 2, bbox: [0, 0, 2, 2]};

    it('returns the same amounts for the same grid', function () {
      assert.equal(internal.resampleShadingAmounts(shading, {width: 2, height: 2, bbox: [0, 0, 2, 2]}), shading.amounts);
    });

    it('interpolates bilinearly, with zero outside the shading', function () {
      var out = internal.resampleShadingAmounts(shading, {width: 6, height: 1, bbox: [-1, 0.5, 2, 1.5]});
      assert.deepEqual(Array.from(out), [0, 0, 0, 0.25, 0.75, 1]);
    });
  });

  describe('getShadingOverlayPixels()', function () {
    var opts = {shadow: BLACK, highlight: WHITE, shadowChroma: 0, highlightChroma: 1};

    function overlay(samples, amounts, opts2) {
      var o = Object.assign({}, opts, opts2);
      var blended = internal.blendShadingPixels(samples, 4, amounts, o);
      return {blended: blended, overlay: internal.getShadingOverlayPixels(samples, blended, amounts, o)};
    }

    it('stacked on opaque pixels, gives the blended colors', function () {
      var n = 2000, samples = new Uint8Array(n * 4), amounts = new Float32Array(n);
      var seed = 1, rand = function() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      var i, c, a, o, v;
      for (i = 0; i < n; i++) {
        for (c = 0; c < 3; c++) samples[i * 4 + c] = Math.floor(rand() * 256);
        samples[i * 4 + 3] = 255;
        amounts[i] = rand() * 2 - 1;
      }
      [{}, {shadowChroma: 0.5}, {highlightChroma: 2}].forEach(function(opts2) {
        o = overlay(samples, amounts, opts2);
        for (i = 0; i < n; i++) {
          a = o.overlay[i * 4 + 3] / 255;
          for (c = 0; c < 3; c++) {
            v = samples[i * 4 + c] * (1 - a) + o.overlay[i * 4 + c] * a;
            assert(Math.abs(v - o.blended[i * 4 + c]) <= 1);
          }
        }
      });
    });

    it('keeps the shadow color and opacity of stacked shadows', function () {
      var o = overlay(new Uint8Array([40, 160, 60, 255]), new Float32Array([-0.4]));
      assert.deepEqual(Array.from(o.overlay), [0, 0, 0, 102]);
    });

    it('colors highlights that keep the image\'s chroma', function () {
      var o = overlay(new Uint8Array([40, 160, 60, 255]), new Float32Array([0.3])).overlay;
      assert(o[1] > o[0] + 30 && o[1] > o[2] + 30);
      assert(o[3] > 0.3 * 255);
    });

    it('is transparent where there is no shading, and plain shading where the image is not opaque', function () {
      var o = overlay(new Uint8Array([40, 160, 60, 255, 40, 160, 60, 0, 40, 160, 60, 128]),
        new Float32Array([0, -0.5, 0.25])).overlay;
      assert.deepEqual(Array.from(o), [0, 0, 0, 0, 0, 0, 0, 128, 255, 255, 255, 64]);
    });
  });

  describe('-blend', function () {
    it('chroma=0 matches stacking the hillshade on the image', async function () {
      var catalog = await run(makeDataset(30, 30, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img chroma=0 + name=out');
      var hs = findLayer(catalog, 'hs').raster.grid.samples;
      var out = findLayer(catalog, 'out').raster.grid.samples;
      var i, a, k, expected, shaded = 0;
      for (i = 0; i < 900; i++) {
        a = hs[i * 4 + 3] / 255;
        if (a > 0) shaded++;
        for (k = 0; k < 3; k++) {
          expected = Math.round([40, 160, 60][k] + (hs[i * 4 + k] - [40, 160, 60][k]) * a);
          assert(Math.abs(out[i * 3 + k] - expected) <= 1);
        }
      }
      assert(shaded > 500);
    });

    it('shadow-color= and highlight-color= replace the hillshade\'s colors in the stacking', async function () {
      var shadow = [40, 30, 120], highlight = [255, 230, 180];
      var catalog = await run(makeDataset(30, 30, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img chroma=0 + name=out ' +
        'shadow-color=#281e78 highlight-color=#ffe6b4');
      var hs = findLayer(catalog, 'hs').raster.grid.samples;
      var out = findLayer(catalog, 'out').raster.grid.samples;
      var i, a, k, color, expected, shadows = 0, highlights = 0;
      for (i = 0; i < 900; i++) {
        a = hs[i * 4 + 3] / 255;
        if (a === 0) continue;
        // the hillshade's own colors still tell its shadows from its highlights
        color = hs[i * 4] < 128 ? shadow : highlight;
        if (color == shadow) shadows++; else highlights++;
        for (k = 0; k < 3; k++) {
          expected = Math.round([40, 160, 60][k] + (color[k] - [40, 160, 60][k]) * a);
          assert(Math.abs(out[i * 3 + k] - expected) <= 1);
        }
      }
      assert(shadows > 100 && highlights > 100);
      assert.equal(findLayer(catalog, 'out').raster.derivation.shadow_color, '#281e78');
      assert.equal(findLayer(catalog, 'out').raster.derivation.highlight_color, '#ffe6b4');
    });

    it('refuses an unsupported color', async function () {
      await assert.rejects(run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img shadow-color=nope'), /shadow-color=/);
    });

    it('records its settings and replaces the target and the hillshade', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img chroma=0.5');
      var lyr = findLayer(catalog, 'img');
      assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }), ['img']);
      assert.deepEqual(lyr.raster.derivation, {sourceId: 'img', type: 'blend', source: 'hs',
        strength: [1, 1], chroma: [0.5, 0.5], base_color: null});
    });

    it('defaults to stacked shadows and highlights without haze (chroma=0,1)', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img');
      var params = findLayer(catalog, 'img').raster.derivation;
      assert.deepEqual([params.strength, params.chroma], [[1, 1], [0, 1]]);
    });

    it('+ keeps the target and the hillshade', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img + name=out');
      assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }).sort(), ['hs', 'img', 'out']);
    });

    it('keep-source keeps the hillshade and replaces the target', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img keep-source');
      assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }).sort(), ['hs', 'img']);
      assert.equal(findLayer(catalog, 'img').raster.derivation.type, 'blend');
    });

    it('blends one hillshade into several targets before removing it', async function () {
      var dataset = makeDataset(20, 20, ridge, [40, 160, 60]);
      var img2 = Object.assign({}, dataset.layers[1], {name: 'img2'});
      dataset.layers.push(img2);
      var catalog = await run(dataset, '-hillshade target=dem name=hs -blend hs target=img,img2');
      assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }), ['img', 'img2']);
      assert.equal(findLayer(catalog, 'img2').raster.derivation.type, 'blend');
    });

    it('takes shadow,highlight pairs', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img strength=1,0.5 chroma=0.2,0.8');
      var params = findLayer(catalog, 'img').raster.derivation;
      assert.deepEqual([params.strength, params.chroma], [[1, 0.5], [0.2, 0.8]]);
    });

    it('opaque hillshades leave flat ground unchanged', async function () {
      var catalog = await run(makeDataset(30, 30, function(x, y) { return x < 15 ? 0 : (x - 15) * 40; }, [40, 160, 60]),
        '-hillshade opaque target=dem name=hs smoothing=off ambient=0 -blend source=hs target=img');
      var out = findLayer(catalog, 'img').raster.grid.samples;
      var i = 15 * 30 + 3;
      assert.deepEqual(Array.from(out.subarray(i * 3, i * 3 + 3)), [40, 160, 60]);
    });

    it('strength=0 leaves the image unchanged', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img strength=0');
      var out = findLayer(catalog, 'img').raster.grid.samples;
      for (var i = 0; i < out.length; i += 3) {
        assert.deepEqual(Array.from(out.subarray(i, i + 3)), [40, 160, 60]);
      }
    });

    it('takes the hillshade layer name as its default argument', async function () {
      var a = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img');
      var b = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend source=hs target=img');
      assert.deepEqual(findLayer(a, 'img').raster.grid.samples, findLayer(b, 'img').raster.grid.samples);
    });

    it('refuses an elevation raster', async function () {
      await assert.rejects(run(makeDataset(10, 10, ridge, [40, 160, 60]), '-blend source=dem target=img'),
        /looks like an elevation raster/);
    });

    // a 10 x 10 one-band 8-bit hillshade: flat 180, with a shadow (90) and a
    // highlight (230) pixel
    function addGrayHillshade(dataset) {
      var samples = new Uint8Array(100).fill(180);
      samples[11] = 90;
      samples[12] = 230;
      addRaster(dataset, 'gdal', samples, 1);
      return dataset;
    }

    function addRaster(dataset, name, samples, bands) {
      var img = dataset.layers[1].raster.grid;
      dataset.layers.push({
        name: name,
        raster_type: 'grid',
        raster: {
          sourceId: name,
          interpretation: 'continuous',
          grid: {width: img.width, height: img.height, bands: bands, pixelType: 'uint8', samples: samples,
            sampleBands: Array.from({length: bands}, function(v, i) { return i; }), nodata: null,
            bbox: img.bbox.concat(), transform: img.transform.concat()}
        }
      });
    }

    it('guesses the flat-ground color of a hillshade from elsewhere', async function () {
      var catalog = await run(addGrayHillshade(makeDataset(10, 10, ridge, [40, 160, 60])),
        '-blend gdal target=img chroma=0');
      var out = findLayer(catalog, 'img').raster.grid.samples;
      assert.deepEqual(Array.from(out.subarray(0, 3)), [40, 160, 60]);
      assert.deepEqual(Array.from(out.subarray(33, 36)), [20, 80, 30]);
      assert(out[37] > 160);
    });

    it('uses base-color= for a hillshade from elsewhere', async function () {
      var catalog = await run(addGrayHillshade(makeDataset(10, 10, ridge, [40, 160, 60])),
        '-blend gdal target=img chroma=0 base-color=#5a5a5a');
      var out = findLayer(catalog, 'img').raster.grid.samples;
      // with 90 as flat ground, the shadow pixel is unshaded and flat 180 is a highlight
      assert.deepEqual(Array.from(out.subarray(33, 36)), [40, 160, 60]);
      assert(out[0] > 40);
      assert.equal(findLayer(catalog, 'img').raster.derivation.base_color, '#5a5a5a');
    });

    it('reads a partly transparent image from elsewhere as a transparent hillshade', async function () {
      var dataset = makeDataset(10, 10, ridge, [40, 160, 60]);
      var samples = new Uint8Array(400);
      samples.set([0, 0, 0, 128], 44);
      samples.set([255, 255, 255, 64], 48);
      addRaster(dataset, 'shade', samples, 4);
      var out = findLayer(await run(dataset, '-blend shade target=img chroma=0'), 'img').raster.grid.samples;
      assert.deepEqual(Array.from(out.subarray(0, 3)), [40, 160, 60]);
      assert.deepEqual(Array.from(out.subarray(33, 36)), [20, 80, 30]);
      assert(out[36] > 40);
    });

    it('refuses base-color= with a transparent hillshade', async function () {
      await assert.rejects(run(makeDataset(10, 10, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img base-color=#ccc'),
        /base-color= is for opaque hillshades/);
    });

    describe('vector targets', function () {
      // a frame with two CSS pixels per hillshade pixel, so the layers are drawn on
      // the hillshade's grid, and a polygon of the image's color covering it
      var SETUP = '-frame width=10 name=map target=img ' +
        '-rectangle bbox=-1,-1,1,1 name=land -style fill=#28a03c ' +
        '-hillshade target=dem name=hs';

      function getNames(catalog) {
        return catalog.getLayers().map(function(o) { return o.layer.name; }).sort();
      }

      function getStackedNames(catalog) {
        return internal.getStackedLayers(catalog).map(function(o) { return o.layer.name; });
      }

      it('blends a polygon like an image of the same color', async function () {
        var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
          SETUP + ' -blend hs target=img + name=ref -blend hs target=land');
        var ref = findLayer(catalog, 'ref').raster.grid.samples;
        var grid = findLayer(catalog, 'land').raster.grid;
        assert.deepEqual([grid.width, grid.height, grid.bands], [20, 20, 4]);
        for (var i = 0; i < 400; i++) {
          for (var k = 0; k < 3; k++) {
            assert(Math.abs(grid.samples[i * 4 + k] - ref[i * 3 + k]) <= 1);
          }
          assert.equal(grid.samples[i * 4 + 3], 255);
        }
      });

      it('draws several targets together and replaces them and the hillshade', async function () {
        var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
          SETUP + ' -rectangle bbox=0,0,0.01,0.02 name=west -style fill=#c04020 -blend hs target=land,west');
        var out = findLayer(catalog, 'blend').raster.grid.samples;
        var west = (10 * 20 + 2) * 4, east = (10 * 20 + 17) * 4;
        assert.deepEqual(getNames(catalog), ['blend', 'img', 'map']);
        assert(out[west] > out[west + 1]);
        assert(out[east + 1] > out[east]);
      });

      it('+ keeps the targets and the hillshade, with the output above the targets', async function () {
        var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
          SETUP + ' -blend hs target=land +');
        var stack = getStackedNames(catalog);
        assert.deepEqual(getNames(catalog), ['blend', 'hs', 'img', 'land', 'map']);
        assert.equal(stack.indexOf('blend'), stack.indexOf('land') + 1);
      });

      it('keep-source keeps the hillshade and replaces the targets', async function () {
        var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
          SETUP + ' -blend hs target=land keep-source');
        assert.deepEqual(getNames(catalog), ['hs', 'img', 'land', 'map']);
        assert(internal.layerHasRaster(findLayer(catalog, 'land')));
      });

      it('overlay recolors the hillshade to give the blend when stacked on the targets', async function () {
        var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
          SETUP + ' -blend hs target=img + name=ref -blend hs target=land overlay');
        var ref = findLayer(catalog, 'ref').raster.grid.samples;
        var hs = findLayer(catalog, 'hs');
        var px = hs.raster.grid.samples;
        var stack = getStackedNames(catalog);
        var i, k, a;
        assert.deepEqual(getNames(catalog), ['hs', 'img', 'land', 'map', 'ref']);
        assert.equal(stack.indexOf('hs'), stack.indexOf('land') + 1);
        assert.equal(hs.raster.derivation.overlay, true);
        for (i = 0; i < 400; i++) {
          a = px[i * 4 + 3] / 255;
          for (k = 0; k < 3; k++) {
            assert(Math.abs([40, 160, 60][k] * (1 - a) + px[i * 4 + k] * a - ref[i * 3 + k]) <= 2);
          }
        }
      });

      it('refuses an overlay as the hillshade', async function () {
        await assert.rejects(run(makeDataset(20, 20, ridge, [40, 160, 60]),
          SETUP + ' -blend hs target=land overlay -blend hs target=img'), /overlay made by -blend/);
      });
    });

    it('rejects more than two values', async function () {
      await assert.rejects(run(makeDataset(10, 10, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img chroma=0,1,1'),
        /one value, or two/);
    });
  });
});
