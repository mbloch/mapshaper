/* @requires mapshaper-common, mapshaper-data-utils */

api.drop = function(catalog, layers, dataset, opts) {
  var updateArcs = false;

  layers.forEach(function(lyr) {
    var fields = lyr.data && opts.fields;
    var allFields = fields && internal.fieldListContainsAll(fields, lyr.data.getFields());
    var deletion = !fields && !opts.geometry || allFields && opts.geometry;
    if (opts.geometry) {
      updateArcs |= internal.layerHasPaths(lyr);
      delete lyr.shapes;
      delete lyr.geometry_type;
    }
    if (deletion) {
      catalog.deleteLayer(lyr, dataset);
    } else if (allFields) {
      delete lyr.data;
    } else if (fields) {
      opts.fields.forEach(lyr.data.deleteField, lyr.data);
    }
  });

  if (updateArcs) {
    internal.pruneArcs(dataset);
  }
};

