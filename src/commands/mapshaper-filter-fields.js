/* @requires mapshaper-data-table */

// filter and rename data fields; see mapshaper -fields option

api.filterFields = function(lyr, names) {
  if (!lyr.data) stop("[fields] Layer is missing a data table");
  if (!Utils.isArray(names)) stop("[fields] Expected an array of field names; found:", names);
  var fields = lyr.data.getFields(),
      fieldMap = utils.reduce(names, function(memo, str) {
        var parts = str.split('=');
        var dest = parts[0],
            src = parts[1] || dest;
        if (!src || !dest) stop("[fields] Invalid field description:", str);
        memo[src] = dest;
        return memo;
      }, {});
      missingFields = Utils.difference(Utils.getKeys(fieldMap), fields);

  if (missingFields.length > 0) {
    message("[fields] Table is missing one or more specified fields:", missingFields);
    message("Existing fields:", fields);
    stop();
  } else {
    lyr.data.filterFields(fieldMap);
  }

};
