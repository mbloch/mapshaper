import cmd from '../mapshaper-cmd';
import { Bounds } from '../geom/mapshaper-bounds';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { resolveFrameForDataset } from '../furniture/mapshaper-frame-resolver';
import { coordinateSystemsConflict } from '../furniture/mapshaper-frame-members';
import { getFrameLayerData } from '../furniture/mapshaper-frame-utils';
import { resampleRasterGrid, RESAMPLE_METHODS } from '../rasters/mapshaper-raster-resample';
import {
  createRasterPreview,
  getRasterCrop,
  getRasterCropBBox,
  getRasterGrid,
  intersectBboxes,
  rasterGridIsRotated
} from '../rasters/mapshaper-raster-utils';
import { fillEmptyRasterPixels, rasterAppearsCategorical, updateRasterViewForGrid } from '../rasters/mapshaper-raster-fill';
import { FULL_RESOLUTION_HINT } from '../rasters/mapshaper-raster-import-size';
import { runningInBrowser } from '../mapshaper-env';
import { message, stop, warn } from '../utils/mapshaper-logging';

var DEFAULT_BLEED = 10; // frame pixels
var FRAME_PIXELS_PER_INCH = 72;
var MAX_OUTPUT_PIXELS = 48e6;
// in pixels; keeps a raster edge that is already on the frame's pixel grid
// from gaining a sliver of a pixel through rounding error
var SNAP_TOLERANCE = 1e-6;

// Returns a new layer; -resample replaces the target unless + is used
cmd.resample = function(lyr, dataset, catalog, opts) {
  var raster, grid, res, crop, frame, extent, method, out;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  raster = lyr.raster;
  grid = getRasterGrid(raster);
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing image data');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Resampling a rotated or skewed raster is not supported');
  }
  res = parseResampleResolution(opts.resolution);
  crop = !!opts.crop || opts.bleed !== undefined && opts.bleed !== null;
  if (crop && opts.bleed != null && !(opts.bleed >= 0)) {
    stop('bleed= should be a number of frame pixels, 0 or more');
  }
  frame = res.type == 'frame' || crop ? getResampleFrame(catalog, dataset, res, crop) : null;
  extent = getResampleExtent(grid, res, frame, crop ? getBleed(opts) : -1);
  method = getResampleMethod(raster, opts.method);
  warnIfReducedResolution(lyr, grid, extent);
  out = {
    raster_type: 'grid',
    raster: getResampledRaster(raster,
      resampleRasterGrid(grid, extent.bbox, extent.width, extent.height, method, getEnlargeMethod(grid)), opts)
  };
  setOutputLayerName(out, lyr, 'resample', opts);
  message(formatResampleMessage(lyr, grid, extent));
  return [out];
};

// Parses the resolution of -resample: raster pixels per frame pixel (2x), dots
// per inch of the frame (150dpi), a percentage of the current size (50%) or a
// width in pixels (4000px). Returns {type: 'frame', pixelsPerFramePixel},
// {type: 'scale', scale} or {type: 'width', width}
export function parseResampleResolution(arg) {
  var str = arg === undefined || arg === null ? '' : String(arg).trim().toLowerCase();
  var match = /^(\d*\.?\d+)\s*(x|dpi|%|px)$/.exec(str);
  var val = match ? +match[1] : NaN;
  var hint = 'Use a value like 2x (raster pixels per frame pixel), 150dpi, 50% or 4000px (width)';
  if (!str) {
    stop('Missing a resolution.', hint);
  }
  if (!match || !(val > 0)) {
    stop('Invalid resolution: ' + arg + '.', hint);
  }
  if (match[2] == 'x') return {type: 'frame', pixelsPerFramePixel: val};
  if (match[2] == 'dpi') return {type: 'frame', pixelsPerFramePixel: val / FRAME_PIXELS_PER_INCH};
  if (match[2] == '%') return {type: 'scale', scale: val / 100};
  if (val != Math.round(val)) {
    stop('Invalid resolution: ' + arg + '. A width in pixels should be a whole number');
  }
  return {type: 'width', width: val};
}

// The output grid: {bbox, width, height}
// @frame {bbox, width, height} the frame's area and size in frame pixels, as
//   drawn (see getResampleFrame()); needed for frame-relative resolutions and
//   for cropping
// @bleed margin around the frame in frame pixels when cropping, or -1
// Frame-relative resolutions put the output's pixel edges on a grid of 1/n
// frame pixels that starts at the frame's top left corner, so the output is
// drawn in the frame without being resampled again. Other resolutions keep
// the raster's area, or with cropping the source pixels that the frame and
// its bleed overlap.
export function getResampleExtent(grid, res, frame, bleed) {
  var region = grid.bbox;
  var framePx, px, bbox, crop, width, height;
  if (bleed >= 0) {
    framePx = getFramePixelSize(frame);
    region = intersectBboxes(grid.bbox, [
      frame.bbox[0] - bleed * framePx,
      frame.bbox[1] - bleed * framePx,
      frame.bbox[2] + bleed * framePx,
      frame.bbox[3] + bleed * framePx
    ]);
    if (!region) stop('The raster layer is outside the map frame');
  }
  if (res.type == 'frame') {
    px = getFramePixelSize(frame) / res.pixelsPerFramePixel;
    bbox = snapBboxToPixelGrid(region, frame.bbox[0], frame.bbox[3], px);
    width = Math.max(1, Math.round((bbox[2] - bbox[0]) / px));
    height = Math.max(1, Math.round((bbox[3] - bbox[1]) / px));
  } else {
    crop = getRasterCrop(grid, region);
    bbox = getRasterCropBBox(grid, crop);
    if (res.type == 'scale') {
      width = Math.max(1, Math.round(crop.width * res.scale));
      height = Math.max(1, Math.round(crop.height * res.scale));
    } else {
      width = res.width;
      height = Math.max(1, Math.round(crop.height * res.width / crop.width));
    }
  }
  if (width * height > MAX_OUTPUT_PIXELS) {
    stop('The resampled raster would be too large (' + width + 'x' + height + ' pixels). Use a lower resolution' +
      (bleed < 0 && frame ? ', or crop to crop it to the map frame' : ''));
  }
  return {bbox: bbox, width: width, height: height};
}

function getFramePixelSize(frame) {
  return (frame.bbox[2] - frame.bbox[0]) / frame.width;
}

// The smallest bbox containing @bbox whose edges are on a grid of @px units
// with a corner at @x0, @y0
function snapBboxToPixelGrid(bbox, x0, y0, px) {
  return [
    x0 + snapFloor((bbox[0] - x0) / px) * px,
    y0 - snapCeil((y0 - bbox[1]) / px) * px,
    x0 + snapCeil((bbox[2] - x0) / px) * px,
    y0 - snapFloor((y0 - bbox[3]) / px) * px
  ];
}

function snapFloor(x) {
  var r = Math.round(x);
  return Math.abs(x - r) < SNAP_TOLERANCE ? r : Math.floor(x);
}

function snapCeil(x) {
  var r = Math.round(x);
  return Math.abs(x - r) < SNAP_TOLERANCE ? r : Math.ceil(x);
}

// The frame as it is drawn: its area is filled out to the aspect ratio of its
// size in pixels, as export does
function getResampleFrame(catalog, dataset, res, crop) {
  var frame = resolveFrameForDataset(catalog, dataset);
  var data;
  if (!frame) {
    stop(res.type == 'frame' ?
      'A resolution in x or dpi is relative to a map frame. Use -frame to create one, or give a width (e.g. 4000px) or a percentage (e.g. 50%)' :
      'Cropping requires a map frame. Use -frame to create one');
  }
  if (coordinateSystemsConflict(catalog, frame, dataset)) {
    stop('The raster layer and map frame', frame.layer.name || '', 'have different coordinate systems. Use -proj first');
  }
  data = getFrameLayerData(frame.layer, frame.dataset.arcs);
  return {
    bbox: new Bounds(data.bbox).fillOut(data.width / data.height).toArray(),
    width: data.width,
    height: data.height
  };
}

function getBleed(opts) {
  return opts.bleed >= 0 ? opts.bleed : DEFAULT_BLEED;
}

function getResampleMethod(raster, arg) {
  var categorical = rasterAppearsCategorical(raster);
  if (!arg) return categorical ? 'nearest' : 'auto';
  if (!RESAMPLE_METHODS.includes(arg)) {
    stop('Unsupported method= value:', arg + '. Use', RESAMPLE_METHODS.join(', ').replace(/, (\w+)$/, ' or $1'));
  }
  if (categorical && arg != 'nearest') {
    stop('Categorical rasters can only be resampled with method=nearest');
  }
  return arg;
}

// Data rasters, like elevation, are enlarged smoothly (B-spline), since the
// sharper bicubic overshoots at sharp crests, which a hillshade shows as
// beads. 8-bit images keep bicubic's sharpness. Imported DEMs are labeled as
// images, so the sample type tells them apart.
function getEnlargeMethod(grid) {
  var isByte = grid.samples instanceof Uint8Array || grid.samples instanceof Uint8ClampedArray;
  return isByte ? 'bicubic' : 'bspline';
}

function warnIfReducedResolution(lyr, grid, extent) {
  var reduced = lyr.raster.reducedResolution;
  var srcPx = (grid.bbox[2] - grid.bbox[0]) / grid.width;
  var outPx = (extent.bbox[2] - extent.bbox[0]) / extent.width;
  if (reduced && outPx < srcPx) {
    warn('Raster layer [' + (lyr.name || '') + '] was imported at reduced resolution (' +
      reduced.width + 'x' + reduced.height + ' of ' + reduced.sourceWidth + 'x' + reduced.sourceHeight +
      ' pixels), so enlarging it adds no detail. ' + FULL_RESOLUTION_HINT);
  }
}

function formatResampleMessage(lyr, grid, extent) {
  return 'Resampled [' + (lyr.name || '') + '] from ' + grid.width + 'x' + grid.height + ' to ' +
    extent.width + 'x' + extent.height + ' pixels';
}

// The source raster with the new grid. The recipe and derivation are copied,
// since updateRasterViewForGrid() may change them, and with + the source
// layer is kept. The resampled grid is no longer the import's reduced-
// resolution copy of its source.
function getResampledRaster(src, grid, opts) {
  var raster = Object.assign({}, src, {
    grid: grid,
    view: Object.assign({}, src.view)
  });
  fillEmptyRasterPixels(grid, src, opts);
  if (raster.view.recipe) raster.view.recipe = Object.assign({}, raster.view.recipe);
  if (raster.derivation) raster.derivation = Object.assign({}, raster.derivation);
  delete raster.view.preview;
  delete raster.view.scalingStats;
  delete raster.reducedResolution;
  updateRasterViewForGrid(raster);
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  return raster;
}
