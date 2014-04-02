/* @requires mapshaper-data-table */

// filter and rename data fields; see mapshaper --fields option

MapShaper.filterFields = function(layers, opts) {
  layers.forEach(function(lyr) {
    MapShaper.filterFieldsInLayer(lyr, opts);
  });
};

MapShaper.filterFieldsInLayer = function(lyr, opts) {
  if (lyr.data && opts.field_map) {
    var fields = lyr.data.getFields(),
        mappedFields = Utils.getKeys(opts.field_map),
        missingFields = Utils.difference(mappedFields, fields);

    if (missingFields.length > 0) {
      message("[--fields] Table is missing one or more specified fields:", missingFields);
      message("Existing fields:", fields);
      stop();
    } else {
      lyr.data.filterFields(opts.field_map);
    }
  }
};