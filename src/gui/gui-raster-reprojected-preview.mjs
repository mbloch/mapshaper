import { internal } from './gui-core';
import {
  getRasterBBox,
  getRasterGrid,
  getRasterPreview,
  getRasterViewRecipe,
  getRasterViewScalingStats,
  intersectBboxes,
  renderRasterPreview
} from '../rasters/mapshaper-raster-utils';
import { projectRasterGridForward } from '../rasters/mapshaper-raster-reprojection';
import { GUI } from './gui-lib';

var MAX_REPROJECTED_PREVIEW_PIXELS = 6e6;
var cache = new WeakMap();
var requestId = 0;

export function getCachedRasterReprojectedPreview(layer, ext) {
  var params = getRasterReprojectedPreviewParams(layer, ext);
  var entry = cache.get(layer);
  if (!entry || !entry.preview) return null;
  if (!params || entry.key != params.key) return entry.preview;
  return entry.preview;
}

export function scheduleRasterReprojectedPreview(layer, ext, onReady) {
  var params = getRasterReprojectedPreviewParams(layer, ext);
  var entry = cache.get(layer);
  var id, timing;
  if (!params) return;
  if (entry && entry.key == params.key) return;
  id = ++requestId;
  cache.set(layer, {key: params.key, pending: id});
  setTimeout(function() {
    var current = cache.get(layer);
    var grid, preview;
    if (!current || current.pending != id) return;
    timing = {};
    try {
      grid = projectRasterGridForward({grid: params.grid}, params.sourceCRS, params.displayCRS, {
        raster_mesh_interval: params.meshInterval,
        output_bbox: params.bbox,
        output_width: params.width,
        output_height: params.height,
        sample_method: params.sampleMethod,
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
    preview = renderRasterPreview(grid, params.recipe, grid.width, grid.height, params.stats);
    applyCoverageMask(preview, grid.coverage);
    timing.renderMs = getTimer() - timing.renderStart;
    logRasterReprojectionTiming(params, timing);
    preview.bbox = grid.bbox;
    current = cache.get(layer);
    if (!current || current.pending != id) return;
    cache.set(layer, {key: params.key, preview: preview});
    onReady();
  }, 0);
}

function getRasterReprojectedPreviewParams(layer, ext) {
  var raster = layer && layer.raster;
  var gui = layer && layer.gui;
  var sourceDataset = gui && gui.source && gui.source.dataset;
  var sourceInfo = sourceDataset && internal.getDatasetCrsInfo(sourceDataset);
  var sourceCRS = sourceInfo && sourceInfo.crs;
  var displayCRS = gui && gui.dynamic_crs;
  var sourceGrid = getRasterGrid(raster);
  var rasterBbox = gui && gui.bounds && gui.bounds.hasBounds() && gui.bounds.toArray();
  var viewBbox = ext && ext.getBounds().toArray();
  var bbox = rasterBbox && viewBbox && intersectBboxes(rasterBbox, viewBbox);
  var size = bbox && getPreviewSize(ext, sourceGrid);
  var recipe, stats;
  if (!sourceCRS || !displayCRS || !sourceGrid || !sourceGrid.samples || !bbox || !size) return null;
  recipe = getRasterViewRecipe(sourceGrid, raster.view && raster.view.recipe);
  stats = getRasterViewScalingStats(raster, recipe);
  return {
    key: getRasterReprojectedPreviewKey(layer, bbox, size, sourceCRS, displayCRS, recipe),
    grid: sourceGrid,
    sourceCRS: sourceCRS,
    displayCRS: displayCRS,
    bbox: bbox,
    width: size.width,
    height: size.height,
    recipe: recipe,
    stats: stats,
    sampleMethod: getRasterReprojectionSampleMethod(),
    meshInterval: 32
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

function getRasterReprojectedPreviewKey(layer, bbox, size, sourceCRS, displayCRS, recipe) {
  return [
    size.width,
    size.height,
    bbox.join(','),
    internal.crsToProj4(sourceCRS),
    internal.crsToProj4(displayCRS),
    recipe.type,
    recipe.scaling,
    recipe.scaleRange && recipe.scaleRange.join(','),
    recipe.percentileRange && recipe.percentileRange.join(','),
    getRasterReprojectionSampleMethod(),
    layer.raster && layer.raster.grid && layer.raster.grid.samples && layer.raster.grid.samples.length
  ].join('|');
}

function applyCoverageMask(preview, coverage) {
  var pixels = preview && preview.pixels;
  if (!pixels || !coverage) return;
  for (var i = 0; i < coverage.length; i++) {
    if (!coverage[i]) pixels[i * 4 + 3] = 0;
  }
}

function getRasterReprojectionSampleMethod() {
  var vars = GUI.getUrlVars();
  var val = vars['raster-bilinear'] ?? vars.raster_bilinear;
  return val === false || val == '0' ? 'nearest' : 'bilinear';
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
