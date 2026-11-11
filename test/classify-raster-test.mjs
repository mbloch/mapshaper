import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

// A GeoTIFF of @values (one band), or of @bands bands interleaved
function makeGeoTIFF(values, o) {
  o = o || {};
  var bands = o.bands || 1;
  var width = o.width || values.length / bands;
  var height = values.length / bands / width;
  var Arr = o.pixelType == 'int16' ? Int16Array : o.pixelType == 'uint8' ? Uint8Array : Float32Array;
  var grid = {
    width: width, height: height, bands: bands,
    pixelType: o.pixelType || 'float32',
    samples: Arr.from(values), nodata: o.nodata === undefined ? null : o.nodata,
    bbox: [0, 0, width, height],
    transform: [1, 0, 0, 0, -1, height]
  };
  if (bands > 1 && o.pixelType != 'uint8') grid.displayBands = {color: [0], alpha: -1};
  return Buffer.from(internal.encodeGeoTIFF(grid, {
    geoKeys: {GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326}
  }));
}

function range(n, start) {
  var arr = [];
  for (var i = 0; i < n; i++) arr.push((start || 0) + i);
  return arr;
}

async function run(content, commands, importOpts) {
  var catalog = new internal.Catalog();
  catalog.addDataset(await internal.importFileAsync('in.tif',
    Object.assign({input: {'in.tif': content}}, importOpts)));
  await internal.runParsedCommands(internal.parseCommands(commands), new internal.Job(catalog));
  return catalog;
}

function getRaster(catalog) {
  return catalog.getActiveLayer().layer.raster;
}

function getPalette(catalog) {
  return getRaster(catalog).view.recipe.palette;
}

// [r, g, b, a] of each pixel, as drawn
function renderColors(raster) {
  var grid = raster.grid;
  var preview = internal.renderRasterPreview(grid, raster.view.recipe, grid.width, grid.height);
  var out = [];
  for (var i = 0; i < preview.pixels.length; i += 4) {
    out.push(Array.from(preview.pixels.slice(i, i + 4)));
  }
  return out;
}

// The fills -classify gives a vector layer with the same values
function classifyRecords(values, opts) {
  var lyr = {geometry_type: null, data: new internal.DataTable(values.map(function(v) { return {v: v}; }))};
  api.cmd.classify(lyr, {layers: [lyr]}, Object.assign({field: 'v'}, opts));
  return lyr.data.getRecords().map(function(rec) {
    var o = internal.parseColor(rec.fill);
    return [Math.round(o.r), Math.round(o.g), Math.round(o.b)];
  });
}

function assertColorsMatch(actual, expected, tolerance) {
  actual.forEach(function(c, i) {
    for (var j = 0; j < 3; j++) {
      assert(Math.abs(c[j] - expected[i][j]) <= (tolerance || 0),
        'pixel ' + i + ': ' + c.slice(0, 3) + ' vs ' + expected[i]);
    }
  });
}

describe('-classify on raster layers', function () {
  var values = range(100);
  var content = makeGeoTIFF(values);

  it('sets a palette, leaving the pixels unchanged', async function () {
    var catalog = await run(content, '-classify colors=Blues classes=5');
    var raster = getRaster(catalog);
    var palette = getPalette(catalog);
    assert.deepEqual(Array.from(raster.grid.samples), values);
    assert.equal(palette.band, 1);
    assert.equal(palette.type, 'sequential');
    assert.equal(palette.continuous, false);
    assert.deepEqual(palette.breaks, [20, 40, 60, 80]);
    assert.equal(palette.colors.length, 5);
    assert.strictEqual(palette.nullColor, null);
    assert.equal(raster.interpretation, 'continuous');
  });

  describe('colors match -classify on a vector layer with the same values', function () {
    [
      'colors=Blues classes=5',
      'colors=Blues equal-interval classes=4',
      'colors=Blues breaks=10,50,90',
      'colors=Blues breaks=90,50,10',
      'colors=Blues classes=5 invert',
      'colors=#2b5c3f,#c9b98a,#f4efe6 continuous equal-interval',
      'colors=#2b5c3f,#c9b98a,#f4efe6 continuous breaks=30',
      'colors=#2b5c3f,#f4efe6 continuous equal-interval outer-breaks=10,80',
      'colors=YlGn continuous classes=3 equal-interval interpolation=rgb',
      'colors=PuOr classes=6 pivot=40',
      'colors=PuOr continuous pivot=40 equal-interval',
      'colors=PuOr continuous pivot-range=40,60 equal-interval'
    ].forEach(function(str) {
      it(str, async function () {
        var catalog = await run(content, '-classify ' + str);
        var opts = internal.parseCommands('-classify v ' + str)[0].options;
        assertColorsMatch(renderColors(getRaster(catalog)), classifyRecords(values, opts), 2);
      });
    });
  });

  // Continuous quantile colors are placed by rank; a palette follows that
  // with stops at quantiles of the data, so it is close but not exact
  describe('continuous quantile colors are close to -classify on a vector layer', function () {
    // values bunched at the low end, so placing by rank differs from placing by value
    var skewed = range(100).map(function(i) { return Math.round(i * i / 100); });
    [
      'colors=#2b5c3f,#c9b98a,#f4efe6 continuous',
      'colors=#2b5c3f,#f4efe6 continuous outer-breaks=10,80',
      'colors=PuOr continuous pivot=20',
      'colors=PuOr continuous pivot-range=15,25'
    ].forEach(function(str) {
      it(str, async function () {
        var catalog = await run(makeGeoTIFF(skewed), '-classify ' + str);
        var opts = internal.parseCommands('-classify v ' + str)[0].options;
        assertColorsMatch(renderColors(getRaster(catalog)), classifyRecords(skewed, opts), 4);
      });
    });

    it('with too many values for a stop at each one', async function () {
      var many = range(2000).map(function(i) { return Math.pow(i / 2000, 2) * 100; });
      var str = 'colors=#2b5c3f,#c9b98a,#f4efe6 continuous';
      var catalog = await run(makeGeoTIFF(many, {width: 100}), '-classify ' + str);
      var opts = internal.parseCommands('-classify v ' + str)[0].options;
      assert(getPalette(catalog).breaks.length <= 33);
      assertColorsMatch(renderColors(getRaster(catalog)), classifyRecords(many, opts), 3);
    });
  });

  it('percentage breaks are of the range without the extreme 0.1% of pixels', async function () {
    var vals = range(10000).map(function(i) { return i % 100; });
    vals[0] = -1e6;
    vals[1] = 1e6;
    var catalog = await run(makeGeoTIFF(vals, {width: 100}), '-classify colors=Blues breaks=0%,50%,100%');
    assert.deepEqual(getPalette(catalog).breaks, [0, 49.5, 99]);
  });

  it('percentage breaks with outer-breaks= are of that range', async function () {
    var catalog = await run(content, '-classify colors=Blues breaks=50% outer-breaks=0,1000');
    assert.deepEqual(getPalette(catalog).breaks, [500]);
  });

  it('getTrimmedRange() ignores the extreme 0.1% of values', function () {
    var vals = range(10000).map(function(i) { return i % 100; });
    vals[0] = -1e6;
    vals[1] = 1e6;
    assert.deepEqual(internal.getTrimmedRange(vals), [0, 99]);
  });

  describe('bands', function () {
    // band 1 is 0-99, band 2 is 99-0
    var twoBands = makeGeoTIFF(values.reduce(function(memo, v) {
      return memo.concat([v, 99 - v]);
    }, []), {bands: 2, pixelType: 'int16'});

    it('a band field or band= chooses the band', async function () {
      var a = await run(twoBands, '-classify band2 colors=Blues classes=2');
      var b = await run(twoBands, '-classify band=2 colors=Blues classes=2');
      assert.equal(getPalette(a).band, 2);
      assert.equal(getPalette(b).band, 2);
      // band 2 is high at the first pixel, where band 1 is low
      var band1 = renderColors(getRaster(await run(twoBands, '-classify band1 colors=Blues classes=2')));
      var band2 = renderColors(getRaster(a));
      assert.notDeepEqual(band2[0], band2[99]);
      assert.deepEqual(band2[0], band1[99]);
      assert.deepEqual(band2[99], band1[0]);
    });

    it('bands are numbered as in the source file', async function () {
      var catalog = await run(twoBands, '-classify band2 colors=Blues classes=2', {bands: '2'});
      assert.equal(getPalette(catalog).band, 2);
      await assert.rejects(run(twoBands, '-classify band1 colors=Blues', {bands: '2'}),
        /does not have band 1/);
    });

    it('errors', async function () {
      await assert.rejects(run(twoBands, '-classify colors=Blues'), /has 2 bands; name the one to classify/);
      await assert.rejects(run(twoBands, '-classify band1 band=2 colors=Blues'), /does not match/);
      await assert.rejects(run(twoBands, '-classify elevation colors=Blues'), /classified by band/);
      await assert.rejects(run(twoBands, '-classify band3 colors=Blues'), /does not have band 3/);
      await assert.rejects(run(twoBands, '-classify band0 colors=Blues'), /numbered from 1/);
    });
  });

  describe('categories', function () {
    var codes = makeGeoTIFF([11, 42, 11, 90, 42, 11], {pixelType: 'int16'});

    it('are the band\'s values in increasing order', async function () {
      var catalog = await run(codes, '-classify categorical colors=red,green,blue');
      var palette = getPalette(catalog);
      assert.equal(palette.type, 'categorical');
      assert.deepEqual(palette.categories, [11, 42, 90]);
      assert.deepEqual(palette.colors, ['red', 'green', 'blue']);
      assert.equal(getRaster(catalog).interpretation, 'categorical');
      assert.deepEqual(renderColors(getRaster(catalog)).map(function(c) { return c.join(','); }),
        ['255,0,0,255', '0,128,0,255', '255,0,0,255', '0,0,255,255', '0,128,0,255', '255,0,0,255']);
    });

    it('other= colors values that aren\'t listed', async function () {
      var catalog = await run(codes, '-classify categories=11,42 colors=red,green other=#000000');
      var colors = renderColors(getRaster(catalog));
      assert.deepEqual(colors[3], [0, 0, 0, 255]);
    });

    it('include values a sample would miss', async function () {
      var vals = new Array(1200000).fill(1);
      vals[1] = 7; // pixels at odd positions are not in the sample
      var catalog = await run(makeGeoTIFF(vals, {width: 1200, pixelType: 'int16'}),
        '-classify categorical colors=red,blue');
      assert.deepEqual(getPalette(catalog).categories, [1, 7]);
    });

    it('need an integer band', async function () {
      await assert.rejects(run(content, '-classify categorical colors=red,blue'), /need a band of integer values/);
    });
  });

  describe('nodata', function () {
    var withNodata = makeGeoTIFF([0, 50, -9999, 100], {nodata: -9999});

    it('is left out of the classes, and is transparent by default', async function () {
      var catalog = await run(withNodata, '-classify colors=red,blue breaks=50');
      assert.deepEqual(renderColors(getRaster(catalog))[2], [0, 0, 0, 0]);
    });

    it('null-value= gives it a color', async function () {
      var catalog = await run(withNodata, '-classify colors=red,blue breaks=50 null-value=#eeeeee');
      assert.equal(getPalette(catalog).nullColor, '#eeeeee');
      assert.deepEqual(renderColors(getRaster(catalog))[2], [238, 238, 238, 255]);
    });

    it('a band with no valid values is an error', async function () {
      await assert.rejects(run(makeGeoTIFF([-9999, -9999], {nodata: -9999}), '-classify colors=Blues'),
        /no valid values/);
    });
  });

  it('rejects options that write attributes or make a key', async function () {
    await assert.rejects(run(content, '-classify colors=Blues save-as=color'), /save-as= does not work with raster/);
    await assert.rejects(run(content, '-classify values=1,2,3'), /values= does not work with raster/);
    await assert.rejects(run(content, '-classify colors=Blues key'), /key= does not work with raster/);
    await assert.rejects(run(content, '-classify classes=3'), /requires colors=/);
  });

  it('rejects RGB images', async function () {
    var rgb = makeGeoTIFF(range(12), {bands: 3, pixelType: 'uint8'});
    await assert.rejects(run(rgb, '-classify band1 colors=Blues'), /not RGB images/);
  });

  it('-info describes the palette', async function () {
    var out = await api.applyCommands('-i in.tif -classify colors=Blues classes=5 -info save-to=info',
      {'in.tif': content});
    assert.deepEqual(JSON.parse(out['info.json'])[0].raster_palette,
      {band: 1, type: 'sequential', continuous: false, classes: 5, hypsometric: null, opacity: null});
  });

  describe('commands keep or drop the palette', function () {
    ['-clip bbox=10,0,60,1', '-proj merc', '-proj merc -blur radius=1px'].forEach(function(cmd) {
      it(cmd + ' keeps it', async function () {
        var catalog = await run(content, '-classify colors=Blues classes=5 ' + cmd);
        assert.deepEqual(getPalette(catalog).breaks, [20, 40, 60, 80]);
      });
    });

    it('-hillshade makes a layer without it', async function () {
      var catalog = await run(makeGeoTIFF(range(400), {width: 20}), '-classify colors=Blues -proj merc -hillshade');
      assert.strictEqual(getRaster(catalog).view.recipe.palette, undefined);
    });
  });

  it('the -tint command is gone', async function () {
    await assert.rejects(run(content, '-tint colors=Blues'), /tint/);
  });
});

describe('-style on raster layers', function () {
  var content = makeGeoTIFF(range(10));

  it('opacity= sets the display opacity', async function () {
    var catalog = await run(content, '-style opacity=0.6');
    var raster = getRaster(catalog);
    assert.equal(raster.view.recipe.opacity, 0.6);
    assert.equal(internal.getRasterViewOpacity(raster), 0.6);
    // the pixels are drawn as before
    assert.equal(renderColors(raster)[0][3], 255);
  });

  it('opacity=1 removes the setting', async function () {
    var catalog = await run(content, '-style opacity=0.6 -style opacity=1');
    assert.strictEqual(getRaster(catalog).view.recipe.opacity, undefined);
  });

  it('clear removes the palette and opacity', async function () {
    var catalog = await run(content, '-classify colors=Blues -style opacity=0.5 -style clear');
    var recipe = getRaster(catalog).view.recipe;
    assert.strictEqual(recipe.palette, undefined);
    assert.strictEqual(recipe.opacity, undefined);
  });

  it('clear opacity= removes only the palette', async function () {
    var catalog = await run(content, '-classify colors=Blues -style clear opacity=0.4');
    var recipe = getRaster(catalog).view.recipe;
    assert.strictEqual(recipe.palette, undefined);
    assert.equal(recipe.opacity, 0.4);
  });

  it('errors', async function () {
    await assert.rejects(run(content, '-style fill=red'), /only opacity= and clear/);
    await assert.rejects(run(content, '-style opacity=2'), /from 0 to 1/);
  });
});
