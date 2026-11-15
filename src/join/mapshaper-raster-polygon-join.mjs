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
import { DataTable } from '../datatable/mapshaper-data-table';
import { isLatLngDataset } from '../crs/mapshaper-projections';
import { message, warn, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

var PIXELS_PER_ROW_BAND = 1 << 22;
var pixelsPerRowBand = PIXELS_PER_ROW_BAND;
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
// when every band that the expressions use is nodata.
// The source has the bands the expressions use, at full resolution (see
// getRasterSourceBands(), called with getRasterJoinBands()).
// Pixels are visited a band of rows at a time, from the top, so that a raster
// left in its file (raster.rowReader) is read a block of rows at a time, and
// only where the targets are. Each target's aggregates are carried from one
// band of rows to the next, and its pixels are visited in the same order as
// in a single pass over the target.
export async function joinRasterToPolygons(targetLyr, targetDataset, src, opts) {
  var raster = src.layer.raster;
  var grid = getRasterGrid(raster);
  var arcs = targetDataset.arcs;
  var shapes = targetLyr.shapes || [];
  var pixelCenters = !!opts.point_method;
  var bandNames, usedBands, pixelRec, pixelLyr, calc, filter, windows, states, counts;
  var destTable, destRecords, stats, retn = {};
  var unmatchedRecords = [];
  var matchCount = 0;

  validateRasterJoin(targetLyr, raster, grid, opts);
  bandNames = getRasterBandNames(grid);
  validateBandReferences(bandNames, opts);
  if (isLatLngDataset(src.dataset)) {
    warnAboutLatLngPixelAreas(opts.calc);
  }
  usedBands = getRasterJoinBands(opts).map(function(b) {
    return bandNames.indexOf('band' + (b + 1));
  });
  if (!targetLyr.data) {
    targetLyr.data = new DataTable(shapes.length);
  }
  destTable = targetLyr.data;
  destRecords = destTable.getRecords();
  pixelRec = initPixelRecord(bandNames);
  pixelLyr = {name: src.layer.name, data: new DataTable([pixelRec])};
  calc = compileRasterCalcExpression(opts.calc, pixelLyr, pixelCenters);
  if (opts.where) {
    filter = compilePixelFilter(opts.where, pixelLyr);
  }
  windows = shapes.map(function(shp) { return getShapeWindow(grid, shp, arcs); });
  states = new Array(shapes.length); // aggregates of the targets in progress
  counts = new Uint32Array(shapes.length);

  destTable.captureTableBefore({operation: 'join', calc: true});
  windows.forEach(function(win, i) {
    if (!win) finishTarget(i);
  });
  stats = await forEachRowBand(raster, grid, windows, usedBands, function(block, y0, y1, active) {
    active.forEach(function(i) {
      joinTargetRows(i, block, y0, y1);
      if (windows[i].y + windows[i].height <= y1) finishTarget(i);
    });
  });
  destTable.markChanged({operation: 'join', calc: true});

  shapes.forEach(function(shp, i) {
    if (counts[i] > 0) {
      matchCount++;
    } else if (opts.unmatched) {
      unmatchedRecords.push(utils.extend({}, destRecords[i]));
    }
  });
  if (opts.show_join_message) {
    printRasterJoinMessage(matchCount, shapes.length, stats, opts);
  }
  if (opts.unmatched) {
    retn.unmatched = {
      name: 'unmatched',
      data: new DataTable(unmatchedRecords)
    };
  }
  return retn;

  // Adds the pixels of target @i in rows [y0, y1) to its aggregates
  function joinTargetRows(i, block, y0, y1) {
    var win = windows[i];
    var top = Math.max(win.y, y0);
    var rows = {x: win.x, y: top, width: win.width, height: Math.min(win.y + win.height, y1) - top};
    var weights = getShapePixelWeights(grid, shapes[i], arcs, pixelCenters, rows);
    var destRec = destRecords[i] || (destRecords[i] = {});
    var samples = block.samples, coverage = block.coverage, used = block.used;
    var count = 0;
    var x, y, k, weight;
    calc.setState(states[i]);
    for (y = 0; y < rows.height; y++) {
      k = (rows.y + y - block.rowStart) * grid.width + rows.x;
      for (x = 0; x < rows.width; x++, k++) {
        weight = weights[y * rows.width + x];
        if (!(weight > 0) || coverage && !(coverage[k] > 0) ||
            !pixelHasData(samples, grid, k, usedBands)) continue;
        readPixel(samples, grid, k, bandNames, pixelRec);
        pixelRec.coverage = weight;
        if (filter && !filter(destRec)) continue;
        calc.addPixel(weight);
        used[k] = 1;
        count++;
      }
    }
    counts[i] += count;
    states[i] = calc.getState();
  }

  function finishTarget(i) {
    calc.setState(states[i]);
    calc.finish(destRecords[i] || (destRecords[i] = {}));
    states[i] = null;
  }
}

function validateRasterJoin(targetLyr, raster, grid, opts) {
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
  if (!grid || !grid.samples && !raster.rowReader || !grid.bbox) {
    stop('Raster layer is missing pixel data');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Joining a rotated or skewed raster is not supported');
  }
}

// The pixels of a lat/long raster cover less ground toward the poles, but the
// aggregates that average pixels weight them only by their coverage. Pixel
// areas are deliberately not corrected.
function warnAboutLatLngPixelAreas(calc) {
  var names = String(calc).match(/\b(average|mean|median|quantile|iqr|quartile[123]|mode)\s*\(/g);
  if (!names) return;
  names = utils.uniq(names.map(function(str) { return str.replace(/[\s(]/g, '') + '()'; }));
  warn(utils.format('Pixel areas in a lat/long raster shrink toward the poles, but %s %s ' +
    'all pixels equally. To calculate a density, divide sum() by polygon area, ' +
    'e.g. -each \'density = pop / (this.area / 1e6)\'.', names.join(', '),
    names.length > 1 ? 'weight' : 'weights'));
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

// Each band has to have been read (see getRasterSourceBands()), so a missing
// band is one the file doesn't have
function validateBandReferences(bandNames, opts) {
  var missing = getRasterJoinBands(opts).map(function(b) { return 'band' + (b + 1); })
    .filter(function(name) { return !bandNames.includes(name); });
  if (missing.length > 0) {
    stop(utils.format('The raster has no %s (available: %s)', missing[0], bandNames.join(', ')));
  }
}

// The bands named in the calc= and where= expressions of a raster join, as
// 0-based indexes, or band1 if they name none (e.g. calc='n = count()'), so
// that there is a band for testing whether pixels have data.
export function getRasterJoinBands(opts) {
  var bands = [];
  [opts.calc, opts.where].forEach(function(exp) {
    String(exp || '').replace(/\bband([1-9][0-9]*)\b/g, function(match, num) {
      if (!bands.includes(num - 1)) bands.push(num - 1);
      return match;
    });
  });
  return bands.length > 0 ? bands.sort(function(a, b) { return a - b; }) : [0];
}

// Copies the band values of pixel @k of @samples into @rec. A value that
// equals the nodata value or is NaN (which some float rasters use as nodata)
// is copied as NaN.
function readPixel(samples, grid, k, bandNames, rec) {
  var offset = k * grid.bands;
  var val;
  for (var i = 0; i < bandNames.length; i++) {
    val = samples[offset + i];
    rec[bandNames[i]] = sampleIsNodata(val, grid.nodata) ? NaN : val;
  }
}

// False if every band in @usedBands (grid band indexes) of pixel @k is nodata
function pixelHasData(samples, grid, k, usedBands) {
  var offset = k * grid.bands;
  for (var i = 0; i < usedBands.length; i++) {
    if (!sampleIsNodata(samples[offset + usedBands[i]], grid.nodata)) return true;
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

// The window of pixels of @grid under the bounding box of polygon @shp (see
// getRasterCrop()), or null if there are none
function getShapeWindow(grid, shp, arcs) {
  var bbox, win;
  if (!shp || shp.length === 0) return null;
  bbox = intersectBboxes(grid.bbox, arcs.getMultiShapeBounds(shp).toArray());
  if (!bbox) return null;
  win = getRasterCrop(grid, bbox);
  return win.width > 0 && win.height > 0 ? win : null;
}

// The weight of each pixel in window @win of @grid, in row-major order: the
// fraction of the pixel inside polygon @shp, or with @pixelCenters, 1 if the
// pixel's center is inside the polygon, else 0. A pixel gets the same weight
// in any window that contains it.
function getShapePixelWeights(grid, shp, arcs, pixelCenters, win) {
  return pixelCenters ? getShapePixelMask(grid, shp, arcs, win) :
    getShapePixelCoverage(grid, shp, arcs, win);
}

// Rows of pixels processed together: few enough that a target's coverage
// arrays (24 bytes per pixel of its window) stay small
function getRowsPerBand(grid) {
  return Math.max(1, Math.floor(pixelsPerRowBand / grid.width));
}

// For tests: sets the number of pixels in a band of rows, returning the
// previous number
export function setRasterJoinBandPixels(n) {
  var prev = pixelsPerRowBand;
  pixelsPerRowBand = n || PIXELS_PER_ROW_BAND;
  return prev;
}

// Calls @cb(block, y0, y1, active) for each band of rows [y0, y1) that a
// target window in @windows crosses, from the top, where @active lists the
// targets whose windows cross the band, and @block holds the samples of rows
// [block.rowStart, block.rowEnd), which include the band:
// {rowStart, rowEnd, samples, coverage, used}. The callback sets
// block.used[k] for each pixel that it uses.
// A raster in memory is one block; a raster left in its file is read a block
// of rows at a time (raster.rowReader), skipping blocks that no target
// crosses. Returns pixel counts for printRasterJoinMessage().
async function forEachRowBand(raster, grid, windows, usedBands, cb) {
  var reader = raster.rowReader;
  var rowsPerBand = getRowsPerBand(grid);
  var blockRows = reader ? reader.blockHeight * Math.max(1, Math.floor(rowsPerBand / reader.blockHeight)) : grid.height;
  var order = windows.map(function(win, i) { return i; }).filter(function(i) { return !!windows[i]; })
    .sort(function(a, b) { return windows[a].y - windows[b].y; });
  var stats = {used: 0, valid: 0, skippedRows: false};
  var active = [], next = 0;
  var r0, r1, y0, y1, block;
  if (!reader) {
    stats.valid = countValidPixels(grid.samples, grid.coverage, grid, usedBands, grid.width * grid.height);
  }
  for (r0 = 0; r0 < grid.height; r0 = r1) {
    r1 = Math.min(grid.height, r0 + blockRows);
    if (active.length === 0 && (next == order.length || windows[order[next]].y >= r1)) {
      stats.skippedRows = stats.skippedRows || !!reader;
      continue;
    }
    block = {
      rowStart: r0,
      rowEnd: r1,
      samples: reader ? await reader.readRows(r0, r1) : grid.samples,
      coverage: reader ? null : grid.coverage,
      used: new Uint8Array(grid.width * (r1 - r0))
    };
    for (y0 = r0; y0 < r1; y0 = y1) {
      y1 = Math.min(r1, y0 + rowsPerBand);
      while (next < order.length && windows[order[next]].y < y1) {
        active.push(order[next++]);
      }
      if (active.length > 0) cb(block, y0, y1, active);
      active = active.filter(isUnfinished);
    }
    stats.used += countNonzero(block.used);
    if (reader) {
      stats.valid += countValidPixels(block.samples, null, grid, usedBands, block.used.length);
    }
  }
  return stats;

  function isUnfinished(i) {
    return windows[i].y + windows[i].height > y1;
  }
}

function countValidPixels(samples, coverage, grid, usedBands, n) {
  var count = 0;
  var bands = grid.bands, b = usedBands[0];
  var nodata = grid.nodata === null || grid.nodata === undefined ? NaN : grid.nodata;
  var val;
  if (usedBands.length == 1 && !coverage) {
    for (var i = b, end = n * bands; i < end; i += bands) {
      val = samples[i];
      if (val === val && val != nodata) count++;
    }
    return count;
  }
  for (var k = 0; k < n; k++) {
    if ((!coverage || coverage[k] > 0) && pixelHasData(samples, grid, k, usedBands)) count++;
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
// If rows of the raster that no target crosses weren't read, the pixel count
// covers only the rows that were.
function printRasterJoinMessage(matches, n, stats, opts) {
  var msg;
  if (matches === 0) {
    warn(utils.format("Join: 0/%'d targets matched (no pixel%s the target polygons)", n,
      opts.point_method ? ' centers are inside' : 's overlap'));
    return;
  }
  msg = utils.format('Join: %s, %s', formatRatio(matches, n, 'target', 'matched'),
    formatRatio(stats.used, stats.valid, 'pixel', stats.skippedRows ? 'in the rows under the targets used' : 'used'));
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
