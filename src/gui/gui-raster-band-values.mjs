import { internal } from './gui-core';

// The values that the color palettes panel classifies on a raster layer: the
// pixels of a band, sampled as -classify samples them (see
// mapshaper-raster-classify.mjs), so that the panel's classes are the ones
// -classify finds. A band is a field named as in -classify: band1 to bandN,
// numbered as in the source file.
//
// Samples and categories are cached by grid, since the panel reads them on
// every change, and commands that change the pixels make a new grid.

// bands with more unique values than this aren't offered as categories
var MAX_RASTER_CATEGORIES = 300;
// the range of elevations that a band can have, in meters
var MIN_ELEVATION = -12000;
var MAX_ELEVATION = 9000;
var ELEVATION_NAME = /(^|[^a-z])(dem|dtm|dsm)([^a-z]|$)|elev|height|altitude|srtm|etopo|gebco|bathy|topo|terrain|relief/i;
var cache = new WeakMap(); // grid -> {fields, samples: {}, categories: {}}

export function layerHasPaletteRaster(lyr) {
  return !!(lyr && internal.layerHasRaster(lyr) && internal.rasterCanTakePalette(lyr.raster));
}

export function getRasterBandFields(lyr) {
  var entry = getCacheEntry(lyr);
  return entry ? entry.bands.map(function(o) { return o.field; }) : [];
}

// e.g. 'Band 2 (Near infrared)'
export function getRasterBandLabel(lyr, field) {
  var o = findBand(lyr, field);
  if (!o) return field;
  return 'Band ' + o.band + (o.description ? ' (' + o.description + ')' : '');
}

// The band's sampled values, ascending (an Array, as the model's field values are)
export function getRasterBandValues(lyr, field) {
  var sample = getBandSample(lyr, field);
  return sample ? sample.values : [];
}

// The number of pixels that the band's sample stands for, and of valid pixels:
// {sampled, count, total}
export function getRasterBandCounts(lyr, field) {
  var sample = getBandSample(lyr, field);
  return sample ? {sampled: sample.values.length, count: sample.count, total: sample.total} : null;
}

// Integer bands with few enough values to color each one
export function getRasterCategoryFields(lyr) {
  var grid = getGrid(lyr);
  if (!grid || !internal.rasterBandIsInteger(grid)) return [];
  return getRasterBandFields(lyr).filter(function(field) {
    var categories = getRasterBandCategories(lyr, field);
    return categories.length > 0 && categories.length <= MAX_RASTER_CATEGORIES;
  });
}

// The band's unique values, ascending, as -classify gives them swatches
export function getRasterBandCategories(lyr, field) {
  var entry = getCacheEntry(lyr);
  var o = findBand(lyr, field);
  if (!o || !internal.rasterBandIsInteger(entry.grid)) return [];
  if (!entry.categories[field]) {
    entry.categories[field] = internal.getRasterBandCategories(entry.grid, o.index);
  }
  return entry.categories[field];
}

// A raster of values that aren't categories (by its interpretation) starts with
// continuous colors
export function rasterHasContinuousValues(lyr) {
  return !!(lyr && lyr.raster && lyr.raster.interpretation != 'categorical');
}

// Meters per unit of the raster's values. Unknown units are taken for meters,
// as the elevation commands take them.
export function getRasterUnitMeters(lyr) {
  var grid = getGrid(lyr);
  return grid && internal.getVerticalUnitMeters(grid.verticalUnits) || 1;
}

// e.g. 'm' or 'ft'
export function getRasterUnitsLabel(lyr) {
  var grid = getGrid(lyr);
  return grid && grid.verticalUnits ? internal.formatVerticalUnits(grid.verticalUnits) : 'm';
}

// Whether a band's values could be elevations: continuous values, all of them
// between the depth of the deepest ocean and the height of the highest
// mountain, with room to spare
export function rasterBandCouldBeElevation(lyr, field) {
  var values = getRasterBandValues(lyr, field);
  var meters = getRasterUnitMeters(lyr);
  if (!rasterHasContinuousValues(lyr) || values.length === 0) return false;
  return values[0] * meters >= MIN_ELEVATION && values[values.length - 1] * meters <= MAX_ELEVATION;
}

// Whether a band that could hold elevations says that it does: by its units,
// or by an elevation-like name or description of it or of its layer. Values
// in the range of elevations aren't enough, since plenty of other data fall in
// it.
export function rasterBandIsElevation(lyr, field) {
  var grid = getGrid(lyr);
  if (!grid || !rasterBandCouldBeElevation(lyr, field)) return false;
  return !!grid.verticalUnits || ELEVATION_NAME.test(getRasterBandLabel(lyr, field)) ||
    ELEVATION_NAME.test(lyr.name || '');
}

// Identifies the palette on a raster layer, for checking later whether a
// scheme still matches it
export function getRasterLayerPaletteKey(lyr) {
  var recipe = lyr && lyr.raster && lyr.raster.view && lyr.raster.view.recipe;
  return recipe && recipe.palette ? internal.getRasterPaletteKey(recipe.palette) : '';
}

function getBandSample(lyr, field) {
  var entry = getCacheEntry(lyr);
  var o = findBand(lyr, field);
  var sample;
  if (!o) return null;
  if (!entry.samples[field]) {
    sample = internal.getRasterBandSample(entry.grid, o.index); // values are ascending
    entry.samples[field] = sample;
  }
  return entry.samples[field];
}

function findBand(lyr, field) {
  var entry = getCacheEntry(lyr);
  return entry && entry.bands.find(function(o) { return o.field == field; }) || null;
}

function getGrid(lyr) {
  var grid = lyr && lyr.raster ? internal.getRasterGrid(lyr.raster) : null;
  return grid && grid.samples ? grid : null;
}

function getCacheEntry(lyr) {
  var grid = getGrid(lyr);
  var entry;
  if (!grid) return null;
  entry = cache.get(grid);
  if (!entry) {
    entry = {
      grid: grid,
      bands: internal.getRasterClassifyBands(grid).map(function(o) {
        return Object.assign({field: 'band' + o.band}, o);
      }),
      samples: {},
      categories: {}
    };
    cache.set(grid, entry);
  }
  return entry;
}
