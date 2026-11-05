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

    it('records its settings and replaces the target and the hillshade', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img chroma=0.5');
      var lyr = findLayer(catalog, 'img');
      assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }), ['img']);
      assert.deepEqual(lyr.raster.derivation, {sourceId: 'img', type: 'blend', source: 'hs',
        strength: [1, 1], chroma: [0.5, 0.5]});
    });

    it('+ keeps the target and the hillshade', async function () {
      var catalog = await run(makeDataset(20, 20, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img + name=out');
      assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }).sort(), ['hs', 'img', 'out']);
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
        '-hillshade opaque target=dem name=hs smoothing=off sharpening=0 ambient=0 -blend source=hs target=img');
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

    it('needs a hillshade', async function () {
      await assert.rejects(run(makeDataset(10, 10, ridge, [40, 160, 60]), '-blend source=dem target=img'),
        /source= should name a hillshade/);
    });

    it('rejects more than two values', async function () {
      await assert.rejects(run(makeDataset(10, 10, ridge, [40, 160, 60]),
        '-hillshade target=dem name=hs -blend hs target=img chroma=0,1,1'),
        /one value, or two/);
    });
  });
});
