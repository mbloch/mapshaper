import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

// A raster layer in a catalog of its own
// @samples interleaved samples; @bands per pixel
function makeCatalog(samples, width, height, bands, opts) {
  var catalog = new internal.Catalog();
  var o = opts || {};
  var lyr = {
    name: o.name || 'img',
    raster_type: 'grid',
    raster: {
      sourceId: 'test',
      interpretation: o.interpretation || 'image',
      grid: {
        width: width,
        height: height,
        bands: bands,
        pixelType: samples instanceof Float32Array ? 'float32' : 'uint8',
        samples: samples,
        sampleBands: Array.from({length: bands}, function(v, i) { return i; }),
        nodata: o.nodata === undefined ? null : o.nodata,
        bbox: [0, 0, width, height],
        transform: [1, 0, 0, 0, -1, height]
      }
    }
  };
  catalog.addDataset({info: {}, layers: [lyr]});
  return catalog;
}

async function run(catalog, commands) {
  var job = new internal.Job(catalog);
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return catalog;
}

function findLayer(catalog, name) {
  return catalog.getLayers().find(function(o) { return o.layer.name == name; }).layer;
}

function oklabL(r, g, b) {
  return internal.rgbToOklab({r: r, g: g, b: b}).l;
}

var COLORS = [
  [0, 0, 0], [255, 255, 255], [128, 128, 128], [255, 0, 0], [0, 255, 0], [0, 0, 255],
  [60, 90, 40], [200, 180, 120], [20, 40, 90], [250, 240, 10], [3, 2, 1]
];

function colorSamples(colors) {
  var out = new Uint8Array(colors.length * 3);
  colors.forEach(function(c, i) { out.set(c, i * 3); });
  return out;
}

describe('mapshaper-raster-color.mjs', function () {

  describe('toneRgbPixels()', function () {
    it('saturation=1 lightness=1 leaves colors unchanged', function () {
      var src = colorSamples(COLORS);
      var out = internal.toneRgbPixels(src, 3, {saturation: 1, lightness: 1});
      assert.deepEqual(Array.from(out), Array.from(src));
    })

    it('saturation=0 gives grays of the same OKLCH lightness', function () {
      var out = internal.toneRgbPixels(colorSamples(COLORS), 3, {saturation: 0, lightness: 1});
      COLORS.forEach(function(c, i) {
        var r = out[i * 3], g = out[i * 3 + 1], b = out[i * 3 + 2];
        assert(Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1, 'gray: ' + [r, g, b]);
        assert(Math.abs(oklabL(r, g, b) - oklabL(c[0], c[1], c[2])) < 0.005);
      });
    })

    it('saturation= keeps hue and lightness', function () {
      var c = [60, 90, 40];
      var out = internal.toneRgbPixels(colorSamples([c]), 3, {saturation: 0.5, lightness: 1});
      var lab1 = internal.rgbToOklab({r: c[0], g: c[1], b: c[2]});
      var lab2 = internal.rgbToOklab({r: out[0], g: out[1], b: out[2]});
      assert(Math.abs(lab1.l - lab2.l) < 0.005);
      assert(Math.abs(lab2.a / lab1.a - 0.5) < 0.05);
      assert(Math.abs(lab2.b / lab1.b - 0.5) < 0.05);
    })

    it('lightness= multiplies lightness, and stops at white', function () {
      var out = internal.toneRgbPixels(colorSamples([[200, 180, 120], [255, 255, 255]]), 3,
        {saturation: 1, lightness: 0.5});
      var out2 = internal.toneRgbPixels(colorSamples([[255, 255, 255], [128, 128, 128]]), 3,
        {saturation: 1, lightness: 3});
      assert(Math.abs(oklabL(out[0], out[1], out[2]) - oklabL(200, 180, 120) * 0.5) < 0.005);
      assert(Math.abs(oklabL(out[3], out[4], out[5]) - 0.5) < 0.005);
      assert.deepEqual(Array.from(out2), [255, 255, 255, 255, 255, 255]);
    })

    it('colors outside the gamut lose chroma, keeping lightness', function () {
      var out = internal.toneRgbPixels(colorSamples([[255, 0, 0], [0, 0, 255]]), 3,
        {saturation: 3, lightness: 1});
      assert(Math.abs(oklabL(out[0], out[1], out[2]) - oklabL(255, 0, 0)) < 0.01);
      assert(out[0] > out[1] && out[0] > out[2]); // still red
      assert(Math.abs(oklabL(out[3], out[4], out[5]) - oklabL(0, 0, 255)) < 0.01);
      assert(out[5] > out[3] && out[5] > out[4]); // still blue
    })

    it('copies alpha', function () {
      var out = internal.toneRgbPixels(new Uint8Array([60, 90, 40, 77]), 4, {saturation: 0, lightness: 1});
      assert.equal(out[3], 77);
    })
  })

  describe('applyOpacityAndBackground()', function () {
    it('opacity= alone gives RGBA', function () {
      var out = internal.applyOpacityAndBackground(new Uint8Array([10, 20, 30]), 3, 0.4, null);
      assert.equal(out.bands, 4);
      assert.deepEqual(Array.from(out.samples), [10, 20, 30, 102]);
    })

    it('opacity=1 without a background changes nothing', function () {
      var src = new Uint8Array([10, 20, 30]);
      assert.equal(internal.applyOpacityAndBackground(src, 3, 1, null).samples, src);
    })

    it('background= composites, and fills transparent pixels', function () {
      var src = new Uint8Array([0, 100, 200, 255, 50, 50, 50, 0]);
      var out = internal.applyOpacityAndBackground(src, 4, 0.4, {r: 255, g: 255, b: 255});
      assert.equal(out.bands, 3);
      assert.deepEqual(Array.from(out.samples), [153, 193, 233, 255, 255, 255]);
    })
  })

  describe('getColorRampTable()', function () {
    function colorAt(table, val) {
      var i = internal.getRampIndex(table, val);
      return [table.r[i], table.g[i], table.b[i]];
    }

    it('the ends are the end colors; values outside the breaks are clamped', function () {
      var table = internal.getColorRampTable(['#204060', '#e0d0b0'], [0, 100]);
      assert.deepEqual(colorAt(table, 0), [0x20, 0x40, 0x60]);
      assert.deepEqual(colorAt(table, 100), [0xe0, 0xd0, 0xb0]);
      assert.deepEqual(colorAt(table, -50), [0x20, 0x40, 0x60]);
      assert.deepEqual(colorAt(table, 500), [0xe0, 0xd0, 0xb0]);
    })

    it('a color is at its break', function () {
      var table = internal.getColorRampTable(['#000000', '#ff0000', '#ffffff'], [0, 10, 100]);
      assert.deepEqual(colorAt(table, 10), [255, 0, 0]);
    })

    it('a narrow segment is as smooth as a wide one', function () {
      var table = internal.getColorRampTable(['#000000', '#ffffff', '#ff0000'], [0, 1, 4000]);
      var mid = colorAt(table, 0.5);
      assert(Math.abs(oklabL(mid[0], mid[1], mid[2]) - 0.5) < 0.01);
    })

    it('interpolates lightness in OKLCH', function () {
      var table = internal.getColorRampTable(['#000000', '#ffffff'], [0, 1]);
      var mid = colorAt(table, 0.5);
      assert(Math.abs(oklabL(mid[0], mid[1], mid[2]) - 0.5) < 0.01);
    })

    it('a single value gets the first color', function () {
      var table = internal.getColorRampTable(['#000000', '#ffffff'], [5, 5]);
      assert.deepEqual(colorAt(table, 5), [0, 0, 0]);
    })
  })

  describe('getTrimmedRange()', function () {
    it('ignores the extreme 0.1% and invalid pixels', function () {
      var values = new Float64Array(10000);
      var valid = new Uint8Array(10000).fill(1);
      for (var i = 0; i < values.length; i++) values[i] = i % 100;
      values[0] = -1e6;
      values[1] = 1e6;
      values[2] = 5e6;
      valid[2] = 0;
      assert.deepEqual(internal.getTrimmedRange(values, valid), [0, 99]);
    })
  })
})

describe('-tone', function () {
  it('saturation=0 makes a gray image, in place', async function () {
    var catalog = await run(makeCatalog(colorSamples([[60, 90, 40], [200, 100, 50]]), 2, 1, 3), '-tone saturation=0');
    var lyr = findLayer(catalog, 'img');
    var s = lyr.raster.grid.samples;
    assert.equal(catalog.getLayers().length, 1);
    assert.equal(lyr.raster.grid.bands, 3);
    assert(Math.abs(s[0] - s[1]) <= 1 && Math.abs(s[1] - s[2]) <= 1);
    assert.equal(lyr.raster.derivation.type, 'tone');
    assert.equal(lyr.raster.view.recipe.type, 'rgb');
  })

  it('+ and name= keep the original', async function () {
    var src = colorSamples([[60, 90, 40]]);
    var catalog = await run(makeCatalog(src, 1, 1, 3), '-tone + saturation=0 name=gray');
    assert.deepEqual(Array.from(findLayer(catalog, 'img').raster.grid.samples), [60, 90, 40]);
    assert(findLayer(catalog, 'gray'));
  })

  it('opacity= and background=', async function () {
    var catalog = await run(makeCatalog(colorSamples([[0, 100, 200]]), 1, 1, 3), '-tone opacity=0.4 background=white');
    var grid = findLayer(catalog, 'img').raster.grid;
    assert.equal(grid.bands, 3);
    assert.deepEqual(Array.from(grid.samples), [153, 193, 233]);
  })

  it('opacity= without a background makes the image transparent', async function () {
    var catalog = await run(makeCatalog(colorSamples([[0, 100, 200]]), 1, 1, 3), '-tone opacity=0.5');
    var grid = findLayer(catalog, 'img').raster.grid;
    assert.equal(grid.bands, 4);
    assert.equal(grid.samples[3], 128);
  })

  it('errors', async function () {
    await assert.rejects(run(makeCatalog(new Float32Array([1, 2]), 2, 1, 1, {interpretation: 'continuous'}), '-tone saturation=0'), /use -tint or -hillshade/);
    await assert.rejects(run(makeCatalog(colorSamples([[1, 2, 3]]), 1, 1, 3), '-tone opacity=2'), /opacity= should be from 0 to 1/);
    await assert.rejects(run(makeCatalog(colorSamples([[1, 2, 3]]), 1, 1, 3), '-tone saturation=-1'), /saturation= should be 0 or more/);
    await assert.rejects(run(makeCatalog(colorSamples([[1, 2, 3]]), 1, 1, 3), '-tone background=nocolor'), /background=/);
  })
})

describe('-tint', function () {
  // elevations 0 to 100 in a row, with one nodata pixel
  function makeElevation(nodata) {
    var samples = new Float32Array(102);
    for (var i = 0; i <= 100; i++) samples[i] = i;
    samples[101] = nodata === undefined ? 50 : nodata;
    return makeCatalog(samples, 102, 1, 1, {interpretation: 'continuous', nodata: nodata === undefined ? null : nodata, name: 'elevation'});
  }

  function pixel(grid, i) {
    return Array.from(grid.samples.subarray(i * grid.bands, i * grid.bands + grid.bands));
  }

  it('spreads the colors over the elevation range by default', async function () {
    var catalog = await run(makeElevation(), '-tint colors=#000000,#ff0000,#ffffff');
    var grid = findLayer(catalog, 'elevation').raster.grid;
    assert.equal(grid.bands, 3);
    assert.deepEqual(pixel(grid, 0), [0, 0, 0]);
    assert.deepEqual(pixel(grid, 50), [255, 0, 0]);
    assert.deepEqual(pixel(grid, 100), [255, 255, 255]);
  })

  it('breaks= takes elevations, percentages or both', async function () {
    var catalog = await run(makeElevation(), '-tint colors=#000000,#ff0000,#ffffff breaks=0,20%,100');
    var grid = findLayer(catalog, 'elevation').raster.grid;
    assert.deepEqual(pixel(grid, 20), [255, 0, 0]);
    assert.equal(findLayer(catalog, 'elevation').raster.derivation.breaks, '0,20,100');
  })

  it('values beyond the breaks get the end colors', async function () {
    var catalog = await run(makeElevation(), '-tint colors=#000000,#ffffff breaks=10,90');
    var grid = findLayer(catalog, 'elevation').raster.grid;
    assert.deepEqual(pixel(grid, 0), [0, 0, 0]);
    assert.deepEqual(pixel(grid, 100), [255, 255, 255]);
  })

  it('nodata pixels are transparent, or take the background color', async function () {
    var catalog = await run(makeElevation(-9999), '-tint colors=#000000,#ffffff');
    var catalog2 = await run(makeElevation(-9999), '-tint colors=#000000,#ffffff background=#ff0000');
    var grid = findLayer(catalog, 'elevation').raster.grid;
    var grid2 = findLayer(catalog2, 'elevation').raster.grid;
    assert.equal(grid.bands, 4);
    assert.equal(pixel(grid, 101)[3], 0);
    assert.equal(pixel(grid, 100)[3], 255);
    assert.equal(grid2.bands, 3);
    assert.deepEqual(pixel(grid2, 101), [255, 0, 0]);
  })

  it('a color scheme name', async function () {
    var catalog = await run(makeElevation(), '-tint colors=Greens');
    var grid = findLayer(catalog, 'elevation').raster.grid;
    assert(pixel(grid, 0)[0] > pixel(grid, 100)[0]); // Greens goes from light to dark
  })

  it('+ keeps the elevation raster', async function () {
    var catalog = await run(makeElevation(), '-tint + colors=#000000,#ffffff');
    assert.equal(findLayer(catalog, 'elevation').raster.grid.bands, 1);
    assert.equal(findLayer(catalog, 'tint').raster.grid.bands, 3);
  })

  it('errors', async function () {
    await assert.rejects(run(makeElevation(), '-tint'), /requires colors=/);
    await assert.rejects(run(makeElevation(), '-tint colors=#000000'), /two or more colors/);
    await assert.rejects(run(makeElevation(), '-tint colors=#000000,#ffffff breaks=0,50,100'), /one value for each color/);
    await assert.rejects(run(makeElevation(), '-tint colors=#000000,#ffffff breaks=50,10'), /should increase/);
    await assert.rejects(run(makeElevation(), '-tint colors=#000000,#ffffff breaks=0,abc'), /Invalid breaks=/);
    await assert.rejects(run(makeElevation(), '-tint colors=#000000,#ffffff band=1'), /does not have band 1/);
    await assert.rejects(run(makeCatalog(colorSamples([[1, 2, 3]]), 1, 1, 3), '-tint colors=#000000,#ffffff'), /use -tone/);
  })
})
