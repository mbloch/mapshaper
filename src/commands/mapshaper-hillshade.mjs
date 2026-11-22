import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getScaleFactorAtXY, isLatLngCRS } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterGridBandIndex, getRasterViewRecipe, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import {
  getDefaultHighlightRatio,
  getDefaultMaxOpacity,
  writeHillshadeRgba,
  DEFAULT_ALTITUDE,
  DEFAULT_AZIMUTH,
  DEFAULT_GAMMA,
  DEFAULT_LIGHTING,
  getAutoExaggeration,
  getFittedVerticalScale,
  getHillshadeLights,
  getHillshadeMaxShade,
  getLightingSchemeNames,
  raiseLowElevations
} from '../rasters/mapshaper-hillshade';
import { runHillshadeStages } from '../rasters/mapshaper-hillshade-runner';
import { formatThresholdRange, getSmoothingSettings, parseSmoothingLevel } from '../rasters/mapshaper-terrain-smoothing-options';
import { formatVerticalUnits, getVerticalUnitMeters } from '../rasters/mapshaper-vertical-units';
import { formatColor, parseColor } from '../color/color-utils';
import { getHillshadeBasePosition, getHillshadeColorRamp, getHillshadeRampColors } from '../rasters/mapshaper-raster-color';
import { runningInBrowser } from '../mapshaper-env';
import { message, stop, verbose, warnOnce } from '../utils/mapshaper-logging';
var METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;
var DEFAULT_AMBIENT = 0.5;
var DEFAULT_TEXTURE_DETAIL = 0.5;

// Returns a new layer; -hillshade replaces the target unless + is used
// @resume optional function to call after each wait for workers
//   (job.resumeCommand())
cmd.hillshade = async function(lyr, dataset, opts, resume) {
  var grid, cells, elev, valid, altitude, exaggeration, style, out, result;
  var hasMin, toneOpts, azimuth, colors, smoothing, params, ambient, lighting, lights, stops = null;
  var unitMeters, minElevation, band;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateHillshadeGrid(grid, opts);
  band = getRasterGridBandIndex(grid, opts.band);
  style = getHillshadeStyle(opts);
  smoothing = opts.smoothing == null ? 0 : parseSmoothingLevel(opts.smoothing, 'smoothing=', 0);
  altitude = opts.altitude >= 0 ? opts.altitude : DEFAULT_ALTITUDE;
  if (altitude > 90) stop('altitude= should be from 0 to 90 degrees');
  colors = {
    shadow: readToneColor(opts.shadow_color, 'shadow-color'),
    highlight: readToneColor(opts.highlight_color, 'highlight-color'),
    ramp: null
  };
  if (style == 'opaque') {
    stops = getHillshadeRampColors(colors.shadow, readToneColor(opts.base_color, 'base-color'),
      colors.highlight);
    colors.ramp = getHillshadeColorRamp(stops);
  }
  cells = getHillshadeCellSizes(grid, getDatasetCRS(dataset));
  exaggeration = opts.exaggeration > 0 ? opts.exaggeration : getAutoExaggeration(cells.median);
  if (!(opts.exaggeration > 0)) {
    message('Exaggeration:', formatExaggeration(exaggeration) + ' (automatic)');
  }
  azimuth = opts.azimuth == null ? DEFAULT_AZIMUTH : opts.azimuth;
  ambient = opts.ambient >= 0 ? opts.ambient : DEFAULT_AMBIENT;
  lighting = opts.lighting || DEFAULT_LIGHTING;
  lights = getHillshadeLights(azimuth, altitude, lighting);
  if (!lights) {
    stop('lighting= should be one of: ' + getLightingSchemeNames().join(', '));
  }
  toneOpts = {
    maxOpacity: opts.max_opacity >= 0 ? opts.max_opacity : getDefaultMaxOpacity(style),
    highlightRatio: opts.highlights >= 0 ? opts.highlights : getDefaultHighlightRatio(),
    gamma: opts.gamma > 0 ? opts.gamma : DEFAULT_GAMMA,
    maxShade: getHillshadeMaxShade(lights),
    basePosition: stops ? getHillshadeBasePosition(stops) : null
  };
  hasMin = opts.min_elevation != null;
  valid = getRasterValidityMask(grid);
  unitMeters = getElevationScale(lyr, grid, band, valid, cells,
    'its relief was scaled to a typical steepness', 'To adjust it, use exaggeration=. To shade it to scale');
  // min-elevation= is in the raster's own units, like the values -info shows
  minElevation = hasMin ? opts.min_elevation * unitMeters : null;
  params = Object.assign({opaque: style == 'opaque', azimuth: azimuth, altitude: altitude,
    lighting: lighting, exaggeration: exaggeration,
    max_opacity: stops ? null : toneOpts.maxOpacity,
    highlights: stops ? null : toneOpts.highlightRatio,
    gamma: toneOpts.gamma,
    // the opaque style's colors as used, including derived ones
    shadow_color: stops ? opts.shadow_color || formatColor(stops.shadow) : opts.shadow_color || null,
    highlight_color: stops ? opts.highlight_color || formatColor(stops.highlight) : opts.highlight_color || null,
    base_color: stops ? opts.base_color || formatColor(stops.base) : null,
    min_elevation: hasMin ? opts.min_elevation : null,
    smoothing: smoothing,
    light_adjust: opts.light_adjust || 0, ambient: ambient,
    texture: opts.texture || 0,
    texture_detail: opts.texture > 0 ? opts.texture_detail || DEFAULT_TEXTURE_DETAIL : null,
    texture_highlights: opts.texture > 0 ? opts.texture_highlights || 0 : null,
    aerial: opts.aerial || 0,
    band: opts.band || null});
  verbose('Settings:', formatHillshadeSettings(params));
  if (!cells.unknown) {
    verbose('Ground pixel size:', formatPixelSize(cells.median));
    if (grid.verticalUnits) {
      verbose('Elevation units:', formatVerticalUnits(grid.verticalUnits));
    }
  }
  elev = readElevationBand(grid, band, unitMeters);
  if (hasMin) {
    raiseLowElevations(elev, valid, minElevation);
  }
  result = await runHillshadeStages({
    elev: elev,
    valid: valid,
    width: grid.width,
    height: grid.height,
    cellWidths: cells.widths,
    cellHeights: cells.heights
  }, getSmoothingSettings(smoothing, {}, cells.median, minElevation), {
    lights: lights,
    azimuth: azimuth,
    exaggeration: exaggeration,
    lightAdjust: opts.light_adjust || 0,
    ambient: ambient,
    aerial: opts.aerial || 0,
    texture: opts.texture || 0,
    textureDetail: params.texture_detail,
    textureHighlights: params.texture_highlights,
    minElevation: hasMin ? minElevation : null,
    style: style,
    toneOpts: toneOpts
  }, {workers: opts.workers, resume: resume});
  if (result.workers > 0) {
    verbose('Workers:', result.workers);
  }
  if (result.thresholds) {
    verbose('FPS thresholds:', formatThresholdRange(result.thresholds, valid));
  }
  out = {
    raster_type: 'grid',
    raster: getHillshadeRaster(lyr.raster, grid,
      writeHillshadeRgba(result.tones, valid, style, colors), params)
  };
  setOutputLayerName(out, lyr, 'hillshade', opts);
  return [out];
};

// derivation entries that aren't options
var UNFORMATTED_PARAMS = ['type', 'sourceId'];

// Formats the settings recorded in a hillshade's derivation as command
// options, so they can be pasted into a command
export function formatHillshadeSettings(params) {
  return Object.keys(params).filter(function(key) {
    var val = params[key];
    return val !== null && val !== false && UNFORMATTED_PARAMS.indexOf(key) == -1;
  }).map(function(key) {
    var name = key.replace(/_/g, '-');
    var val = params[key];
    if (val === true) return name;
    return name + '=' + (typeof val == 'number' ? +val.toFixed(3) : val);
  }).join(' ');
}

// e.g. 3.0, 2.75
function formatExaggeration(val) {
  return val % 1 === 0 ? val.toFixed(1) : String(val);
}

function formatPixelSize(meters) {
  return meters >= 100 ? Math.round(meters) + ' m' : +meters.toFixed(1) + ' m';
}

function validateHillshadeGrid(grid, opts) {
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing the data needed for hillshading');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Hillshading does not support rotated or skewed rasters');
  }
  if (opts.max_opacity != null && !(opts.max_opacity >= 0 && opts.max_opacity <= 1)) {
    stop('max-opacity= should be from 0 to 1');
  }
  if (opts.highlights != null && !(opts.highlights >= 0)) {
    stop('highlights= should be 0 or more');
  }
  if (opts.gamma != null && !(opts.gamma > 0)) {
    stop('gamma= should be a positive number');
  }
  if (opts.light_adjust != null && !(opts.light_adjust >= 0 && opts.light_adjust <= 60)) {
    stop('light-adjust= should be from 0 to 60 degrees');
  }
  if (opts.texture_detail != null && !(opts.texture_detail > 0 && opts.texture_detail <= 2)) {
    stop('texture-detail= should be from 0 to 2');
  }
  if (opts.texture_highlights != null && !(opts.texture_highlights >= 0)) {
    stop('texture-highlights= should be 0 or more');
  }
  if ((opts.texture_detail != null || opts.texture_highlights != null) && !(opts.texture > 0)) {
    stop('texture-detail= and texture-highlights= require texture=');
  }
  if (opts.workers != null && !(opts.workers >= 0 && opts.workers <= 64)) {
    stop('workers= should be from 0 to 64');
  }
  ['ambient', 'aerial', 'texture'].forEach(function(name) {
    if (opts[name] != null && !(opts[name] >= 0 && opts[name] <= 1)) {
      stop(name + '= should be from 0 to 1');
    }
  });
}

// Returns 'opaque' or 'shadow' (the default); base-color= implies opaque
function getHillshadeStyle(opts) {
  var style = opts.opaque || opts.base_color ? 'opaque' : 'shadow';
  if (style == 'opaque' && (opts.max_opacity != null || opts.highlights != null)) {
    stop('max-opacity= and highlights= are for transparent hillshades. With opaque, use shadow-color=, base-color= and highlight-color=');
  }
  return style;
}

function readToneColor(str, optionName) {
  var color;
  if (!str) return null;
  color = parseColor(str);
  if (!color) stop('Unsupported ' + optionName + '=', str);
  return color;
}

// Returns elevations in meters
// @metersPerUnit: the length of the raster's vertical unit in meters
export function readElevationBand(grid, band, metersPerUnit) {
  var n = grid.width * grid.height;
  var out = new Float32Array(n);
  for (var i = 0, j = band; i < n; i++, j += grid.bands) {
    out[i] = grid.samples[j] * metersPerUnit;
  }
  return out;
}

// Meters per unit of the raster's values. In pixel coordinates, the ratio of
// a DEM's values to its pixel size is unknown, whatever units the values are
// in, so the ratio is fitted instead, with a message.
// @what, @advice parts of the message, e.g. 'its relief was scaled to a
//   typical steepness', 'To shade it to scale'
// @cells from getHillshadeCellSizes()
export function getElevationScale(lyr, grid, band, valid, cells, what, advice) {
  var scale;
  if (!cells.unknown) return getElevationUnitMeters(grid);
  // pixels are taken to be 1 m across
  scale = getFittedVerticalScale(readElevationBand(grid, band, 1), valid, grid.width, grid.height,
    cells.widths, cells.heights);
  message((lyr.name || 'This raster') + ' has no ground scale (it is in pixel' +
    ' coordinates), so ' + what + ' (vertical scale ' + +scale.toPrecision(3) + '). ' +
    advice + ', import it with pixel-size= (and vertical-units=, if not meters).');
  return scale;
}

// Meters per vertical unit of the raster. A raster in unknown units is taken
// to be in meters, as most DEMs are.
function getElevationUnitMeters(grid) {
  var units = grid.verticalUnits;
  var meters = getVerticalUnitMeters(units);
  if (units && !meters) {
    warnOnce('Unknown elevation units (' + units + '); assuming meters');
  }
  return meters || 1;
}

// Ground size of a pixel in meters, for each row: the size in map units,
// converted to meters and corrected by the projection's scale factor.
// A size given with pixel-size= at import takes the place of a CRS.
// Returns {widths, heights, median, unknown}; unknown is true for a raster in
// pixel coordinates, whose sizes are in pixels.
export function getHillshadeCellSizes(grid, crs) {
  var h = grid.height;
  var bbox = grid.bbox;
  var unitsX = (bbox[2] - bbox[0]) / grid.width;
  var unitsY = (bbox[3] - bbox[1]) / h;
  var widths = new Float64Array(h);
  var heights = new Float64Array(h);
  var centerX = (bbox[0] + bbox[2]) / 2;
  var unitMeters = grid.horizontalUnitMeters > 0 ? grid.horizontalUnitMeters : null;
  var unknown = !crs && !unitMeters && !!grid.pixelCoordinates;
  var y, rowY, k, lastK, kx;
  if (!crs && !unitMeters && !unknown) {
    warnOnce('The raster\'s coordinate system is unknown; assuming that its coordinates are in meters');
  }
  for (y = 0; y < h; y++) {
    rowY = bbox[3] - (y + 0.5) * unitsY;
    if (unitMeters) {
      widths[y] = unitsX * unitMeters;
      heights[y] = unitsY * unitMeters;
    } else if (!crs) {
      widths[y] = unitsX;
      heights[y] = unitsY;
    } else if (isLatLngCRS(crs)) {
      kx = Math.cos(Math.max(-89.9, Math.min(89.9, rowY)) * Math.PI / 180);
      widths[y] = unitsX * METERS_PER_DEGREE * kx;
      heights[y] = unitsY * METERS_PER_DEGREE;
    } else {
      k = getScaleFactorAtXY(centerX, rowY, crs);
      if (!(k > 0 && isFinite(k))) k = lastK || 1;
      lastK = k;
      widths[y] = unitsX * crs.to_meter / k;
      heights[y] = unitsY * crs.to_meter / k;
    }
  }
  return {widths: widths, heights: heights, median: getMedian(widths), unknown: unknown};
}

function getMedian(arr) {
  var sorted = Array.from(arr).sort(function(a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}

function getHillshadeRaster(src, grid, samples, params) {
  var raster = {
    sourceId: src.sourceId,
    interpretation: 'image',
    grid: {
      width: grid.width,
      height: grid.height,
      bands: 4,
      pixelType: 'uint8',
      samples: samples,
      sampleBands: [0, 1, 2, 3],
      nodata: null,
      bbox: grid.bbox.concat(),
      transform: grid.transform ? grid.transform.concat() : null
    },
    derivation: Object.assign({type: 'hillshade', sourceId: src.sourceId}, params),
    view: {recipe: {type: 'rgb', bands: [0, 1, 2, 3], scaling: 'none'}}
  };
  raster.view.recipe = getRasterViewRecipe(raster.grid, raster.view.recipe, {});
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  return raster;
}
