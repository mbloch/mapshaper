import assert from 'assert';
import {
  getNumericFields, getCategoryFields, getCategories, getDefaultSchemeOfType, getSchemeMethods,
  formatSchemeCommand, getAppliedColors, getAppliedScheme, setLayerScheme, getLayerScheme,
  getSchemeNullColor, setSchemeNullColor, getNoDataCount, formatNoDataCount, formatSchemeCount,
  getSequentialClassRanges, getBreakClassCounts, getPivotSummary, setSchemeContinuous,
  setSchemeLayerType, setTileCount
} from '../src/gui/gui-color-scheme-model';
import { getRasterBandLabel, layerHasPaletteRaster } from '../src/gui/gui-raster-band-values';
import api from '../mapshaper.js';

var internal = api.internal;

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

async function importRaster(content, importOpts) {
  var catalog = new internal.Catalog();
  catalog.addDataset(await internal.importFileAsync('in.tif',
    Object.assign({input: {'in.tif': content}}, importOpts)));
  return catalog;
}

async function runCommand(catalog, cmd) {
  await internal.runParsedCommands(internal.parseCommands(cmd), new internal.Job(catalog));
}

function range(n) {
  var arr = [];
  for (var i = 0; i < n; i++) arr.push(i);
  return arr;
}

describe('gui-color-scheme-model.mjs on raster layers', function() {
  var elevation = range(100).map(function(i) { return i * i / 10; });

  it('bands are the fields, named as in -classify', async function() {
    var catalog = await importRaster(makeGeoTIFF(range(30), {bands: 3}), {bands: '1,3'});
    var lyr = catalog.getActiveLayer().layer;
    assert(layerHasPaletteRaster(lyr));
    assert.deepEqual(getNumericFields(lyr), ['band1', 'band3']);
    assert.equal(getRasterBandLabel(lyr, 'band3'), 'Band 3');
  });

  it('RGB images take no palette', async function() {
    var catalog = await importRaster(makeGeoTIFF(range(12).map(function(i) { return i * 20; }),
      {bands: 3, pixelType: 'uint8'}));
    assert(!layerHasPaletteRaster(catalog.getActiveLayer().layer));
  });

  it('a continuous raster starts with continuous colors, and a transparent no-data color', async function() {
    var catalog = await importRaster(makeGeoTIFF(elevation));
    var lyr = catalog.getActiveLayer().layer;
    var scheme = getDefaultSchemeOfType('sequential', lyr);
    var cmd;
    assert(scheme.raster);
    assert(scheme.continuous);
    assert.equal(scheme.field, 'band1');
    assert.strictEqual(getSchemeNullColor(scheme), null);
    cmd = formatSchemeCommand(scheme, getAppliedColors(scheme));
    assert(!/null-value/.test(cmd));
    assert(/field='?band1'? /.test(cmd));
    assert(getDefaultSchemeOfType('diverging', lyr).continuous);
  });

  it('a no-data color is passed to -classify, and clearing it makes it transparent again', async function() {
    var catalog = await importRaster(makeGeoTIFF(elevation));
    var scheme = setSchemeNullColor(getDefaultSchemeOfType('sequential', catalog.getActiveLayer().layer), '#fff');
    assert(/null-value=#ffffff/.test(formatSchemeCommand(scheme, getAppliedColors(scheme))));
    assert.strictEqual(getSchemeNullColor(setSchemeNullColor(scheme, '')), null);
  });

  it('a raster has no non-adjacent method', function() {
    var scheme = {type: 'categorical', raster: true};
    assert.deepEqual(getSchemeMethods(scheme).map(function(o) { return o.name; }), ['categorical']);
  });

  it('class ranges are the ones -classify finds', async function() {
    var catalog = await importRaster(makeGeoTIFF(elevation));
    var lyr = catalog.getActiveLayer().layer;
    var scheme = setTileCount(setSchemeContinuous(getDefaultSchemeOfType('sequential', lyr), false), 4);
    var ranges = getSequentialClassRanges(scheme, lyr);
    await runCommand(catalog, formatSchemeCommand(scheme, getAppliedColors(scheme)));
    assert.deepEqual(ranges.slice(1).map(function(r) { return r[0]; }),
      lyr.raster.view.recipe.palette.breaks);
    assert.deepEqual(getBreakClassCounts(scheme, lyr, lyr.raster.view.recipe.palette.breaks), [25, 25, 25, 25]);
  });

  it('the scheme stays with the palette it applied', async function() {
    var catalog = await importRaster(makeGeoTIFF(elevation));
    var lyr = catalog.getActiveLayer().layer;
    var scheme = getDefaultSchemeOfType('sequential', lyr);
    var colors = getAppliedColors(scheme);
    await runCommand(catalog, formatSchemeCommand(scheme, colors));
    setLayerScheme(lyr, getAppliedScheme(scheme, colors, lyr));
    assert(getLayerScheme(lyr));
    await runCommand(catalog, '-classify colors=Reds');
    assert.strictEqual(getLayerScheme(lyr), null);
    await runCommand(catalog, '-style clear');
    assert.strictEqual(getLayerScheme(lyr), null);
  });

  it('integer bands have categories, in increasing order', async function() {
    var catalog = await importRaster(makeGeoTIFF([42, 11, 90, 42, 11, 11], {pixelType: 'int16'}),
      {interpretation: 'categorical'});
    var lyr = catalog.getActiveLayer().layer;
    var scheme = getDefaultSchemeOfType('categorical', lyr);
    assert.deepEqual(getCategoryFields(lyr), ['band1']);
    assert.deepEqual(getCategories(lyr, 'band1'), [11, 42, 90]);
    assert.equal(scheme.method, 'categorical');
    assert.equal(scheme.n, 3);
    // categorical rasters start with classes
    assert(!getDefaultSchemeOfType('sequential', lyr).continuous);
    await runCommand(catalog, formatSchemeCommand(scheme, getAppliedColors(scheme, 3)));
    assert.deepEqual(lyr.raster.view.recipe.palette.categories, [11, 42, 90]);
  });

  it('float bands have no categories', async function() {
    var catalog = await importRaster(makeGeoTIFF(elevation));
    assert.deepEqual(getCategoryFields(catalog.getActiveLayer().layer), []);
  });

  it('counts are shares of pixels', async function() {
    var catalog = await importRaster(makeGeoTIFF([-9999, 1, 2, 3, 4, 5, 6, -9999], {nodata: -9999}));
    var lyr = catalog.getActiveLayer().layer;
    var scheme = getDefaultSchemeOfType('sequential', lyr);
    assert.equal(getNoDataCount(lyr, scheme), 2);
    assert.equal(formatNoDataCount(scheme, lyr, 2), '25% of pixels');
    assert.equal(formatSchemeCount(scheme, lyr, 3), '50% of pixels');
    assert.equal(formatSchemeCount(scheme, lyr, 3, true), '50%');
    assert.equal(formatSchemeCount(scheme, lyr, 0, true), '0%');
  });

  it('the pivot summary counts values on either side of the pivot', async function() {
    var catalog = await importRaster(makeGeoTIFF([-3, -2, -1, 0, 1, 2, 3, 4]));
    var lyr = catalog.getActiveLayer().layer;
    var scheme = getDefaultSchemeOfType('diverging', lyr);
    assert.deepEqual(getPivotSummary(scheme, lyr), {pivot: 0, below: 3, above: 5});
  });

  it('vector schemes are unchanged', function() {
    var lyr = {geometry_type: 'polygon', shapes: [null], data: new internal.DataTable([{a: 1}])};
    var scheme = setSchemeLayerType(getDefaultSchemeOfType('sequential', lyr), lyr);
    assert(!scheme.raster);
    assert.equal(formatSchemeCount(scheme, lyr, 1), '1 feature');
    assert.equal(getSchemeNullColor(scheme), '#eeeeee');
  });
});
