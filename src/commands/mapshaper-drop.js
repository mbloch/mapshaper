/* @requires mapshaper-common */

api.drop = function(catalog, layers, dataset, opts) {
  var updateArcs = false;
  // delete entire layer if no sub-layer elements are specified
  var deletion = !(opts.geometry || opts.properties || opts.fields) ||
      opts.geometry && opts.properties; // .. or if both geom and data are given

  layers.forEach(function(lyr) {
    if (opts.geometry || deletion) {
      updateArcs |= internal.layerHasPaths(lyr);
      delete lyr.shapes;
      delete lyr.geometry_type;
    }
    if (deletion) {
      catalog.deleteLayer(lyr, dataset);
    } else if (opts.fields && lyr.data) {
      opts.fields.forEach(lyr.data.deleteField, lyr.data);
    } else if (opts.properties) {
      delete lyr.data;
    }
  });

  if (updateArcs) {
    internal.pruneArcs(dataset);
  }
};
