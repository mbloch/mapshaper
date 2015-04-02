/* @requires mapshaper-data-table */

api.filterFields = function(lyr, names) {
  MapShaper.updateFields(lyr, names, "filter-fields");
};

api.renameFields = function(lyr, names) {
  MapShaper.updateFields(lyr, names, "rename-fields");
};

MapShaper.updateFields = function(lyr, names, cmd) {
  if (!lyr.data) {
    stop("[filter-fields] Layer is missing a data table");
  } else if (!utils.isArray(names)) {
    stop("[filter-fields] Expected an array of field names; found:", names);
  }

  var dataFields = lyr.data.getFields(),
      fieldMap = MapShaper.mapFieldNames(names, {}),
      mappedFields = Object.keys(fieldMap),
      unmappedFields = utils.difference(dataFields, mappedFields),
      missingFields = utils.difference(mappedFields, dataFields);

  if (missingFields.length > 0) {
    message("[" + cmd + "] Table is missing one or more specified fields:", missingFields);
    message("Existing fields:", dataFields);
    stop();
  }

  if (cmd == "rename-fields" && unmappedFields.length > 0) {
    // add unmapped fields to the map, so all fields are retained
    MapShaper.mapFieldNames(unmappedFields, fieldMap);
  }

  lyr.data.update(MapShaper.getRecordMapper(fieldMap));
};

MapShaper.mapFieldNames = function(names, fieldMap) {
  return utils.reduce(names, function(memo, str) {
    var parts = str.split('=');
    var dest = parts[0],
        src = parts[1] || dest;
    if (!src || !dest) stop("[fields] Invalid field description:", str);
    memo[src] = dest;
    return memo;
  }, fieldMap || {});
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
