import { compileRasterCalcExpression } from '../join/mapshaper-raster-calc';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { requireBooleanResult } from '../expressions/mapshaper-expression-utils';
import { getShapePixelMask } from '../rasters/mapshaper-raster-mask';
import { getShapePixelCoverage } from '../rasters/mapshaper-raster-coverage';
import {
  getRasterGrid,
  getRasterCrop,
  intersectBboxes,
  rasterGridIsRotated
} from '../rasters/mapshaper-raster-utils';
import { rasterPixelIsCovered } from '../rasters/mapshaper-raster-grid';
import { DataTable } from '../datatable/mapshaper-data-table';
import { message, warn, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

var UNSUPPORTED_OPTIONS = ['keys', 'fields', 'prefix', 'interpolate', 'duplication',
  'sum_fields', 'largest_overlap', 'min_overlap_pct', 'min_overlap_area',
  'max_distance', 'unjoined'];

// Joins the pixels of a raster layer to the polygons of @targetLyr, using a
// calc= expression to aggregate the band values of each polygon's pixels.
// By default, each pixel that overlaps a polygon is weighted by the fraction
// of its area inside the polygon (see compileRasterCalcExpression()); with
// opts.point_method, a pixel is joined to the polygons that contain its
// center, with a weight of 1. The weight is also available to expressions as
// "coverage", e.g. where='coverage > 0.5'.
// Nodata is tested band by band: a band value equal to the nodata value is
// NaN in expressions, so aggregate functions skip it, and a pixel is skipped
// when every band is nodata.
export function joinRasterToPolygons(targetLyr, targetDataset, src, opts) {
  var grid = getRasterGrid(src.layer.raster);
  var arcs = targetDataset.arcs;
  var shapes = targetLyr.shapes || [];
  var bandNames, pixelRec, pixelLyr, calc, filter, used;
  var destTable, destRecords, unmatchedRecords = [];
  var matchCount = 0, retn = {};

  validateRasterJoin(targetLyr, grid, opts);
  bandNames = getRasterBandNames(grid);
  validateBandReferences(src, bandNames, opts);
  warnIfReducedResolution(src.layer);
  if (!targetLyr.data) {
    targetLyr.data = new DataTable(shapes.length);
  }
  destTable = targetLyr.data;
  destRecords = destTable.getRecords();
  pixelRec = initPixelRecord(bandNames);
  pixelLyr = {name: src.layer.name, data: new DataTable([pixelRec])};
  calc = compileRasterCalcExpression(opts.calc, pixelLyr, !!opts.point_method);
  if (opts.where) {
    filter = compilePixelFilter(opts.where, pixelLyr);
  }
  used = new Uint8Array(grid.width * grid.height);

  destTable.captureTableBefore({operation: 'join', calc: true});
  shapes.forEach(function(shp, i) {
    var destRec = destRecords[i] || (destRecords[i] = {});
    var count = forEachPixelInShape(grid, shp, arcs, !!opts.point_method, function(pixelId, weight) {
      if (!rasterPixelIsCovered(grid, pixelId)) return false;
      if (!readPixel(grid, pixelId, bandNames, pixelRec)) return false;
      pixelRec.coverage = weight;
      if (filter && !filter(destRec)) return false;
      calc.addPixel(weight);
      used[pixelId] = 1;
      return true;
    });
    calc.finish(destRec);
    if (count > 0) {
      matchCount++;
    } else if (opts.unmatched) {
      unmatchedRecords.push(utils.extend({}, destRec));
    }
  });
  destTable.markChanged({operation: 'join', calc: true});

  if (opts.show_join_message) {
    printRasterJoinMessage(matchCount, shapes.length, countUsedPixels(used), countValidPixels(grid), opts);
  }
  if (opts.unmatched) {
    retn.unmatched = {
      name: 'unmatched',
      data: new DataTable(unmatchedRecords)
    };
  }
  return retn;
}

function validateRasterJoin(targetLyr, grid, opts) {
  var unsupported = UNSUPPORTED_OPTIONS.filter(function(name) {
    return opts[name] !== undefined && opts[name] !== null;
  });
  if (unsupported.length > 0) {
    stop('Unsupported option' + utils.pluralSuffix(unsupported.length) + ' for joining a raster:',
      unsupported.map(function(name) { return name.replace(/_/g, '-'); }).join(', '));
  }
  if (targetLyr.geometry_type != 'polygon') {
    stop('A raster can only be joined to a polygon layer');
  }
  if (!opts.calc) {
    stop('Joining a raster requires a calc= expression, e.g. calc=\'total = sum(band1)\'');
  }
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing pixel data');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Joining a rotated or skewed raster is not supported');
  }
}

// A raster read from a file named in the -join command is imported at full
// resolution, but a layer imported earlier may have been reduced. Its values
// are then averages (or samples) of the source pixels, and sums of counts
// like population come out too small.
function warnIfReducedResolution(rasterLyr) {
  var info = rasterLyr.raster.reducedResolution;
  if (!info) return;
  warn(utils.format('Raster layer [%s] was imported at reduced resolution (%dx%d, source: %dx%d), so joined values may not match the source data. ' +
    'Import it with resolution=full, or name the file in the -join command.',
    rasterLyr.name || '', info.width, info.height, info.sourceWidth, info.sourceHeight));
}

// Band variables are named after the bands of the source file (band1 is the
// first band), which can differ from their order in the grid.
export function getRasterBandNames(grid) {
  var names = [];
  for (var i = 0; i < grid.bands; i++) {
    names.push('band' + ((grid.sampleBands ? grid.sampleBands[i] : i) + 1));
  }
  return names;
}

function initPixelRecord(bandNames) {
  var rec = {};
  bandNames.forEach(function(name) {
    rec[name] = null;
  });
  rec.coverage = null;
  return rec;
}

// A layer in the catalog holds only the bands used for display (1, 3 or 4),
// so an expression can name a band that the file has but the layer doesn't.
function validateBandReferences(src, bandNames, opts) {
  var refs = findBandReferences(opts.calc).concat(findBandReferences(opts.where));
  var missing = refs.filter(function(name) { return !bandNames.includes(name); });
  var fileBands = getSourceBandCount(src);
  var name, available;
  if (missing.length === 0) return;
  name = missing[0];
  available = 'available: ' + bandNames.join(', ');
  if (fileBands > 0 && +name.slice(4) > fileBands) {
    stop(utils.format('The raster has no %s (%s)', name, available));
  }
  if (fileBands > bandNames.length) {
    stop(utils.format('Raster layer [%s] was imported with %d of the file\'s %d bands, so %s is unavailable (%s). ' +
      'To join every band, name the file in the -join command.',
      src.layer.name || '', bandNames.length, fileBands, name, available));
  }
  stop(utils.format('The raster has no %s (%s)', name, available));
}

function findBandReferences(exp) {
  var names = [];
  String(exp || '').replace(/\bband([1-9][0-9]*)\b/g, function(match) {
    if (!names.includes(match)) names.push(match);
    return match;
  });
  return names;
}

// Number of bands in the source file, or 0 if unknown
function getSourceBandCount(src) {
  var sourceId = src.layer.raster.sourceId;
  var sources = src.dataset && src.dataset.info && src.dataset.info.raster_sources || [];
  var info = sources.find(function(o) { return o.id == sourceId; });
  return info && info.bands > 0 ? info.bands : 0;
}

// Copies the band values of a pixel into @rec. A value that equals the nodata
// value or is NaN (which some float rasters use as nodata) is copied as NaN.
// Returns false if every band is nodata.
function readPixel(grid, pixelId, bandNames, rec) {
  var offset = pixelId * grid.bands;
  var hasData = false;
  var val;
  for (var i = 0; i < bandNames.length; i++) {
    val = grid.samples[offset + i];
    if (sampleIsNodata(val, grid.nodata)) {
      val = NaN;
    } else {
      hasData = true;
    }
    rec[bandNames[i]] = val;
  }
  return hasData;
}

function pixelHasData(grid, pixelId) {
  var offset = pixelId * grid.bands;
  for (var i = 0; i < grid.bands; i++) {
    if (!sampleIsNodata(grid.samples[offset + i], grid.nodata)) return true;
  }
  return false;
}

function sampleIsNodata(val, nodata) {
  return val !== val || nodata !== null && nodata !== undefined && val == nodata;
}

function compilePixelFilter(exp, pixelLyr) {
  var destRec = null;
  var context = {};
  // 'target' is an accessor, as in getJoinFilter(), so the target record can
  // be updated
  Object.defineProperty(context, 'target', {
    get: function() { return destRec; },
    enumerable: true
  });
  var test = compileFeatureExpression(exp, pixelLyr, null, {context: context});
  return function(rec) {
    var retn;
    destRec = rec;
    retn = test(0);
    requireBooleanResult(retn, '"where" expression must return true or false');
    return retn;
  };
}

// Calls @cb(pixelId, weight) for each pixel of @grid that overlaps polygon
// @shp, with the fraction of the pixel inside the polygon as its weight. With
// @pixelCenters, calls @cb(pixelId, 1) for each pixel whose center is inside
// the polygon. Returns the number of calls that returned true.
export function forEachPixelInShape(grid, shp, arcs, pixelCenters, cb) {
  var bbox, win, weights, weight, i, x, y, count = 0;
  if (!shp || shp.length === 0) return 0;
  bbox = intersectBboxes(grid.bbox, arcs.getMultiShapeBounds(shp).toArray());
  if (!bbox) return 0;
  win = getRasterCrop(grid, bbox);
  if (win.width === 0 || win.height === 0) return 0;
  weights = pixelCenters ? getShapePixelMask(grid, shp, arcs, win) :
    getShapePixelCoverage(grid, shp, arcs, win);
  for (y = 0; y < win.height; y++) {
    for (x = 0; x < win.width; x++) {
      i = y * win.width + x;
      weight = weights[i];
      if (weight > 0 && cb((win.y + y) * grid.width + win.x + x, weight)) {
        count++;
      }
    }
  }
  return count;
}

function countUsedPixels(used) {
  return countNonzero(used);
}

function countValidPixels(grid) {
  var n = grid.width * grid.height;
  var count = 0;
  for (var i = 0; i < n; i++) {
    if (rasterPixelIsCovered(grid, i) && pixelHasData(grid, i)) count++;
  }
  return count;
}

function countNonzero(arr) {
  var count = 0;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i]) count++;
  }
  return count;
}

// e.g. Join: 850/1,000 targets matched (85%), 12,345/20,000 pixels used (62%)
function printRasterJoinMessage(matches, n, usedPixels, validPixels, opts) {
  var msg;
  if (matches === 0) {
    warn(utils.format("Join: 0/%'d targets matched (no pixel%s the target polygons)", n,
      opts.point_method ? ' centers are inside' : 's overlap'));
    return;
  }
  msg = utils.format('Join: %s, %s', formatRatio(matches, n, 'target', 'matched'),
    formatRatio(usedPixels, validPixels, 'pixel', 'used'));
  if (matches < n && !opts.unmatched) {
    msg += '\n  Add the unmatched flag to keep unmatched targets as a separate layer';
  }
  message(msg);
}

function formatRatio(num, total, noun, verb) {
  var s = utils.format("%'d/%'d %s%s %s", num, total, noun, utils.pluralSuffix(total), verb);
  if (num < total) {
    s += ' (' + Math.round(100 * num / total) + '%)';
  }
  return s;
}
