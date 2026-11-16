import { internal } from './gui-core';
import { GUI } from './gui-lib';
import { previewHasSourcePixels } from './gui-raster-display-utils';

var MAX_REPROJECTED_PREVIEW_PIXELS = 6e6;
// cells on the long side of a blended palette's weights, across the view
var BLEND_FIELD_CELLS = 96;
var cache = new WeakMap();
var requestId = 0;

export function getCachedRasterReprojectedPreview(layer, ext) {
  var params = getRasterReprojectedPreviewParams(layer, ext);
  var entry = cache.get(layer);
  if (!entry || !entry.preview) return null;
  if (params && !rasterReprojectedCacheSourceMatches(entry, params)) return null;
  if (!params || entry.key != params.key) return entry.preview;
  return entry.preview;
}

export function scheduleRasterReprojectedPreview(layer, ext, onReady) {
  var params = getRasterReprojectedPreviewParams(layer, ext);
  var entry = cache.get(layer);
  var id, timing;
  if (!params) return;
  if (entry && rasterReprojectedCacheEntryMatches(entry, params)) return;
  id = ++requestId;
  cache.set(layer, getRasterReprojectedCacheEntry(params, {pending: id}));
  setTimeout(function() {
    var current = cache.get(layer);
    var grid, preview;
    if (!current || current.pending != id) return;
    timing = {};
    try {
      grid = internal.projectRasterGridForward({grid: getPaletteBandGrid(params)}, params.sourceCRS, params.displayCRS, {
        raster_mesh_interval: params.meshInterval,
        output_bbox: params.bbox,
        output_width: params.width,
        output_height: params.height,
        sample_method: params.sampleMethod,
        fill_uncovered: false,
        timing: timing
      });
    } catch(e) {
      cache.delete(layer);
      if (typeof console != 'undefined' && console.warn) {
        console.warn('Unable to reproject raster preview', e);
      }
      return;
    }
    timing.renderStart = getTimer();
    preview = internal.renderRasterPreview(grid, params.recipe, grid.width, grid.height, params.stats,
      getRenderOptions(params, grid));
    preview.sourcePixels = params.sourcePixels;
    applyCoverageMask(preview, grid.coverage);
    timing.renderMs = getTimer() - timing.renderStart;
    logRasterReprojectionTiming(params, timing);
    preview.bbox = grid.bbox;
    current = cache.get(layer);
    if (!current || current.pending != id) return;
    cache.set(layer, getRasterReprojectedCacheEntry(params, {preview: preview}));
    onReady();
  }, 0);
}

// A blended palette's weights and the sea's seeds are in the raster's
// coordinates; the reprojected grid needs them in the display's (or none, to
// draw the palette unblended)
function getRenderOptions(params, grid) {
  var palette = params.recipe.palette;
  var opts = {};
  if (!palette) return null;
  if (palette.blend) {
    opts.blendField = internal.getClimateWeightField(grid.bbox, params.displayCRS, BLEND_FIELD_CELLS);
  }
  if (palette.sea && palette.seaSeeds) {
    opts.seaSeeds = internal.getInlandSeaSeeds(params.displayCRS);
  }
  return opts;
}

function getRasterReprojectedPreviewParams(layer, ext) {
  var raster = layer && layer.raster;
  var gui = layer && layer.gui;
  var sourceDataset = gui && gui.source && gui.source.dataset;
  var sourceInfo = sourceDataset && internal.getDatasetCrsInfo(sourceDataset);
  var sourceCRS = sourceInfo && sourceInfo.crs;
  var displayCRS = gui && gui.dynamic_crs;
  var sourceGrid = internal.getRasterGrid(raster);
  var rasterBbox = gui && gui.bounds && gui.bounds.hasBounds() && gui.bounds.toArray();
  var viewBbox = ext && ext.getBounds().toArray();
  var bbox = rasterBbox && viewBbox && internal.intersectBboxes(rasterBbox, viewBbox);
  var size = bbox && getPreviewSize(ext, sourceGrid);
  var recipe, stats, sourcePixels;
  if (!sourceCRS || !displayCRS || !sourceGrid || !sourceGrid.samples || !bbox || !size) return null;
  recipe = internal.getRasterViewRecipe(sourceGrid, raster.view && raster.view.recipe);
  stats = internal.getRasterViewScalingStats(raster, recipe);
  sourcePixels = outputHasSourcePixels(sourceGrid, bbox, sourceCRS, displayCRS, size);
  return {
    key: getRasterReprojectedPreviewKey(layer, bbox, size, sourceCRS, displayCRS, recipe, sourcePixels),
    grid: sourceGrid,
    sourceCRS: sourceCRS,
    displayCRS: displayCRS,
    bbox: bbox,
    width: size.width,
    height: size.height,
    recipe: recipe,
    stats: stats,
    sourcePixels: sourcePixels,
    sampleMethod: getRasterReprojectionSampleMethod(sourcePixels, recipe),
    meshInterval: 32
  };
}

// Only the band that a palette colors is reprojected. The band is copied once
// for each grid (and palette band), not for each view.
var paletteBandGrids = new WeakMap();

function getPaletteBandGrid(params) {
  var grid = params.grid;
  var palette = params.recipe.palette;
  var entry = paletteBandGrids.get(grid);
  if (!palette) return grid;
  if (!entry || entry.band != palette.band || entry.samples != grid.samples) {
    entry = {band: palette.band, samples: grid.samples,
      grid: internal.getRasterPaletteBandGrid(grid, params.recipe)};
    paletteBandGrids.set(grid, entry);
  }
  return entry.grid;
}

// True if the reprojected grid has room for every source pixel in view, so that
// sampling it without interpolation gives back the raster's own pixels. This is
// the zoomed-in case: reprojecting a raster to fewer pixels than it has needs
// interpolation to avoid dropping data.
function outputHasSourcePixels(grid, bbox, sourceCRS, displayCRS, size) {
  var sourceSize = getSourcePixelsInView(grid, bbox, sourceCRS, displayCRS);
  return !!sourceSize && previewHasSourcePixels(
    size.width, size.height, sourceSize.width, sourceSize.height);
}

// Estimates how many of the raster's pixels a view covers, by taking the part
// of the source grid that the view maps back onto. Returns null if the view
// does not map back (e.g. it includes coordinates outside the projection).
function getSourcePixelsInView(grid, bbox, sourceCRS, displayCRS) {
  var transform = internal.getProjTransform2(displayCRS, sourceCRS);
  var xx = [bbox[0], (bbox[0] + bbox[2]) / 2, bbox[2]];
  var yy = [bbox[1], (bbox[1] + bbox[3]) / 2, bbox[3]];
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  var p;
  if (!transform) return null;
  for (var i = 0; i < xx.length; i++) {
    for (var j = 0; j < yy.length; j++) {
      p = transform(xx[i], yy[j]);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      if (p[0] < xmin) xmin = p[0];
      if (p[0] > xmax) xmax = p[0];
      if (p[1] < ymin) ymin = p[1];
      if (p[1] > ymax) ymax = p[1];
    }
  }
  if (!(xmax > xmin) || !(ymax > ymin)) return null;
  return {
    width: (xmax - xmin) / (grid.bbox[2] - grid.bbox[0]) * grid.width,
    height: (ymax - ymin) / (grid.bbox[3] - grid.bbox[1]) * grid.height
  };
}

function getPreviewSize(ext, grid) {
  var pixelRatio = GUI.getPixelRatio();
  var t = ext.getTransform(pixelRatio);
  var mapBbox = ext.getBounds().toArray();
  var p1 = t.transform(mapBbox[0], mapBbox[3]);
  var p2 = t.transform(mapBbox[2], mapBbox[1]);
  var width = Math.max(1, Math.round(Math.abs(p2[0] - p1[0])));
  var height = Math.max(1, Math.round(Math.abs(p2[1] - p1[1])));
  var scale = Math.min(1, Math.sqrt(MAX_REPROJECTED_PREVIEW_PIXELS / (width * height)));
  width = Math.min(grid.width, Math.max(1, Math.round(width * scale)));
  height = Math.min(grid.height, Math.max(1, Math.round(height * scale)));
  return {width: width, height: height};
}

function getRasterReprojectedPreviewKey(layer, bbox, size, sourceCRS, displayCRS, recipe, sourcePixels) {
  return [
    size.width,
    size.height,
    sourcePixels,
    bbox.join(','),
    internal.crsToProj4(sourceCRS),
    internal.crsToProj4(displayCRS),
    recipe.type,
    recipe.scaling,
    recipe.scaleRange && recipe.scaleRange.join(','),
    recipe.percentileRange && recipe.percentileRange.join(','),
    internal.getRasterPaletteKey(recipe.palette),
    getRasterReprojectionSampleMethod(sourcePixels, recipe),
    layer.raster && layer.raster.grid && layer.raster.grid.samples && layer.raster.grid.samples.length
  ].join('|');
}

function rasterReprojectedCacheEntryMatches(entry, params) {
  return entry.key == params.key && rasterReprojectedCacheSourceMatches(entry, params);
}

function rasterReprojectedCacheSourceMatches(entry, params) {
  return entry.grid == params.grid && entry.samples == params.grid.samples;
}

function getRasterReprojectedCacheEntry(params, entry) {
  entry.key = params.key;
  entry.grid = params.grid;
  entry.samples = params.grid.samples;
  return entry;
}

function applyCoverageMask(preview, coverage) {
  var pixels = preview && preview.pixels;
  if (!pixels || !coverage) return;
  for (var i = 0; i < coverage.length; i++) {
    if (!coverage[i]) pixels[i * 4 + 3] = 0;
  }
}

// Categories are never interpolated, which would give the codes of other
// categories
function getRasterReprojectionSampleMethod(sourcePixels, recipe) {
  var vars = GUI.getUrlVars();
  var val = vars['raster-bilinear'] ?? vars.raster_bilinear;
  if (val === false || val == '0') return 'nearest';
  if (internal.rasterPaletteIsCategorical(recipe && recipe.palette)) return 'nearest';
  // Interpolating between pixels when there is room for all of them would blur
  // the data away for nothing.
  return sourcePixels ? 'nearest' : 'bilinear';
}

function logRasterReprojectionTiming(params, timing) {
  if (!rasterDebugIsOn()) return;
  console.log([
    'Raster reprojection preview:',
    params.width + 'x' + params.height,
    'mesh=' + formatMs(timing.meshMs),
    'rasterize=' + formatMs(timing.rasterizeMs),
    'render=' + formatMs(timing.renderMs),
    'total=' + formatMs((timing.meshMs || 0) + (timing.rasterizeMs || 0) + (timing.renderMs || 0)) + ',',
    'vertices=' + timing.meshVertices,
    'sampling=' + params.sampleMethod
  ].join(' '));
}

function rasterDebugIsOn() {
  var vars = GUI.getUrlVars();
  return vars['raster-debug'] === true || vars['raster-debug'] == '1' || vars.raster_debug === true || vars.raster_debug == '1';
}

function formatMs(ms) {
  return Math.round((ms || 0) * 10) / 10 + 'ms';
}

function getTimer() {
  return typeof performance != 'undefined' && performance.now ? performance.now() : Date.now();
}
