import { requireDataFields } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

cmd.filterFields = function(lyr, names, opts) {
  var table = lyr.data;
  names = names || [];
  requireDataFields(table, names);
  if (!table) return;
  // old method: does not set field order e.g. in CSV output files
  // utils.difference(table.getFields(), names).forEach(table.deleteField, table);
  // the below method sets field order of CSV output, and is generally faster
  var map = mapFieldNames(names);
  if (opts.invert) {
    map = invertFieldMap(map, table.getFields());
  }
  lyr.data.update(getRecordMapper(map));
};

cmd.renameFields = function(lyr, names) {
  var map = mapFieldNames(names);
  requireDataFields(lyr.data, Object.keys(map));
  utils.defaults(map, mapFieldNames(lyr.data.getFields()));
  lyr.data.update(getRecordMapper(map));
};

function invertFieldMap(map, fields) {
  return fields.reduce(function(memo, name) {
    if (!(name in map)) {
      memo[name] = name;
    }
    return memo;
  }, {});
}

function mapFieldNames(names) {
  return (names || []).reduce(function(memo, str) {
    var parts = str.split('='),
        dest = utils.trimQuotes(parts[0]),
        src = parts.length > 1 ? utils.trimQuotes(parts[1]) : dest;
    if (!src || !dest) stop("Invalid name assignment:", str);
    memo[src] = dest;
    return memo;
  }, {});
}

function getRecordMapper(map) {
  var fields = Object.keys(map);
  return function(src) {
    var dest = {}, key;
    for (var i=0, n=fields.length; i<n; i++) {
      key = fields[i];
      dest[map[key]] = src[key];
    }
    return dest;
  };
}

// internal.getRecordMapper = function(map) {
//   var fields = Object.keys(map);
//   return new Function("rec", "return {" + fields.map(function(name, i) {
//     var key = JSON.stringify(name);
//     return key + ": rec[" + key + "]";
//   }).join(",") + "}");
// };
