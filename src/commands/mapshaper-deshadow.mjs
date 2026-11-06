import cmd from '../mapshaper-cmd';
import { crsTransformsDiffer, getDatasetCRS, isLatLngCRS, toLngLat } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { deshadowImage, getSolarDeclination, resampleGridBand, MAX_MASK_RATIO, MIN_ALTITUDE, MIN_SUN_FIT } from '../rasters/mapshaper-deshadow';
import { getRasterGrid, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import { getVerticalUnitMeters } from '../rasters/mapshaper-vertical-units';
import { getHillshadeCellSizes } from './mapshaper-hillshade';
import { getColoredRaster, rasterCanBeToned } from './mapshaper-tone';
import { message, stop, warnOnce } from '../utils/mapshaper-logging';

// Terrain cells are about this size, or the size of an image pixel if larger
var TERRAIN_CELL = 1.2;
var MAX_TERRAIN_CELLS = 16e6;
// Terrain beyond the image is read out to the length of the shadow of the
// DEM's relief at this sun altitude, up to MAX_MARGIN meters
var MIN_SHADOW_ALTITUDE = 15;
var MAX_MARGIN = 2000;
// longest span of imagery dates (days) that the sun's path is fitted to
var MAX_DATE_RANGE = 92;

// Brightens terrain shadows in an RGB image (experimental)
// @dem {layer, dataset} of an elevation raster
// @nirSource optional {layer, dataset} of a near-infrared raster (band 1)
// Returns a new layer, or no layers if the image couldn't be relit; -deshadow
// replaces the target unless + is used
cmd.deshadow = function(lyr, dataset, dem, nirSource, opts) {
  var grid, demGrid, crs, cells, pixelW, pixelH, pixelSize, demCells, demPixelSize;
  var terrain, nir, path, result, out;
  if (!layerHasRaster(lyr) || !rasterCanBeToned(lyr.raster)) {
    stop('-deshadow requires an RGB image layer');
  }
  if (!dem || !layerHasRaster(dem.layer)) {
    stop('dem= should name an elevation raster');
  }
  if (nirSource && !layerHasRaster(nirSource.layer)) {
    stop('nir= should name a near-infrared raster');
  }
  grid = getRasterGrid(lyr.raster);
  demGrid = getRasterGrid(dem.layer.raster);
  if (rasterGridIsRotated(grid) || rasterGridIsRotated(demGrid)) {
    stop('-deshadow does not support rotated rasters');
  }
  crs = getDatasetCRS(dataset);
  requireMatchingCRS(crs, getDatasetCRS(dem.dataset), 'dem=');
  if (nirSource) requireMatchingCRS(crs, getDatasetCRS(nirSource.dataset), 'nir=');
  cells = getHillshadeCellSizes(grid, crs);
  if (cells.unknown) {
    stop('-deshadow needs an image with a known pixel size');
  }
  pixelW = cells.widths[Math.floor(grid.height / 2)];
  pixelH = cells.heights[Math.floor(grid.height / 2)];
  pixelSize = Math.sqrt(pixelW * pixelH);
  demCells = getHillshadeCellSizes(demGrid, getDatasetCRS(dem.dataset));
  demPixelSize = Math.sqrt(demCells.median * demCells.heights[Math.floor(demGrid.height / 2)]);
  terrain = getTerrainGrid(demGrid, grid, pixelW, pixelH);
  if (!terrain) {
    stop('dem= does not cover the image');
  }
  nir = nirSource ? readNirBand(getRasterGrid(nirSource.layer.raster), grid) : null;
  path = getSunPath(grid, crs, dataset, opts);
  result = deshadowImage({samples: grid.samples, bands: grid.bands, width: grid.width, height: grid.height},
    terrain, nir, pixelSize, demPixelSize, path);
  if (result.sun.score >= MIN_SUN_FIT) {
    message(formatSun(result.sun, path));
  }
  if (!result.samples) {
    message(getFailureMessage(result, !!nir));
    return [];
  }
  message('Shadows: ' + formatPercent(result.shadowShare) + ' of the image, brightened ' +
    result.gains.map(function(g) { return g.toFixed(1) + 'x'; }).join(', ') + ' (red, green, blue)');
  out = {
    raster_type: 'grid',
    raster: getColoredRaster(lyr.raster, grid,
      {samples: result.samples, bands: grid.bands}, {
        type: 'deshadow',
        dem: dem.layer.name || null,
        nir: nirSource && nirSource.layer.name || null,
        date: path ? path.date : null,
        sun_azimuth: +(result.sun.azimuth * 180 / Math.PI).toFixed(1),
        sun_altitude: +(result.sun.altitude * 180 / Math.PI).toFixed(1)
      })
  };
  setOutputLayerName(out, lyr, 'deshadow', opts);
  return [out];
};

function formatSun(sun, path) {
  var match = 'match ' + sun.score.toFixed(2);
  if (!path) {
    return 'Sun position (fitted): azimuth ' + formatDegrees(sun.azimuth) +
      ', altitude ' + formatDegrees(sun.altitude) + ' (' + match + ')';
  }
  return 'Sun position ' + (path.date.includes('/') ? 'between ' + path.date.replace('/', ' and ') :
    'on ' + path.date) + ' (fitted): azimuth ' + formatDegrees(sun.azimuth) +
    ', altitude ' + formatDegrees(sun.altitude) + ', ' + formatSolarTime(sun.hour) +
    ' solar time (' + match + ')';
}

function formatSolarTime(hour) {
  var minutes = Math.round((12 + hour / 15) * 60);
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0');
}

// The image's date (or range of dates) and latitude, to fit the sun along its
// path; null if the date is unknown (or the imagery spans more than
// MAX_DATE_RANGE)
// Returns {date, latitude, declinations}: date is a date or an interval
//   (start/end); declinations are the min and max
function getSunPath(grid, crs, dataset, opts) {
  var dates = opts.date ? [parseImageryDate(opts.date)] : findImageryDates(dataset);
  var lat = dates ? getCenterLatitude(grid, crs) : null;
  if (lat === null) return null;
  return {date: dates.join('/'), latitude: lat, declinations: getDeclinationRange(dates)};
}

function getDeclinationRange(dates) {
  var t0 = Date.parse(dates[0]), t1 = Date.parse(dates[dates.length - 1]);
  var min = Infinity, max = -Infinity, t, d;
  for (t = t0; t <= t1; t += 864e5) {
    d = getSolarDeclination(getDayOfYear(new Date(t).toISOString().slice(0, 10)));
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}

function parseImageryDate(str) {
  var match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(str));
  if (!match || !(Date.parse(str) > -Infinity)) {
    stop('date= should be a date like 2023-06-15');
  }
  return str;
}

// The first and last dates of the imagery that -fetch downloaded (one date if
// they're the same)
function findImageryDates(dataset) {
  var source = dataset.info && dataset.info.raster_sources && dataset.info.raster_sources[0];
  var acq = source && source.acquisitions;
  var start, end;
  if (!acq) return null;
  if (acq.type == 'states') {
    acq.groups.forEach(function(g) {
      if (g.start && (!start || g.start < start)) start = g.start;
      if (g.end && (!end || g.end > end)) end = g.end;
    });
  } else {
    start = acq.start;
    end = acq.end;
  }
  if (!start || !end || (Date.parse(end) - Date.parse(start)) / 864e5 > MAX_DATE_RANGE) {
    return null;
  }
  return start == end ? [start] : [start, end];
}

function getDayOfYear(date) {
  var year = +date.slice(0, 4);
  return Math.round((Date.parse(date) - Date.UTC(year, 0, 1)) / 864e5) + 1;
}

function getCenterLatitude(grid, crs) {
  var x = (grid.bbox[0] + grid.bbox[2]) / 2, y = (grid.bbox[1] + grid.bbox[3]) / 2;
  var p;
  if (!crs) return null;
  if (isLatLngCRS(crs)) return y;
  p = toLngLat([x, y], crs);
  return p && isFinite(p[1]) ? p[1] : null;
}

function getFailureMessage(result, nirUsed) {
  if (result.sun.score <= -1) {
    return 'The DEM casts no shadows at any sun position; the image is unchanged';
  }
  if (result.sun.score < MIN_SUN_FIT) {
    return 'The DEM\'s shadows don\'t match the image\'s dark areas at any sun position (best match ' +
      result.sun.score.toFixed(2) + '); the image is unchanged';
  }
  if (result.lowSun) {
    return 'The best match is with the sun at the lowest altitude tried (' + MIN_ALTITUDE +
      '°), which usually means dark slopes facing away from the sun (e.g. forest) matched' +
      ' better than shadows, or that the image has few terrain shadows (e.g. summer' +
      ' imagery, with the sun high). The image is unchanged';
  }
  if (result.shadowShare === 0) {
    return 'No terrain shadows were found; the image is unchanged';
  }
  if (result.maskRatio > MAX_MASK_RATIO && result.coarseDem) {
    return 'The dark areas near the DEM\'s shadows cover ' + formatPercent(result.shadowShare) +
      ' of the image, ' + result.maskRatio.toFixed(1) + ' times as much as the shadows. The DEM is' +
      ' less detailed than the image, so it is probably missing many of the cliffs and ledges that' +
      ' cast them; try a more detailed DEM (e.g. -fetch 3dep-1m, in the US). The image is unchanged';
  }
  if (result.maskRatio > MAX_MASK_RATIO) {
    return 'The dark areas near the DEM\'s shadows cover ' + formatPercent(result.shadowShare) +
      ' of the image, much more than the shadows, so they are probably mostly something else' +
      ' (e.g. forest' + (nirUsed ? ')' : '; nir= can tell them apart)') + '. The image is unchanged';
  }
  if (result.gains) {
    return 'The dark areas near the DEM\'s shadows aren\'t colored like shadows (brightening them would take ' +
      result.gains[0].toFixed(1) + 'x red and ' + result.gains[2].toFixed(1) + 'x blue; shadows, lit by the' +
      ' blue sky, need more red), so they are probably mostly something else (e.g. forest' +
      (nirUsed ? ')' : '; nir= can tell them apart)') + '. The image is unchanged';
  }
  return 'There isn\'t enough sunlit ground next to the shadows to measure their color; the image is unchanged';
}

// The grids are combined cell by cell, so both need the same coordinates
function requireMatchingCRS(a, b, optName) {
  if (a && b && (isLatLngCRS(a) != isLatLngCRS(b) || !isLatLngCRS(a) && crsTransformsDiffer(a, b))) {
    stop(optName + ' uses a different coordinate system than the image. Use -proj to match them');
  }
}

// Elevations in meters on a grid aligned with the image, with whole image
// pixels per cell, and extending beyond the image where the DEM does
function getTerrainGrid(demGrid, grid, pixelW, pixelH) {
  var pixelSize = Math.sqrt(pixelW * pixelH);
  var factor = Math.max(1, Math.round(TERRAIN_CELL / pixelSize));
  var bbox = grid.bbox, db = demGrid.bbox;
  var unitX = (bbox[2] - bbox[0]) / grid.width, unitY = (bbox[3] - bbox[1]) / grid.height;
  var unitMeters = getElevationUnitMeters(demGrid);
  var margin, cw, ch, x0, y0, x1, y1, Z, i;
  if (db[0] >= bbox[2] || db[2] <= bbox[0] || db[1] >= bbox[3] || db[3] <= bbox[1]) return null;
  margin = Math.min(MAX_MARGIN, getRelief(demGrid) * unitMeters / Math.tan(MIN_SHADOW_ALTITUDE * Math.PI / 180));
  while (true) {
    cw = factor * unitX;
    ch = factor * unitY;
    // cells beyond the image, on each side, up to the DEM's edge
    x0 = Math.max(0, Math.min(Math.ceil(margin / (pixelW * factor)), Math.ceil((bbox[0] - db[0]) / cw)));
    x1 = Math.max(0, Math.min(Math.ceil(margin / (pixelW * factor)), Math.ceil((db[2] - bbox[2]) / cw)));
    y0 = Math.max(0, Math.min(Math.ceil(margin / (pixelH * factor)), Math.ceil((db[3] - bbox[3]) / ch)));
    y1 = Math.max(0, Math.min(Math.ceil(margin / (pixelH * factor)), Math.ceil((bbox[1] - db[1]) / ch)));
    if ((x0 + x1 + Math.ceil(grid.width / factor)) * (y0 + y1 + Math.ceil(grid.height / factor)) <= MAX_TERRAIN_CELLS) break;
    factor++;
  }
  var width = x0 + x1 + Math.ceil(grid.width / factor);
  var height = y0 + y1 + Math.ceil(grid.height / factor);
  var xmin = bbox[0] - x0 * cw, ymax = bbox[3] + y0 * ch;
  Z = resampleGridBand(demGrid, 0, width, height, [xmin, ymax - height * ch, xmin + width * cw, ymax]);
  if (unitMeters != 1) for (i = 0; i < Z.length; i++) Z[i] *= unitMeters;
  return {Z: Z, width: width, height: height, factor: factor, x0: x0, y0: y0,
    cellWidth: pixelW * factor, cellHeight: pixelH * factor};
}

function getRelief(grid) {
  var min = Infinity, max = -Infinity, n = grid.width * grid.height, i, v;
  for (i = 0; i < n; i++) {
    v = grid.samples[i * grid.bands];
    if (v === grid.nodata || v !== v) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max > min ? max - min : 0;
}

// A raster in unknown units is taken to be in meters, as most DEMs are
function getElevationUnitMeters(grid) {
  var meters = getVerticalUnitMeters(grid.verticalUnits);
  if (grid.verticalUnits && !meters) {
    warnOnce('Unknown elevation units (' + grid.verticalUnits + '); assuming meters');
  }
  return meters || 1;
}

// The first band (near-infrared in -fetch naip-cir), on the image's grid
function readNirBand(nirGrid, grid) {
  return resampleGridBand(nirGrid, 0, grid.width, grid.height, grid.bbox);
}

function formatDegrees(rad) {
  return Math.round(rad * 180 / Math.PI) + '°';
}

function formatPercent(share) {
  return (share * 100 < 10 ? (share * 100).toFixed(1) : Math.round(share * 100)) + '%';
}
