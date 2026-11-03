import { applyFieldOrder } from '../datatable/mapshaper-data-utils';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { getDatasetCRS, getProjInfo } from '../crs/mapshaper-projections';
import { getLayerBounds, getFeatureCount, getLayerSourceFile, layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { getRasterBandCount, getRasterHeight, getRasterPixelType, getRasterWidth } from '../rasters/mapshaper-raster-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { formatVerticalUnits } from '../rasters/mapshaper-vertical-units';
import { getHillshadeCellSizes } from './mapshaper-hillshade';
import { getOklchLightnessChroma } from '../rasters/mapshaper-raster-color';
import { expandCommandTargets } from '../dataset/mapshaper-target-utils';
import { writeFiles } from '../io/mapshaper-file-export';
import { runningInBrowser } from '../mapshaper-env';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { message } from '../utils/mapshaper-logging';
import { NodeCollection } from '../topology/mapshaper-nodes';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';

var MAX_RULE_LEN = 50;

cmd.info = function(targets, opts) {
  var layers = expandCommandTargets(targets);
  var arr = layers.map(function(o) {
    return getLayerInfo(o.layer, o.dataset);
  });

  if (opts.save_to) {
    var output = [{
      filename: opts.save_to + (opts.save_to.endsWith('.json') ? '' : '.json'),
      content: JSON.stringify(arr, null, 2)
    }];
    writeFiles(output, opts);
  }
  if (opts.to_layer) {
    return {
      info: {},
      layers: [{
        name: opts.name || 'info',
        data: new DataTable(arr)
      }]
    };
  }
  if (runningInBrowser()) {
    message({
      type: 'mapshaper-console-info',
      layers: arr
    });
  } else {
    message(formatInfo(arr));
  }
};

cmd.printInfo = cmd.info; // old name

export function getLayerInfo(lyr, dataset) {
  var n = getFeatureCount(lyr);
  var o = {
    layer_name: lyr.name,
    geometry_type: lyr.geometry_type,
    feature_count: n,
    null_shape_count: 0,
    null_data_count: lyr.data ? countNullRecords(lyr.data.getRecords()) : n
  };
  if (layerHasRaster(lyr)) {
    o.geometry_type = null;
    o.raster_type = lyr.raster_type;
    o.raster_width = getRasterWidth(lyr.raster);
    o.raster_height = getRasterHeight(lyr.raster);
    o.raster_bands = getRasterBandCount(lyr.raster);
    o.raster_pixel_type = getRasterPixelType(lyr.raster);
    o.bbox = getLayerBounds(lyr, dataset.arcs).toArray();
    o.proj4 = getProjInfo(dataset);
    if (rasterLooksLikeElevation(lyr.raster)) {
      o.elevation = getElevationInfo(lyr.raster.grid, getDatasetCRS(dataset));
    } else if (rasterLooksLikeImage(lyr.raster)) {
      o.image = getImageInfo(lyr.raster.grid);
    }
  }
  if (lyr.shapes && lyr.shapes.length > 0) {
    o.null_shape_count = countNullShapes(lyr.shapes);
    o.bbox = getLayerBounds(lyr, dataset.arcs).toArray();
    o.proj4 = getProjInfo(dataset);
  }
  o.source_file = getLayerSourceFile(lyr, dataset) || null;
  o.attribute_data = getAttributeTableInfo(lyr);
  return o;
}

var ELEVATION_PERCENTILES = [1, 25, 50, 75, 99];
var ELEVATION_SAMPLES = 1e6;
var IMAGE_PERCENTILES = [1, 25, 50, 75, 99];
var IMAGE_CHROMA_PERCENTILES = [50, 99];
var IMAGE_SAMPLES = 1e6;

// Single-band numeric rasters (e.g. GeoTIFF DEMs) and rasters imported with
// raster-type=continuous; 8-bit single-band rasters are usually grayscale images
export function rasterLooksLikeElevation(raster) {
  var grid = raster && raster.grid;
  if (!grid || !grid.samples || raster.interpretation == 'categorical' ||
      grid.colorModel == 'palette') return false;
  if (raster.interpretation == 'continuous') return true;
  return grid.bands == 1 && !/^u?int8$/.test(grid.pixelType || '');
}

// Statistics for the values in the first band of @grid
export function getElevationInfo(grid, crs) {
  var n = grid.width * grid.height;
  var valid = getRasterValidityMask(grid);
  var bands = grid.bands || 1;
  var step = Math.max(1, Math.floor(n / ELEVATION_SAMPLES));
  var sample = [];
  var count = 0, sum = 0, min = Infinity, max = -Infinity;
  var i, val, o;
  for (i = 0; i < n; i++) {
    if (valid && !valid[i]) continue;
    val = grid.samples[i * bands];
    if (!isFinite(val)) continue;
    count++;
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;
    if (i % step === 0) sample.push(val);
  }
  o = {
    units: grid.verticalUnits || null,
    nodata: grid.nodata === undefined ? null : grid.nodata,
    pixel_count: n,
    nodata_count: n - count,
    min: null,
    max: null,
    mean: null,
    percentiles: null,
    pixel_size: crs || grid.horizontalUnitMeters ? getGroundPixelSize(grid, crs) : null
  };
  if (count > 0) {
    sample = Float64Array.from(sample).sort();
    o.min = roundElevation(min);
    o.max = roundElevation(max);
    o.mean = roundElevation(sum / count);
    o.percentiles = ELEVATION_PERCENTILES.reduce(function(memo, pct) {
      memo[pct] = roundElevation(sample[Math.round((sample.length - 1) * pct / 100)]);
      return memo;
    }, {});
  }
  return o;
}

// 8-bit grayscale, RGB and RGBA images (not palette images, or 8-bit rasters
// imported as continuous or categorical data)
export function rasterLooksLikeImage(raster) {
  var grid = raster && raster.grid;
  if (!grid || !grid.samples || raster.interpretation == 'categorical' ||
      raster.interpretation == 'continuous' || grid.colorModel == 'palette') return false;
  return /^uint8$/.test(grid.pixelType || '') && (grid.bands == 1 || grid.bands == 3 || grid.bands == 4);
}

// OKLCH lightness and chroma of the visible pixels of an 8-bit image, from a
// sample of at most IMAGE_SAMPLES pixels
export function getImageInfo(grid) {
  var n = grid.width * grid.height;
  var bands = grid.bands;
  var valid = getRasterValidityMask(grid);
  var step = Math.max(1, Math.floor(n / IMAGE_SAMPLES));
  var lightness = [], chroma = [];
  var lc = [0, 0];
  var transparent = 0, sum = 0;
  var i, j, o;
  for (i = 0; i < n; i++) {
    j = i * bands;
    if (valid && !valid[i] || bands == 4 && grid.samples[j + 3] === 0) {
      transparent++;
      continue;
    }
    if (i % step !== 0) continue;
    if (bands == 1) {
      getOklchLightnessChroma(grid.samples[j], grid.samples[j], grid.samples[j], lc);
    } else {
      getOklchLightnessChroma(grid.samples[j], grid.samples[j + 1], grid.samples[j + 2], lc);
    }
    lightness.push(lc[0]);
    chroma.push(lc[1]);
    sum += lc[0];
  }
  o = {
    pixel_count: n,
    transparent_count: transparent,
    has_alpha: bands == 4 || !!valid,
    lightness: null,
    chroma: null
  };
  if (lightness.length > 0) {
    lightness = Float64Array.from(lightness).sort();
    chroma = Float64Array.from(chroma).sort();
    o.lightness = {
      min: roundImageValue(lightness[0]),
      max: roundImageValue(lightness[lightness.length - 1]),
      mean: roundImageValue(sum / lightness.length),
      percentiles: getSortedPercentiles(lightness, IMAGE_PERCENTILES, roundImageValue)
    };
    o.chroma = bands == 1 ? null : getSortedPercentiles(chroma, IMAGE_CHROMA_PERCENTILES, roundImageValue);
  }
  return o;
}

function getSortedPercentiles(sorted, percentiles, round) {
  return percentiles.reduce(function(memo, pct) {
    memo[pct] = round(sorted[Math.round((sorted.length - 1) * pct / 100)]);
    return memo;
  }, {});
}

function roundImageValue(val) {
  return Math.round(val * 1000) / 1000;
}

function getImageInfoRows(o) {
  var rows = [];
  var fmt = function(val) { return val.toFixed(2); };
  if (o.has_alpha) {
    rows.push(['Transparent', utils.format('%,d', o.transparent_count) +
      (o.transparent_count == 1 ? ' pixel (' : ' pixels (') + formatPercent(o.transparent_count, o.pixel_count) + ')']);
  }
  if (!o.lightness) {
    rows.push(['Lightness', 'no visible pixels']);
    return rows;
  }
  rows.push(['Lightness', fmt(o.lightness.min) + ' to ' + fmt(o.lightness.max) +
    ' (mean ' + fmt(o.lightness.mean) + ', OKLCH 0-1)']);
  rows.push(['Percentiles', IMAGE_PERCENTILES.map(function(pct) {
    return pct + '%: ' + fmt(o.lightness.percentiles[pct]);
  }).join(' | ')]);
  if (o.chroma) {
    rows.push(['Chroma', IMAGE_CHROMA_PERCENTILES.map(function(pct) {
      return (pct == 50 ? 'median ' : pct + '%: ') + o.chroma[pct].toFixed(3);
    }).join(' | ') + ' (OKLCH; 0 is gray)']);
  }
  return rows;
}

// Median ground width and height of a pixel, in meters
function getGroundPixelSize(grid, crs) {
  var cells = getHillshadeCellSizes(grid, crs);
  var heights = Float64Array.from(cells.heights).sort();
  var size = [cells.median, heights[Math.floor(heights.length / 2)]];
  return size.every(isFinite) ? size.map(function(m) { return +m.toPrecision(4); }) : null;
}

function roundElevation(val) {
  return Math.round(val * 1000) / 1000;
}

// Decimal places to show, based on the range of values
function getElevationDecimals(o) {
  var span = o.max - o.min;
  return span >= 100 ? 0 : span >= 1 ? 1 : 3;
}

function formatElevation(val, decimals) {
  return (+val.toFixed(decimals) || 0).toLocaleString('en-US', {maximumFractionDigits: decimals});
}

function formatPercent(n, total) {
  var pct = n / total * 100;
  return (pct > 0 && pct < 0.1 ? '<0.1' : +pct.toFixed(1)) + '%';
}

function formatGroundPixelSize(size) {
  var w = size[0], h = size[1];
  var fmt = function(m) { return m >= 100 ? String(Math.round(m)) : String(+m.toFixed(1)); };
  return (Math.abs(w - h) / Math.max(w, h) < 0.02 ? fmt(w) : fmt(w) + ' x ' + fmt(h)) + ' m';
}

function getElevationInfoRows(o) {
  var rows = [];
  var decimals, units;
  if (o.nodata !== null || o.nodata_count > 0) {
    rows.push(['Nodata', (o.nodata === null ? 'none' : String(o.nodata)) + ' (' +
      utils.format('%,d', o.nodata_count) + (o.nodata_count == 1 ? ' pixel, ' : ' pixels, ') + formatPercent(o.nodata_count, o.pixel_count) + ')']);
  }
  if (o.min === null) {
    rows.push(['Elevation', 'no valid pixels']);
  } else {
    decimals = getElevationDecimals(o);
    units = o.units ? ' ' + formatVerticalUnits(o.units) : '';
    rows.push(['Elevation', formatElevation(o.min, decimals) + ' to ' + formatElevation(o.max, decimals) +
      units + ' (mean ' + formatElevation(o.mean, decimals) + ')']);
    rows.push(['Percentiles', ELEVATION_PERCENTILES.map(function(pct) {
      return pct + '%: ' + formatElevation(o.percentiles[pct], decimals);
    }).join(' | ')]);
  }
  if (o.pixel_size) {
    rows.push(['Pixel size', formatGroundPixelSize(o.pixel_size)]);
  }
  return rows;
}

// [label, value] rows summarizing a layer, shared by the CLI and the GUI
export function getLayerInfoRows(info) {
  var rows = [
    ['Type', info.raster_type ? 'raster data' : info.geometry_type || 'tabular data']
  ];
  if (info.raster_type) {
    rows.push(['Size', utils.format('%,d x %,d x %,d', info.raster_width, info.raster_height, info.raster_bands)]);
    rows.push(['Data', info.raster_pixel_type || 'unknown']);
    if (info.elevation) {
      rows = rows.concat(getElevationInfoRows(info.elevation));
    } else if (info.image) {
      rows = rows.concat(getImageInfoRows(info.image));
    }
  } else {
    rows.push(['Records', utils.format('%,d', info.feature_count)]);
  }
  if (info.null_shape_count > 0) {
    rows.push(['Nulls', utils.format("%'d", info.null_shape_count)]);
  }
  if (info.raster_type || info.geometry_type && info.feature_count > info.null_shape_count) {
    rows.push(['Bounds', info.bbox.join(',')]);
    rows.push(['CRS', info.proj4]);
  }
  rows.push(['Source', info.source_file || 'n/a']);
  return rows;
}

// i: (optional) record index
export function getAttributeTableInfo(lyr, i) {
  if (!lyr.data || lyr.data.size() === 0 || lyr.data.getFields().length === 0) {
    return null;
  }
  var fields = applyFieldOrder(lyr.data.getFields(), 'ascending');
  var valueName = i === undefined ? 'first_value' : 'value';
  return fields.map(function(fname) {
    return {
      field: fname,
      [valueName]: lyr.data.getReadOnlyRecordAt(i || 0)[fname]
    };
  });
}

function formatInfo(arr) {
  var str = '';
  arr.forEach(function(info, i) {
    var title =  'Layer:    ' + (info.layer_name || '[unnamed layer]');
    var tableStr = info.raster_type ? '' : formatAttributeTableInfo(info.attribute_data);
    var tableWidth = measureLongestLine(tableStr);
    var ruleLen = Math.min(Math.max(title.length, tableWidth), MAX_RULE_LEN);
    str += '\n';
    str += utils.lpad('', ruleLen, '=') + '\n';
    str += title + '\n';
    str += utils.lpad('', ruleLen, '-') + '\n';
    str += formatLayerInfo(info);
    str += tableStr;
  });
  return str;
}

function formatLayerInfo(data) {
  var rows = getLayerInfoRows(data);
  var labelLen = rows.reduce(function(memo, row) {
    return Math.max(memo, row[0].length + 2);
  }, 10);
  return rows.map(function(row) {
    return utils.rpad(row[0] + ':', labelLen, ' ') + row[1] + '\n';
  }).join('');
}

export function formatAttributeTableInfo(arr) {
  if (!arr) return "Attribute data: [none]\n";
  var header = "\nAttribute data\n";
  var valKey = 'first_value' in arr[0] ? 'first_value' : 'value';
  var vals = [];
  var fields = [];
  arr.forEach(function(o) {
    fields.push(o.field);
    vals.push(o[valKey]);
  });
  var maxIntegralChars = vals.reduce(function(max, val) {
    if (utils.isNumber(val)) {
      max = Math.max(max, countIntegralChars(val));
    }
    return max;
  }, 0);
  var col1Arr = ['Field'].concat(fields);
  var col2Arr = vals.reduce(function(memo, val) {
    memo.push(formatTableValue(val, maxIntegralChars));
    return memo;
  }, [valKey == 'first_value' ? 'First value' : 'Value']);
  var col1Chars = maxChars(col1Arr);
  var col2Chars = maxChars(col2Arr);
  var sepStr = (utils.rpad('', col1Chars + 2, '-') + '+' +
      utils.rpad('', col2Chars + 2, '-')).substr(0, MAX_RULE_LEN);
  var sepLine = sepStr + '\n';
  var table = '';
  col1Arr.forEach(function(col1, i) {
    var w = stringDisplayWidth(col1);
    table += ' ' + col1 + utils.rpad('', col1Chars - w, ' ') + ' | ' +
      col2Arr[i] + '\n';
    if (i === 0) table += sepLine; // separator after first line
  });
  return header + sepLine + table + sepLine;
}

function measureLongestLine(str) {
  return Math.max.apply(null, str.split('\n').map(function(line) {return stringDisplayWidth(line);}));
}

function stringDisplayWidth(str) {
  var w = 0;
  for (var i = 0, n=str.length; i < n; i++) {
    w += charDisplayWidth(str.charCodeAt(i));
  }
  return w;
}

// see https://www.cl.cam.ac.uk/~mgk25/ucs/wcwidth.c
// this is a simplified version, focusing on double-width CJK chars and ignoring nonprinting etc chars
function charDisplayWidth(c) {
  if (c >= 0x1100 &&
    (c <= 0x115f || c == 0x2329 || c == 0x232a ||
    (c >= 0x2e80 && c <= 0xa4cf && c != 0x303f) || /* CJK ... Yi */
    (c >= 0xac00 && c <= 0xd7a3) || /* Hangul Syllables */
    (c >= 0xf900 && c <= 0xfaff) || /* CJK Compatibility Ideographs */
    (c >= 0xfe10 && c <= 0xfe19) || /* Vertical forms */
    (c >= 0xfe30 && c <= 0xfe6f) || /* CJK Compatibility Forms */
    (c >= 0xff00 && c <= 0xff60) || /* Fullwidth Forms */
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x20000 && c <= 0x2fffd) ||
    (c >= 0x30000 && c <= 0x3fffd))) return 2;
  return 1;
}

// TODO: consider polygons with zero area or other invalid geometries
function countNullShapes(shapes) {
  var count = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!shapes[i] || shapes[i].length === 0) count++;
  }
  return count;
}

function countNullRecords(records) {
  var count = 0;
  for (var i=0; i<records.length; i++) {
    if (!records[i]) count++;
  }
  return count;
}

function countRings(shapes, arcs) {
  var holes = 0, rings = 0;
  editShapes(shapes, function(ids) {
    var area = geom.getPlanarPathArea(ids, arcs);
    if (area > 0) rings++;
    if (area < 0) holes++;
  });
  return {rings: rings, holes: holes};
}

function maxChars(arr) {
  return arr.reduce(function(memo, str) {
    var w = stringDisplayWidth(str);
    return w > memo ? w : memo;
  }, 0);
}

function formatString(str) {
  var replacements = {
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t'
  };
  var cleanChar = function(c) {
    // convert newlines and carriage returns
    // TODO: better handling of non-printing chars
    return c in replacements ? replacements[c] : '';
  };
  str = str.replace(/[\r\t\n]/g, cleanChar);
  return "'" + str + "'";
}

function countIntegralChars(val) {
  return utils.isNumber(val) ? (utils.formatNumber(val) + '.').indexOf('.') : 0;
}

export function formatTableValue(val, integralChars) {
  var str;
  if (utils.isNumber(val)) {
    str = utils.lpad("", integralChars - countIntegralChars(val), ' ') +
      utils.formatNumber(val);
  } else if (utils.isString(val)) {
    str = formatString(val);
  } else if (utils.isDate(val)) {
    str = utils.formatDateISO(val) + ' (Date)';
  } else if (utils.isObject(val)) { // if {} or [], display JSON
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }

  if (typeof str != 'string') {
    // e.g. JSON.stringify converts functions to undefined
    str = '[' + (typeof val) + ']';
  }

  return str;
}

function getSimplificationInfo(arcs) {
  var nodeCount = new NodeCollection(arcs).size();
  // get count of non-node vertices
  var internalVertexCount = countInteriorVertices(arcs);
}

function countInteriorVertices(arcs) {
  var count = 0;
  arcs.forEach2(function(arcId, i, n) {
    if (n > 2) {
      count += n - 2;
    }
  });
  return count;
}
