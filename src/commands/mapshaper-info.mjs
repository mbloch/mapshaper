import { applyFieldOrder } from '../datatable/mapshaper-data-utils';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { getProjInfo } from '../crs/mapshaper-projections';
import { getLayerBounds, getFeatureCount, getLayerSourceFile } from '../dataset/mapshaper-layer-utils';
import { expandCommandTargets } from '../dataset/mapshaper-target-utils';
import { writeFiles } from '../io/mapshaper-file-export';
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
  message(formatInfo(arr));
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
  if (lyr.shapes && lyr.shapes.length > 0) {
    o.null_shape_count = countNullShapes(lyr.shapes);
    o.bbox = getLayerBounds(lyr, dataset.arcs).toArray();
    o.proj4 = getProjInfo(dataset);
  }
  o.source_file = getLayerSourceFile(lyr, dataset) || null;
  o.attribute_data = getAttributeTableInfo(lyr);
  return o;
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
    var tableStr = formatAttributeTableInfo(info.attribute_data);
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
  str += "Source:   " + (data.source_file || 'n/a') + "\n";
  return str;
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
  arcs.forEach2(function(i, n) {
    if (n > 2) {
      count += n - 2;
    }
  });
  return count;
}
