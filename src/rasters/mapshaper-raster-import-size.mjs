import { stop } from '../utils/mapshaper-logging';

// Rasters larger than this are reduced on import unless resolution=full
export var DEFAULT_MAX_IMPORT_PIXELS = 16e6;

export var FULL_RESOLUTION_HINT =
  'Use import option resolution=full to import at full resolution, or resolution=<width> to choose a size.';

// Parses the resolution= import option: "full", or a width in pixels with an
// optional px unit. Returns null if the option is absent, otherwise
// {full: true} or {width: <n>}
export function parseImportResolution(val) {
  var str, match;
  if (val === undefined || val === null || val === '') return null;
  str = String(val).trim().toLowerCase();
  if (str == 'full') return {full: true};
  match = /^(\d+)(px)?$/.exec(str);
  if (!match || +match[1] < 1) {
    stop('Invalid resolution= value:', val + '.', 'Use full or a width in pixels, e.g. resolution=4000');
  }
  return {width: +match[1]};
}

export function getMaxImportPixels(opts) {
  return opts && (opts.maxPixels || opts.raster_max_pixels || opts.rasterMaxPixels) ||
    DEFAULT_MAX_IMPORT_PIXELS;
}

// The size to import a @width x @height raster at, given the resolution=
// option. A raster is never enlarged. Without the option, rasters larger than
// the import size limit are reduced to fit it.
export function getRasterImportSize(width, height, opts) {
  var resolution = parseImportResolution(opts && opts.resolution);
  var maxPixels, scale;
  if (resolution && resolution.full) {
    return {width: width, height: height};
  }
  if (resolution) {
    scale = Math.min(1, resolution.width / width);
  } else {
    maxPixels = getMaxImportPixels(opts);
    scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  }
  if (scale >= 1) return {width: width, height: height};
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
