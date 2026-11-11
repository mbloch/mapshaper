import assert from 'assert';
import {
  getNumericFields, getCategoryFields, getCategories, getDefaultSchemeOfType, getSchemeMethods,
  formatSchemeCommand, getAppliedColors, getAppliedScheme, setLayerScheme, getLayerScheme,
  getSchemeNullColor, setSchemeNullColor, getNoDataCount, formatNoDataCount, formatSchemeCount,
  getSequentialClassRanges, getBreakClassCounts, getPivotSummary, setSchemeContinuous,
  setSchemeLayerType, setTileCount, setSchemeMethod, choosePreset, getSchemeColors,
  setTileColor, clearTileColor, getContinuousTileStops, reverseScheme, getPinnedTiles,
  getSchemeBreaks, setSchemeBreak, getBreakClassSwatches, getDefaultElevationPreset, getBreaksScale,
  chooseBlendedElevations, isBlendedScheme, getSchemeTab, getElevationFields, layerHasElevations,
  getSeaScheme, setSeaScheme, chooseSeaPreset, getSeaLabel, isLandTransparent, setLandTransparent
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

describe('gui-color-scheme-model.mjs fixed elevations', function() {
  var arid = internal.getHypsometricStops('Arid').map(function(o) { return o.color; });
  var stops = [0, 50, 200, 600, 1000, 2000, 3000, 4000, 5000, 6000];

  async function importDEM(values) {
    var catalog = await importRaster(makeGeoTIFF(values || [1200, 1500, 2100, 2600, 3100, 3500]));
    return {catalog: catalog, lyr: catalog.getActiveLayer().layer};
  }

  // in Arizona, where the Arid preset applies
  function useElevations(lyr) {
    return setSchemeMethod(getDefaultSchemeOfType('sequential', lyr), 'elevation', null, -1, [[-112, 33.5]]);
  }

  it('have their own tab, for bands that could hold elevations', async function() {
    var dem = (await importDEM()).lyr;
    var tooHigh = (await importDEM([0, 5000, 10000, 20000])).lyr;
    var scheme = getDefaultSchemeOfType('elevation', dem, [[-112, 33.5]]);
    assert.equal(getSchemeTab(scheme), 'elevation');
    assert(isBlendedScheme(scheme));
    assert.equal(scheme.elevationPreset, 'Arid');
    // without knowing where the raster is
    assert.equal(getDefaultSchemeOfType('elevation', dem, []).preset, 'Temperate');
    assert.equal(getSchemeTab(getDefaultSchemeOfType('sequential', dem)), 'sequential');
    assert(!getSchemeMethods(scheme).some(function(o) { return o.name == 'elevation'; }));
    assert.deepEqual(getElevationFields(dem), ['band1']);
    assert.deepEqual(getElevationFields(tooHigh), []);
  });

  it('are the default when a raster says it holds elevations', async function() {
    var o = await importDEM();
    assert(!layerHasElevations(o.lyr));
    o.lyr.name = 'sedona-elev';
    assert(layerHasElevations(o.lyr));
    o.lyr.name = 'grand_canyon_DEM';
    assert(layerHasElevations(o.lyr));
    o.lyr.name = 'demographics';
    assert(!layerHasElevations(o.lyr));
    o.lyr.raster.grid.verticalUnits = 'm';
    assert(layerHasElevations(o.lyr));
  });

  it('leave out the sea, or color it with a bathymetric preset', async function() {
    var o = await importDEM([-20, -10, 5, 200, -30, 300]);
    var scheme = useElevations(o.lyr);
    var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    assert(/ sea=transparent$/.test(cmd));
    await runCommand(o.catalog, cmd);
    assert.equal(o.lyr.raster.view.recipe.palette.sea, 'transparent');
    assert.equal(getSeaLabel(scheme), 'Transparent');
    scheme = chooseBlendedElevations(chooseSeaPreset(scheme, 'Blue'), [[-112, 33.5]]);
    assert.equal(getSeaLabel(scheme), 'Blue');
    assert(/ hypsometric=blended sea=blue( |$)/.test(formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr})));
    scheme = choosePreset(scheme, 'Arid');
    cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    assert(/ sea=blue$/.test(cmd));
    await runCommand(o.catalog, cmd);
    assert.equal(o.lyr.raster.view.recipe.palette.sea, 'Blue');
  });

  it('the sea has stops of its own, which can be recolored and moved', async function() {
    var o = await importDEM([-5000, -10, 5, 200, -30, 300]);
    var scheme = chooseSeaPreset(useElevations(o.lyr), 'Gray');
    var sea = getSeaScheme(scheme);
    var gray = internal.getBathymetricStops('Gray');
    var cmd, palette;
    assert.deepEqual(getSchemeColors(sea), gray.map(function(o) { return o.color; }));
    sea = setSchemeBreak(setTileColor(sea, 0, '#000000'), o.lyr, 1, -7000);
    scheme = setSeaScheme(scheme, sea);
    assert.equal(getSeaLabel(scheme), 'Custom');
    cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    assert(/ sea-breaks=-11000,-7000,-6000,.*,0 sea-colors=#000000,/.test(cmd));
    await runCommand(o.catalog, cmd);
    palette = o.lyr.raster.view.recipe.palette;
    assert.equal(palette.sea, 'custom');
    assert.equal(palette.seaRamp.breaks[1], -7000);
    assert.equal(palette.seaRamp.colors[0], '#000000');
  });

  it('the sea\'s breaks run from its deepest stop to 0, whatever the data', async function() {
    var land = await importDEM([5, 200, 300, 1000]);
    var info = getSchemeBreaks(getSeaScheme(chooseSeaPreset(useElevations(land.lyr), 'Blue')), land.lyr);
    assert.deepEqual([info.min, info.max], [-11000, 0]);
  });

  it('transparent land leaves only the sea, which then needs colors', async function() {
    var o = await importDEM([-20, -10, 5, 200, -30, 300]);
    var scheme = setLandTransparent(useElevations(o.lyr), true);
    var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    assert(isLandTransparent(scheme));
    assert.equal(getSeaLabel(scheme), 'Pale');
    assert.equal(cmd, "-classify field='band1' hypsometric=none sea=pale");
    await runCommand(o.catalog, cmd);
    assert.equal(o.lyr.raster.view.recipe.palette.land, 'transparent');
    // no sea either: the land comes back
    assert(!isLandTransparent(chooseSeaPreset(scheme, null)));
    assert(!isLandTransparent(choosePreset(scheme, 'Lush')));
  });

  it('color the stops of a preset, at its elevations, whatever the data range', async function() {
    var o = await importDEM();
    var scheme = useElevations(o.lyr);
    var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    var palette;
    assert.equal(scheme.preset, 'Arid');
    assert.deepEqual(getSchemeColors(scheme), arid);
    assert.deepEqual(getContinuousTileStops(scheme, o.lyr).map(function(stop) { return stop.value; }), stops);
    assert.equal(cmd, "-classify field='band1' breaks=50,200,600,1000,2000,3000,4000,5000 outer-breaks=0,6000 continuous colors=" + arid.join(',') + ' sea=transparent');
    await runCommand(o.catalog, cmd);
    palette = o.lyr.raster.view.recipe.palette;
    assert.deepEqual(palette.breaks, stops);
    assert.deepEqual(palette.colors, arid);
    assert(palette.continuous);
  });

  it('are converted to the band\'s units', async function() {
    var lyr = (await importDEM([4000, 6000, 9000])).lyr;
    var scheme = useElevations(lyr);
    lyr.raster.grid.verticalUnits = 'ft';
    assert.deepEqual(getContinuousTileStops(scheme, lyr).map(function(stop) { return stop.value; }),
      [0, 164.042, 656.168, 1968.5, 3280.84, 6561.68, 9842.52, 13123.4, 16404.2, 19685]);
  });

  it('have a tile for each stop, which can be recolored and reset', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = useElevations(lyr);
    var edited = setTileColor(scheme, 2, '#ff0000');
    assert.equal(edited.preset, null);
    assert.deepEqual(getSchemeColors(edited), arid.slice(0, 2).concat(['#ff0000'], arid.slice(3)));
    assert.deepEqual(getPinnedTiles(edited), arid.map(function(c, i) { return i == 2; }));
    assert.equal(clearTileColor(edited, 2).preset, 'Arid');
    assert.equal(setTileCount(scheme, 3, -1, lyr), scheme);
    assert.equal(reverseScheme(scheme), scheme);
    assert.equal(setSchemeContinuous(scheme, false), scheme);
    assert.equal(choosePreset(edited, 'Polar').n, 8);
  });

  it('can be moved, the end stops too, and outside the data', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = useElevations(lyr);
    var info = getSchemeBreaks(scheme, lyr);
    var moved;
    assert.deepEqual(info.breaks, stops);
    // the data are 1200 to 3500
    assert.deepEqual([info.min, info.max], [1000, 4000]);
    assert.equal(getBreakClassSwatches(scheme).length, 11);
    moved = setSchemeBreak(setSchemeBreak(scheme, lyr, 9, 8000), lyr, 0, -100);
    // a stop stays between its neighbors
    moved = setSchemeBreak(moved, lyr, 5, 9000);
    assert.equal(moved.method, 'elevation');
    assert.deepEqual(getSchemeBreaks(moved, lyr).breaks, [-100, 50, 200, 600, 1000, 3000, 3000, 4000, 5000, 8000]);
    assert(/ breaks=50,200,600,1000,3000,3000,4000,5000 outer-breaks=-100,8000 /.test(formatSchemeCommand(moved, getAppliedColors(moved), {layer: lyr})));
    // a preset brings its own elevations
    assert.deepEqual(getSchemeBreaks(choosePreset(moved, 'Lush'), lyr).breaks, stops);
  });

  it('start with the preset for the climate where the layer is, or Temperate', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = getDefaultSchemeOfType('sequential', lyr);
    var sahara = [10, 24], amazon = [-60, -5], siberia = [90, 62], greenland = [-40, 72], pacific = [-150, 0];
    assert.equal(setSchemeMethod(scheme, 'elevation', null, -1, []).preset, 'Temperate');
    assert.equal(setSchemeMethod(scheme, 'elevation', null, -1, [amazon]).preset, 'Lush');
    assert.deepEqual([[sahara], [amazon], [siberia], [greenland], [pacific], [], null].map(getDefaultElevationPreset),
      ['Arid', 'Lush', 'Temperate', 'Polar', 'Temperate', 'Temperate', 'Temperate']);
    // the climate with the most weight across the points
    assert.equal(getDefaultElevationPreset([sahara, sahara, amazon, pacific]), 'Arid');
  });

  it('show the data and the stops next to it in the class breaks dialog', async function() {
    var lyr = (await importDEM([-50, 300, 9000 * 0.99])).lyr;
    var info = getSchemeBreaks(useElevations(lyr), lyr);
    // past the top stop, the data's max
    assert.deepEqual([info.min, info.max], [-50, 8910]);
  });

  it('can be blended by climate, which -classify does, until they are edited', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = chooseBlendedElevations(useElevations(lyr), [[-60, -5]]);
    assert(isBlendedScheme(scheme));
    assert.equal(scheme.preset, 'Blended');
    // the tiles and stops are the Amazon's preset
    assert.equal(scheme.elevationPreset, 'Lush');
    assert.equal(formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: lyr}), "-classify field='band1' hypsometric=blended");
    [setTileColor(scheme, 2, '#ff0000'), setSchemeBreak(scheme, lyr, 3, 700), choosePreset(scheme, 'Arid'),
      setSchemeMethod(scheme, 'quantile')].forEach(function(next) {
      assert(!isBlendedScheme(next));
      assert(!/hypsometric=/.test(formatSchemeCommand(next, getAppliedColors(next), {layer: lyr})));
    });
  });

  it('leave their colors as a custom ramp for another method', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = setSchemeMethod(useElevations(lyr), 'quantile');
    assert.equal(scheme.preset, null);
    assert.equal(scheme.n, 10);
    assert.deepEqual(getSchemeColors(scheme), arid);
    assert(!/breaks=/.test(formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: lyr})));
  });
});
