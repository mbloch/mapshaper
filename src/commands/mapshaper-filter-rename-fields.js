/* @requires mapshaper-data-table */

api.filterFields = function(lyr, names) {
  var table = lyr.data;
  MapShaper.requireDataFields(table, names, 'filter-fields');
  utils.difference(table.getFields(), names).forEach(table.deleteField, table);
};

api.renameFields = function(lyr, names) {
  var map = MapShaper.mapFieldNames(names);
  MapShaper.requireDataFields(lyr.data, Object.keys(map), 'rename-fields');
  utils.defaults(map, MapShaper.mapFieldNames(lyr.data.getFields()));
  lyr.data.update(MapShaper.getRecordMapper(map));
};

MapShaper.mapFieldNames = function(names) {
  return names.reduce(function(memo, str) {
    var parts = str.split('=');
    var dest = parts[0],
        src = parts[1] || dest;
    if (!src || !dest) stop("[rename-fields] Invalid field description:", str);
    memo[src] = dest;
    return memo;
  }, {});
};

MapShaper.getRecordMapper = function(map) {
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
