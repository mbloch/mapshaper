/* @requires mapshaper-data-table */

// Filter and rename data fields

api.filterFields = function(lyr, names) {
  if (!lyr.data) {
    stop("[filter-fields] Layer is missing a data table");
  } else if (!Utils.isArray(names)) {
    stop("[filter-fields] Expected an array of field names; found:", names);
  }

  var fieldMap = MapShaper.getFieldFilterMap(names),
      dataFields = lyr.data.getFields(),
      missingFields = Utils.difference(Object.keys(fieldMap), dataFields);

  if (missingFields.length > 0) {
    message("[filter-fields] Table is missing one or more specified fields:", missingFields);
    message("Existing fields:", dataFields);
    stop();
  } else {
    lyr.data.update(MapShaper.getRecordMapper(fieldMap));
  }
};

MapShaper.getFieldFilterMap = function(names) {
  return utils.reduce(names, function(memo, str) {
    var parts = str.split('=');
    var dest = parts[0],
        src = parts[1] || dest;
    if (!src || !dest) stop("[fields] Invalid field description:", str);
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
