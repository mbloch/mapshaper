/* @requires mapshaper-data-table */

api.filterFields = function(lyr, names) {
  var table = lyr.data;
  names = names || [];
  internal.requireDataFields(table, names);
  if (!table) return;
  // old method: does not set field order e.g. in CSV output files
  // utils.difference(table.getFields(), names).forEach(table.deleteField, table);
  // the below method sets field order of CSV output, and is generally faster
  var map = internal.mapFieldNames(names);
  lyr.data.update(internal.getRecordMapper(map));
};

api.renameFields = function(lyr, names) {
  var map = internal.mapFieldNames(names);
  internal.requireDataFields(lyr.data, Object.keys(map));
  utils.defaults(map, internal.mapFieldNames(lyr.data.getFields()));
  lyr.data.update(internal.getRecordMapper(map));
};

internal.mapFieldNames = function(names) {
  return (names || []).reduce(function(memo, str) {
    var parts = str.split('='),
        dest = utils.trimQuotes(parts[0]),
        src = parts.length > 1 ? utils.trimQuotes(parts[1]) : dest;
    if (!src || !dest) stop("Invalid field description:", str);
    memo[src] = dest;
    return memo;
  }, {});
};

internal.getRecordMapper = function(map) {
  var fields = Object.keys(map);
  return function(src) {
    var dest = {}, key;
    for (var i=0, n=fields.length; i<n; i++) {
      key = fields[i];
      dest[map[key]] = src[key];
    }
    return dest;
  };
};

// internal.getRecordMapper = function(map) {
//   var fields = Object.keys(map);
//   return new Function("rec", "return {" + fields.map(function(name, i) {
//     var key = JSON.stringify(name);
//     return key + ": rec[" + key + "]";
//   }).join(",") + "}");
// };
