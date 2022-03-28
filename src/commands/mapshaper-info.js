import { applyFieldOrder } from '../datatable/mapshaper-data-utils';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { getProjInfo } from '../crs/mapshaper-projections';
import { getLayerBounds, getFeatureCount, getLayerSourceFile } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { message } from '../utils/mapshaper-logging';
import { NodeCollection } from '../topology/mapshaper-nodes';
import cmd from '../mapshaper-cmd';

var MAX_RULE_LEN = 50;

cmd.printInfo = function(layers) {
  var str = '';
  layers.forEach(function(o, i) {
    var title =  'Layer:    ' + (o.layer.name || '[unnamed layer]');
    var tableStr = getAttributeTableInfo(o.layer);
    var tableWidth = measureLongestLine(tableStr);
    var ruleLen = Math.min(Math.max(title.length, tableWidth), MAX_RULE_LEN);
    str += '\n';
    str += utils.lpad('', ruleLen, '=') + '\n';
    str += title + '\n';
    str += utils.lpad('', ruleLen, '-') + '\n';
    str += getLayerInfo(o.layer, o.dataset);
    str += tableStr;
  });
  message(str);
};

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

export function getLayerData(lyr, dataset) {
  var n = getFeatureCount(lyr);
  var o = {
    geometry_type: lyr.geometry_type,
    feature_count: n,
    null_shape_count: 0,
    null_data_count: lyr.data ? countNullRecords(lyr.data.getRecords()) : n
  };
  if (lyr.shapes) {
    o.null_shape_count = countNullShapes(lyr.shapes);
    o.bbox =getLayerBounds(lyr, dataset.arcs).toArray();
    o.proj4 = getProjInfo(dataset);
  }
  return o;
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

function getLayerInfo(lyr, dataset) {
  var data = getLayerData(lyr, dataset);
  var str = '';
  str += "Type:     " + (data.geometry_type || "tabular data") + "\n";
  str += utils.format("Records:  %,d\n",data.feature_count);
  if (data.null_shape_count > 0) {
    str += utils.format("Nulls:     %'d", data.null_shape_count) + "\n";
  }
  if (data.geometry_type && data.feature_count > data.null_shape_count) {
    str += "Bounds:   " + data.bbox.join(',') + "\n";
    str += "CRS:      " + data.proj4 + "\n";
  }
  str += "Source:   " + (getLayerSourceFile(lyr, dataset) || 'n/a') + "\n";
  return str;
}

export function getAttributeTableInfo(lyr, i) {
  if (!lyr.data || lyr.data.size() === 0 || lyr.data.getFields().length === 0) {
    return "Attribute data: [none]\n";
  }
  return "\nAttribute data\n" + formatAttributeTable(lyr.data, i);
}

function formatAttributeTable(data, i) {
  var fields = applyFieldOrder(data.getFields(), 'ascending');
  var vals = fields.map(function(fname) {
    return data.getReadOnlyRecordAt(i || 0)[fname];
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
  }, [i >= 0 ? 'Value' : 'First value']);
  var col1Chars = maxChars(col1Arr);
  var col2Chars = maxChars(col2Arr);
  var sepStr = (utils.rpad('', col1Chars + 2, '-') + '+' +
      utils.rpad('', col2Chars + 2, '-')).substr(0, MAX_RULE_LEN);
  var sepLine = sepStr + '\n';
  var table = sepLine;
  col1Arr.forEach(function(col1, i) {
    var w = stringDisplayWidth(col1);
    table += ' ' + col1 + utils.rpad('', col1Chars - w, ' ') + ' | ' +
      col2Arr[i] + '\n';
    if (i === 0) table += sepLine; // separator after first line
  });
  return table + sepLine;
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
  arcs.forEach2(function(i, n) {
    if (n > 2) {
      count += n - 2;
    }
  });
  return count;
}
