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
  getElevationStopChips, getElevationClassLanes, setElevationChipColor, getBlendRampColors,
  getSeaScheme, setSeaScheme, chooseSeaPreset, getSeaLabel, isLandTransparent, setLandTransparent,
  getSchemeValues, getSchemeLightness, setSchemeLightness, maxLightness, getRasterPaletteScheme,
  schemeMatchesLayer
} from '../src/gui/gui-color-scheme-model';
import { getRasterBandLabel, layerHasPaletteRaster } from '../src/gui/gui-raster-band-values';
import api from '../mapshaper.js';

var internal = api.internal;

function hex(rgba, i) {
  return '#' + [0, 1, 2].map(function(j) { return ('0' + rgba[i * 4 + j].toString(16)).slice(-2); }).join('');
}

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
  var desert = internal.getHypsometricStops('Desert').map(function(o) { return o.color; });
  var stops = internal.getHypsometricStops('Desert').map(function(o) { return o.elevation; });
  var n = stops.length;
  // Tropical and Temperate share their colors from 1000 m up, and the land
  // presets from 3000 m up
  var i1000 = stops.indexOf(1000), i3000 = stops.indexOf(3000);

  function formatStops(stops) {
    return 'breaks=' + stops.join(',');
  }

  async function importDEM(values) {
    var catalog = await importRaster(makeGeoTIFF(values || [1200, 1500, 2100, 2600, 3100, 3500]));
    return {catalog: catalog, lyr: catalog.getActiveLayer().layer};
  }

  // in Arizona, where the Desert preset applies
  function useElevations(lyr) {
    return setSchemeMethod(getDefaultSchemeOfType('sequential', lyr), 'elevation', null, -1, [[-112, 33.5]]);
  }

  it('have their own tab, for bands that could hold elevations', async function() {
    var dem = (await importDEM()).lyr;
    var tooHigh = (await importDEM([0, 5000, 10000, 20000])).lyr;
    var scheme = getDefaultSchemeOfType('elevation', dem, [[-112, 33.5]]);
    assert.equal(getSchemeTab(scheme), 'elevation');
    assert(isBlendedScheme(scheme));
    assert.equal(scheme.elevationPreset, 'Desert');
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
    // transparent is hypsometric='s default
    assert(!/ sea=/.test(cmd));
    await runCommand(o.catalog, cmd);
    assert.equal(o.lyr.raster.view.recipe.palette.sea, 'transparent');
    assert.equal(getSeaLabel(scheme), 'Transparent');
    scheme = chooseBlendedElevations(chooseSeaPreset(scheme, 'Blue'), [[-112, 33.5]]);
    assert.equal(getSeaLabel(scheme), 'Blue');
    assert(/ hypsometric=blended sea=blue( |$)/.test(formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr})));
    scheme = choosePreset(scheme, 'Desert');
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
    // moved, but not recolored
    cmd = formatSchemeCommand(setSeaScheme(scheme, setSchemeBreak(sea, o.lyr, 1, -7000)), getAppliedColors(scheme), {layer: o.lyr});
    assert(/ sea=gray breaks=sea:-10000,-7000,-3000,[^ ]*,0$/.test(cmd));
    sea = setSchemeBreak(setTileColor(sea, 0, '#000000'), o.lyr, 1, -7000);
    scheme = setSeaScheme(scheme, sea);
    assert.equal(getSeaLabel(scheme), 'Custom');
    cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    assert(/ sea=gray colors=sea:#000000,[^ ]* breaks=sea:-10000,-7000,-3000,[^ ]*,0$/.test(cmd));
    await runCommand(o.catalog, cmd);
    palette = o.lyr.raster.view.recipe.palette;
    assert.equal(palette.sea, 'custom');
    assert.equal(palette.seaRamp.breaks[1], -7000);
    assert.equal(palette.seaRamp.colors[0], '#000000');
  });

  it('the sea\'s breaks run from its deepest stop to 0, whatever the data', async function() {
    var land = await importDEM([5, 200, 300, 1000]);
    var info = getSchemeBreaks(getSeaScheme(chooseSeaPreset(useElevations(land.lyr), 'Blue')), land.lyr);
    assert.deepEqual([info.min, info.max], [-10000, 0]);
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
    assert(!isLandTransparent(choosePreset(scheme, 'Tropical')));
  });

  it('color the stops of a preset, at its elevations, whatever the data range', async function() {
    var o = await importDEM();
    var scheme = useElevations(o.lyr);
    var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    var palette;
    assert.equal(scheme.preset, 'Desert');
    assert.deepEqual(getSchemeColors(scheme), desert);
    assert.deepEqual(getContinuousTileStops(scheme, o.lyr).map(function(stop) { return stop.value; }), stops);
    assert.equal(cmd, "-classify field='band1' hypsometric=desert");
    // recolored and moved, the preset's colors and stops are given
    cmd = formatSchemeCommand(setSchemeBreak(setTileColor(scheme, 0, '#ff0000'), o.lyr, 0, 0), [], {layer: o.lyr});
    assert.equal(cmd, "-classify field='band1' hypsometric=desert colors=#ff0000," + desert.slice(1).join(',') +
      ' breaks=0,' + stops.slice(1).join(','));
    await runCommand(o.catalog, cmd);
    palette = o.lyr.raster.view.recipe.palette;
    assert.deepEqual(palette.breaks, [0].concat(stops.slice(1)));
    assert.deepEqual(palette.colors, ['#ff0000'].concat(desert.slice(1)));
    assert(palette.continuous);
  });

  it('are converted to the band\'s units', async function() {
    var lyr = (await importDEM([4000, 6000, 9000])).lyr;
    var scheme = useElevations(lyr);
    lyr.raster.grid.verticalUnits = 'ft';
    assert.deepEqual(getContinuousTileStops(scheme, lyr).map(function(stop) { return stop.value; }),
      stops.map(function(e) { return +(e / 0.3048).toPrecision(6); }));
  });

  it('have a tile for each stop, which can be recolored and reset', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = useElevations(lyr);
    var edited = setTileColor(scheme, 2, '#ff0000');
    assert.equal(edited.preset, null);
    assert.deepEqual(getSchemeColors(edited), desert.slice(0, 2).concat(['#ff0000'], desert.slice(3)));
    assert.deepEqual(getPinnedTiles(edited), desert.map(function(c, i) { return i == 2; }));
    assert.equal(clearTileColor(edited, 2).preset, 'Desert');
    assert.equal(setTileCount(scheme, 3, -1, lyr), scheme);
    assert.equal(reverseScheme(scheme), scheme);
    assert.equal(choosePreset(edited, 'Polar').n, n);
  });

  it('one preset can be classed, with a class from each stop up to the next', async function() {
    var o = await importDEM([-20, 100, 300, 700, 1500, 4500]);
    var atlas = internal.getHypsometricStops('Atlas');
    var colors = atlas.map(function(stop) { return stop.color; });
    var scheme = setSchemeContinuous(choosePreset(useElevations(o.lyr), 'Atlas'), false);
    var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    var palette, preview;
    assert.equal(scheme.continuous, false);
    assert.equal(cmd, "-classify field='band1' hypsometric=atlas classed");
    assert.deepEqual(getSequentialClassRanges(scheme, o.lyr).map(function(r) { return r[0]; }),
      [-Infinity, 200, 500, 1000, 2000, 4000]);
    assert.deepEqual(getElevationClassLanes(scheme)[2][0].colors, [colors[1], colors[1]]);
    assert.equal(getBreakClassSwatches(scheme)[2], colors[1]);
    // another preset stays classed; a blend is continuous
    assert.equal(choosePreset(scheme, 'Desert').continuous, false);
    assert.equal(chooseBlendedElevations(scheme, [[-112, 33.5]]).continuous, true);
    assert.equal(setSchemeContinuous(chooseBlendedElevations(scheme, [[-112, 33.5]]), false).continuous, true);
    await runCommand(o.catalog, cmd);
    palette = o.lyr.raster.view.recipe.palette;
    assert(!palette.continuous);
    preview = internal.renderRasterPreview(o.lyr.raster.grid, {palette: palette}, 6, 1);
    assert.deepEqual([1, 2, 3, 4, 5].map(function(i) { return hex(preview.pixels, i); }),
      [colors[0], colors[1], colors[2], colors[3], colors[5]]);
  });

  it('can be moved, the end stops too, and outside the data', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = useElevations(lyr);
    var info = getSchemeBreaks(scheme, lyr);
    var moved, expected;
    assert.deepEqual(info.breaks, stops);
    // the data are 1200 to 3500: the range runs from the stop at or below
    // the min to the one at or above the max
    assert.deepEqual([info.min, info.max], [
      stops.filter(function(e) { return e <= 1200; }).pop(),
      stops.filter(function(e) { return e >= 3500; })[0]]);
    assert.equal(getBreakClassSwatches(scheme).length, n + 1);
    moved = setSchemeBreak(setSchemeBreak(scheme, lyr, n - 1, 8000), lyr, 0, -100);
    // a stop stays between its neighbors
    moved = setSchemeBreak(moved, lyr, 1, 9000);
    expected = stops.concat();
    expected[0] = -100;
    expected[1] = stops[2];
    expected[n - 1] = 8000;
    assert.equal(moved.method, 'elevation');
    assert.deepEqual(getSchemeBreaks(moved, lyr).breaks, expected);
    assert(formatSchemeCommand(moved, getAppliedColors(moved), {layer: lyr}).endsWith(' ' + formatStops(expected)));
    // a preset brings its own elevations
    assert.deepEqual(getSchemeBreaks(choosePreset(moved, 'Tropical'), lyr).breaks, stops);
  });

  it('start with the preset for the climate where the layer is, or Temperate', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = getDefaultSchemeOfType('sequential', lyr);
    var sahara = [10, 24], amazon = [-60, -5], siberia = [90, 62], greenland = [-40, 72], pacific = [-150, 0];
    assert.equal(setSchemeMethod(scheme, 'elevation', null, -1, []).preset, 'Temperate');
    assert.equal(setSchemeMethod(scheme, 'elevation', null, -1, [amazon]).preset, 'Tropical');
    assert.deepEqual([[sahara], [amazon], [siberia], [greenland], [pacific], [], null].map(getDefaultElevationPreset),
      ['Desert', 'Tropical', 'Boreal', 'Polar', 'Temperate', 'Temperate', 'Temperate']);
    // the climate with the most weight across the points
    assert.equal(getDefaultElevationPreset([sahara, sahara, amazon, pacific]), 'Desert');
  });

  it('show the land\'s data and the stops next to it in the class breaks dialog', async function() {
    var lyr = (await importDEM([-50, 300, 9000 * 0.99])).lyr;
    var scheme = chooseSeaPreset(useElevations(lyr), 'Blue');
    var info = getSchemeBreaks(scheme, lyr);
    // from the stop below the land's min to the data's max, past the top stop
    assert.deepEqual([info.min, info.max], [200, 8910]);
    // the histograms: land above 0, sea at or below it
    assert.deepEqual(getSchemeValues(scheme, lyr), [300, 8910]);
    assert.deepEqual(getSchemeValues(getSeaScheme(scheme), lyr), [-50]);
    // below the lowest stop, from sea level
    lyr = (await importDEM([-50, 0.00002, 30])).lyr;
    info = getSchemeBreaks(useElevations(lyr), lyr);
    assert.deepEqual([info.min, info.max], [0, stops[0]]);
  });

  it('without data of its own, a ramp\'s dialog spans its stops', async function() {
    var lyr = (await importDEM([-500, -20])).lyr;
    var info = getSchemeBreaks(useElevations(lyr), lyr);
    assert.deepEqual([info.min, info.max], [stops[0], stops[n - 1]]);
  });

  it('can be made lighter or darker, which the command gives as colors', async function() {
    var o = await importDEM([-20, 300, 1500, 4500]);
    var scheme = setSchemeLightness(chooseSeaPreset(useElevations(o.lyr), 'Blue'), -0.05);
    var sea = setSchemeLightness(getSeaScheme(scheme), 0.05);
    var colors = getSchemeColors(scheme);
    var cmd;
    scheme = setSeaScheme(scheme, sea);
    assert.equal(getSchemeLightness(getSeaScheme(scheme)), 0.05);
    assert.equal(getSchemeLightness(setSchemeLightness(scheme, 9)), maxLightness);
    // the preset's own colors, darker; the tiles aren't pinned
    assert.deepEqual(colors, internal.adjustRampLightness(desert, -0.05));
    assert.deepEqual(getPinnedTiles(scheme), desert.map(function() { return false; }));
    cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
    assert.equal(cmd, "-classify field='band1' hypsometric=desert sea=blue colors=" + colors.join(',') +
      ',sea:' + getSchemeColors(getSeaScheme(scheme)).join(','));
    await runCommand(o.catalog, cmd);
    assert.deepEqual(o.lyr.raster.view.recipe.palette.colors, colors);
    // another preset has its own lightness
    assert.equal(getSchemeLightness(choosePreset(scheme, 'Polar')), 0);
  });

  it('a lighter blend lightens every preset, and recoloring a stop keeps the colors', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = setSchemeLightness(chooseBlendedElevations(useElevations(lyr), [[-60, -5]]), 0.02);
    var ramps = getBlendRampColors(scheme);
    var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: lyr});
    var edited, reset;
    assert(ramps.every(function(ramp) {
      return ramp.colors.join() != internal.getHypsometricStops(ramp.name).map(function(o) { return o.color; }).join();
    }));
    ramps.forEach(function(ramp) {
      assert(cmd.includes(ramp.name.toLowerCase() + ':' + ramp.colors.join(',')));
    });
    assert(getElevationStopChips(scheme, 0).every(function(chip) { return !chip.edited; }));
    // a picked color goes in as picked, and the others stay as they were shown
    edited = setElevationChipColor(scheme, ['Tropical'], i3000, '#ff0000');
    assert.equal(getSchemeLightness(edited), 0);
    assert.equal(getBlendRampColors(edited).find(byName('Tropical')).colors[i3000], '#ff0000');
    assert.deepEqual(getBlendRampColors(edited).find(byName('Polar')).colors, ramps.find(byName('Polar')).colors);
    // a reset gives the preset's color, which the lightness then adjusts
    reset = setElevationChipColor(scheme, ['Tropical'], 0, null);
    assert.deepEqual(getBlendRampColors(reset), ramps);
    // one preset, likewise
    edited = setTileColor(setSchemeLightness(useElevations(lyr), -0.05), 1, '#00ff00');
    assert.deepEqual(getSchemeColors(edited), internal.adjustRampLightness(desert, -0.05).map(function(c, i) {
      return i == 1 ? '#00ff00' : c;
    }));
  });

  it('can be blended by climate, which -classify does, until another palette is chosen', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = chooseBlendedElevations(useElevations(lyr), [[-60, -5]]);
    assert(isBlendedScheme(scheme));
    assert.equal(scheme.preset, 'Blended');
    // the tiles and stops are the Amazon's preset
    assert.equal(scheme.elevationPreset, 'Tropical');
    assert.equal(formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: lyr}), "-classify field='band1' hypsometric=blended");
    [setTileColor(scheme, 2, '#ff0000'), setSchemeBreak(scheme, lyr, 3, 700)].forEach(function(next) {
      assert(isBlendedScheme(next));
    });
    [choosePreset(scheme, 'Desert'), setSchemeMethod(scheme, 'quantile')].forEach(function(next) {
      assert(!isBlendedScheme(next));
      assert(!/hypsometric=blended/.test(formatSchemeCommand(next, getAppliedColors(next), {layer: lyr})));
    });
  });

  it('a blend has a chip for each run of presets with the same color at a stop', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = chooseBlendedElevations(useElevations(lyr), [[-60, -5]]);
    var names = function(chips) { return chips.map(function(chip) { return chip.names.join('+'); }); };
    assert.deepEqual(names(getElevationStopChips(scheme, 0)), ['Desert', 'Steppe', 'Tropical', 'Temperate', 'Boreal', 'Polar']);
    assert.deepEqual(names(getElevationStopChips(scheme, i1000)), ['Desert', 'Steppe', 'Tropical+Temperate+Boreal', 'Polar']);
    assert.deepEqual(names(getElevationStopChips(scheme, i3000)), ['Desert+Steppe+Tropical+Temperate+Boreal', 'Polar']);
    // a class's lanes need the same colors at both of its ends: the class
    // up to 1000 m has six, the one from 1000 m four
    var lanes = getElevationClassLanes(scheme);
    assert.equal(lanes.length, n + 1);
    assert.deepEqual(names(lanes[i1000]), ['Desert', 'Steppe', 'Tropical', 'Temperate', 'Boreal', 'Polar']);
    assert.deepEqual(names(lanes[i1000 + 1]), ['Desert', 'Steppe', 'Tropical+Temperate+Boreal', 'Polar']);
    assert.deepEqual(names(lanes[n]), ['Desert+Steppe+Tropical+Temperate+Boreal', 'Polar']);
    // a single preset has one chip and one lane
    assert.deepEqual(names(getElevationStopChips(useElevations(lyr), 3)), ['']);
    assert.equal(getElevationClassLanes(useElevations(lyr))[3].length, 1);
  });

  it('a blend\'s presets can be recolored at a stop, together or one at a time', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = chooseBlendedElevations(useElevations(lyr), [[-60, -5]]);
    var tropical = internal.getHypsometricStops('Tropical').map(function(o) { return o.color; });
    var edited = setElevationChipColor(scheme, ['Tropical'], i3000, '#ff0000');
    var moved = stops.concat();
    var cmd;
    moved[n - 1] = 7000;
    assert(isBlendedScheme(edited));
    assert.equal(edited.preset, null);
    // Tropical left the shared chip
    assert.deepEqual(getElevationStopChips(edited, i3000).map(function(chip) { return chip.names.join('+'); }),
      ['Desert+Steppe', 'Tropical', 'Temperate+Boreal', 'Polar']);
    assert(getElevationStopChips(edited, i3000)[1].edited);
    edited = setElevationChipColor(setSchemeBreak(edited, lyr, n - 1, 7000), ['Desert', 'Temperate'], 0, '#00ff00');
    cmd = formatSchemeCommand(edited, getAppliedColors(edited), {layer: lyr});
    assert(cmd.includes(' hypsometric=blended colors=desert:#00ff00,'));
    assert(cmd.includes(',tropical:' + tropical.slice(0, i3000).concat(['#ff0000']).join(',')));
    assert(cmd.includes(',temperate:#00ff00,'));
    assert(cmd.endsWith(' ' + formatStops(moved)));
    assert(!/(steppe|boreal|polar):/.test(cmd));
    assert.equal(getBlendRampColors(edited).find(byName('Tropical')).colors[i3000], '#ff0000');
    // resetting every recolored chip makes it Blended again
    edited = setElevationChipColor(setElevationChipColor(edited, ['Tropical'], i3000, null), ['Desert', 'Temperate'], 0, null);
    assert.equal(edited.preset, 'Blended');
    assert.equal(edited.blendColors, null);
    // and -classify draws what the panel shows
    var o = await importDEM();
    cmd = formatSchemeCommand(setElevationChipColor(scheme, ['Tropical'], i3000, '#ff0000'), [], {layer: o.lyr});
    await runCommand(o.catalog, cmd);
    assert.equal(o.lyr.raster.view.recipe.palette.blend.ramps.find(byName('Tropical')).colors[i3000], '#ff0000');
  });

  function byName(name) {
    return function(ramp) { return ramp.name == name; };
  }

  it('a palette that the panel didn\'t make opens as it was, recolored ones as Custom', async function() {
    var schemes = [
      function(s) { return setTileColor(choosePreset(s, 'Atlas'), 1, '#ff0000'); },
      function(s, lyr) { return setSchemeBreak(setSchemeContinuous(choosePreset(s, 'Atlas'), false), lyr, 2, 700); },
      function(s, lyr) { return setSeaScheme(s, setSchemeBreak(setTileColor(getSeaScheme(chooseSeaPreset(s, 'Blue')), 0, '#000000'), lyr, 1, -6000)); },
      function(s) { return setLandTransparent(chooseSeaPreset(s, 'Pale'), true); },
      function(s) { return setElevationChipColor(chooseBlendedElevations(s, [[-60, -5]]), ['Tropical'], i3000, '#ff0000'); }
    ];
    for (var i = 0; i < schemes.length; i++) {
      var o = await importDEM([-20, 100, 300, 700, 1500, 4500]);
      var scheme = schemes[i](useElevations(o.lyr), o.lyr);
      var cmd = formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: o.lyr});
      var opened;
      await runCommand(o.catalog, cmd);
      opened = getRasterPaletteScheme(o.lyr);
      assert(opened, cmd);
      assert.equal(formatSchemeCommand(opened, getAppliedColors(opened), {layer: o.lyr}), cmd);
      assert(schemeMatchesLayer(opened, o.lyr));
      if (i === 0) {
        assert.equal(opened.preset, null);
        assert.equal(opened.elevationPreset, 'Atlas');
      }
    }
  });

  it('a vector layer has no raster palette', function() {
    var lyr = {geometry_type: 'polygon', shapes: [], data: new internal.DataTable(0)};
    assert.equal(getRasterPaletteScheme(lyr), null);
  });

  it('a palette that colors the sea like the land can\'t be opened', async function() {
    var o = await importDEM([-20, 100, 300]);
    await runCommand(o.catalog, '-classify field=band1 hypsometric=atlas sea=land');
    assert.equal(getRasterPaletteScheme(o.lyr), null);
  });

  it('leave their colors as a custom ramp for another method', async function() {
    var lyr = (await importDEM()).lyr;
    var scheme = setSchemeMethod(useElevations(lyr), 'quantile');
    assert.equal(scheme.preset, null);
    assert.equal(scheme.n, n);
    assert.deepEqual(getSchemeColors(scheme), desert);
    assert(!/breaks=/.test(formatSchemeCommand(scheme, getAppliedColors(scheme), {layer: lyr})));
  });
});
