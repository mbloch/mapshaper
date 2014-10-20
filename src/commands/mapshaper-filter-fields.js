/* @requires mapshaper-data-table */

// filter and rename data fields; see mapshaper -fields option

api.filterFields = function(lyr, names) {
  var fields, fieldMap, missingFields;
  if (!lyr.data) {
    stop("[filter-fields] Layer is missing a data table");
  } else if (!Utils.isArray(names)) {
    stop("[filter-fields] Expected an array of field names; found:", names);
  }

  fieldMap = utils.reduce(names, function(memo, str) {
      var parts = str.split('=');
      var dest = parts[0],
          src = parts[1] || dest;
      if (!src || !dest) stop("[fields] Invalid field description:", str);
      memo[src] = dest;
      return memo;
    }, {});
  fields = lyr.data.getFields();
  missingFields = Utils.difference(Utils.getKeys(fieldMap), fields);

  if (missingFields.length > 0) {
    message("[filter-fields] Table is missing one or more specified fields:", missingFields);
    message("Existing fields:", fields);
    stop();
  } else {
    lyr.data.filterFields(fieldMap);
  }
};
