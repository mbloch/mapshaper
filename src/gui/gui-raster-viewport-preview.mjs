import { internal } from './gui-core';
import { GUI } from './gui-lib';

var MAX_VIEWPORT_PREVIEW_PIXELS = 6e6;
var cache = new WeakMap();
var requestId = 0;

export function getCachedRasterViewportPreview(layer, ext) {
  var entry = cache.get(layer);
  var params = getRasterViewportPreviewParams(layer, ext);
  if (!entry || !params || !rasterViewportCacheEntryMatches(entry, params)) return null;
  return entry.preview;
}

export function scheduleRasterViewportPreview(layer, ext, onReady) {
  var params = getRasterViewportPreviewParams(layer, ext);
  var entry = cache.get(layer);
  var id, stats, timing, preview;
  if (!params || !params.needed) return;
  if (entry && rasterViewportCacheEntryMatches(entry, params)) return;
  id = ++requestId;
  cache.set(layer, getRasterViewportCacheEntry(params, {pending: id}));
  setTimeout(function() {
    var current = cache.get(layer);
    if (!current || current.pending != id) return;
    timing = {};
    stats = getCachedRasterScalingStats(params, timing);
    timing.renderStart = getTimer();
    preview = internal.renderRasterViewportPreview(params.grid, params.recipe, params.bbox, params.width, params.height, stats);
    timing.renderMs = getTimer() - timing.renderStart;
    logRasterPreviewTiming(params, timing);
    current = cache.get(layer);
    if (!preview || !current || current.pending != id) return;
    cache.set(layer, getRasterViewportCacheEntry(params, {preview: preview}));
    onReady();
  }, 0);
}

export function invalidateRasterViewportPreview(layer) {
  cache.delete(layer);
}

export function getRasterViewportPreviewParams(layer, ext) {
  var raster = layer && layer.raster;
  var grid = internal.getRasterGrid(raster);
  var rasterBbox = internal.getRasterBBox(raster);
  var mapBbox = ext.getBounds().toArray();
  var visibleBbox = rasterBbox && internal.intersectBboxes(rasterBbox, mapBbox);
  var preview = internal.getRasterPreview(raster);
  var recipe, pixelRatio, t, p1, p2, displayWidth, displayHeight, crop, width, height, scale, key, needed;
  if (!grid || !grid.samples || !visibleBbox || !grid.bbox) return null;
  if (!supportsNorthUpRaster(grid)) return null;
  crop = getRasterSourceWindow(grid, visibleBbox);
  if (!crop) return null;
  visibleBbox = crop.bbox;
  recipe = internal.getRasterViewRecipe(grid, raster.view && raster.view.recipe);
  pixelRatio = GUI.getPixelRatio();
  t = ext.getTransform(pixelRatio);
  p1 = t.transform(mapBbox[0], mapBbox[3]);
  p2 = t.transform(mapBbox[2], mapBbox[1]);
  displayWidth = Math.max(1, Math.round(Math.abs(p2[0] - p1[0])));
  displayHeight = Math.max(1, Math.round(Math.abs(p2[1] - p1[1])));
  width = Math.min(displayWidth, crop.width);
  height = Math.min(displayHeight, crop.height);
  scale = Math.min(1, Math.sqrt(MAX_VIEWPORT_PREVIEW_PIXELS / (width * height)));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  needed = viewportPreviewIsSharper(preview, grid, visibleBbox, width, height);
  key = [
    visibleBbox.map(roundKeyPart).join(','),
    width,
    height,
    pixelRatio,
    grid.width,
    grid.height,
    grid.samples && grid.samples.length,
    recipe.type,
    recipe.scaling,
    recipe.scaleRange && recipe.scaleRange.join(','),
    recipe.percentileRange && recipe.percentileRange.join(',')
  ].join('|');
  return {
    key: key,
    needed: needed,
    raster: raster,
    grid: grid,
    recipe: recipe,
    bbox: visibleBbox,
    width: width,
    height: height,
    sourceWidth: crop.width,
    sourceHeight: crop.height
  };
}

function rasterViewportCacheEntryMatches(entry, params) {
  return entry.key == params.key && entry.grid == params.grid && entry.samples == params.grid.samples;
}

function getRasterViewportCacheEntry(params, entry) {
  entry.key = params.key;
  entry.grid = params.grid;
  entry.samples = params.grid.samples;
  return entry;
}

function getCachedRasterScalingStats(params, timing) {
  var cached = params.raster.view && params.raster.view.scalingStats;
  var key;
  if (params.recipe.scaling == 'none') {
    timing.statsMs = 0;
    timing.statsSource = 'none';
    return null;
  }
  key = internal.getRasterScalingStatsKey(params.grid, params.recipe);
  if (cached && cached.key == key) {
    timing.statsMs = 0;
    timing.statsSource = 'raster-view-cache';
    return cached.stats;
  }
  timing.statsSource = 'computed';
  timing.statsStart = getTimer();
  cached = internal.getRasterViewScalingStats(params.raster, params.recipe);
  timing.statsMs = getTimer() - timing.statsStart;
  return cached;
}

function logRasterPreviewTiming(params, timing) {
  if (!rasterDebugIsOn()) return;
  console.log([
    'Raster viewport preview:',
    params.width + 'x' + params.height,
    'from',
    params.sourceWidth + 'x' + params.sourceHeight,
    'source px,',
    'stats=' + formatMs(timing.statsMs),
    '(' + timing.statsSource + '),',
    'render=' + formatMs(timing.renderMs) + ',',
    'total=' + formatMs(timing.statsMs + timing.renderMs) + ',',
    'scaling=' + params.recipe.scaling,
    'type=' + params.recipe.type
  ].join(' '));
}

function rasterDebugIsOn() {
  var vars = GUI.getUrlVars();
  return vars['raster-debug'] === true || vars['raster-debug'] == '1' || vars.raster_debug === true || vars.raster_debug == '1';
}

function getTimer() {
  return typeof performance != 'undefined' && performance.now ? performance.now() : Date.now();
}

function formatMs(ms) {
  return Math.round(ms * 10) / 10 + 'ms';
}

function supportsNorthUpRaster(grid) {
  var t = grid.transform;
  return !t || t[1] === 0 && t[3] === 0;
}

function getRasterSourcePixelSize(grid, bbox) {
  var crop = getRasterSourceWindow(grid, bbox);
  return crop ? {width: crop.width, height: crop.height} : {width: 0, height: 0};
}

function getRasterSourceWindow(grid, bbox) {
  var rb = grid.bbox;
  var dx = (rb[2] - rb[0]) / grid.width;
  var dy = (rb[3] - rb[1]) / grid.height;
  var x0 = Math.max(0, Math.floor((bbox[0] - rb[0]) / dx));
  var x1 = Math.min(grid.width, Math.ceil((bbox[2] - rb[0]) / dx));
  var y0 = Math.max(0, Math.floor((rb[3] - bbox[3]) / dy));
  var y1 = Math.min(grid.height, Math.ceil((rb[3] - bbox[1]) / dy));
  if (x1 <= x0 || y1 <= y0) return null;
  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    bbox: [
      rb[0] + x0 * dx,
      rb[3] - y1 * dy,
      rb[0] + x1 * dx,
      rb[3] - y0 * dy
    ]
  };
}

function viewportPreviewIsSharper(preview, grid, bbox, width, height) {
  var crop = getRasterSourcePixelSize(grid, bbox);
  var previewWidth = preview && preview.width || 0;
  var previewHeight = preview && preview.height || 0;
  var fallbackWidth = crop.width * previewWidth / grid.width;
  var fallbackHeight = crop.height * previewHeight / grid.height;
  return width > fallbackWidth * 1.25 || height > fallbackHeight * 1.25;
}

function roundKeyPart(val) {
  return Math.round(val * 1e9) / 1e9;
}
