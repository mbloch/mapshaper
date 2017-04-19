/* @requires
mapshaper-data-table
mapshaper-data-aggregation
mapshaper-point-dissolve
mapshaper-polygon-dissolve
*/

// Generate a dissolved layer
// @opts.field (optional) name of data field (dissolves all if falsy)
// @opts.sum-fields (Array) (optional)
// @opts.copy-fields (Array) (optional)
//
api.dissolve = function(lyr, arcs, o) {
  var opts = o || {},
      getGroupId = internal.getCategoryClassifier(opts.field, lyr.data),
      dissolveShapes = null,
      dissolveData = null,
      lyr2;

  if (lyr.geometry_type == 'polygon') {
    dissolveShapes = dissolvePolygonGeometry(lyr.shapes, getGroupId);
  } else if (lyr.geometry_type == 'point') {
    dissolveShapes = dissolvePointLayerGeometry(lyr, getGroupId, opts);
  } else if (lyr.geometry_type) {
    stop("[dissolve] Only point and polygon geometries can be dissolved");
  }

  if (lyr.data) {
    dissolveData = internal.aggregateDataRecords(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=dissolveData.length; i<n; i++) {
      if (dissolveShapes && !dissolveShapes[i]) {
        dissolveShapes[i] = null;
      }
    }
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    shapes: dissolveShapes,
    data: dissolveData ? new DataTable(dissolveData) : null,
    geometry_type: lyr.geometry_type
  };
  if (!opts.silent) {
    internal.printDissolveMessage(lyr, lyr2);
  }
  return lyr2;
};

internal.printDissolveMessage = function(pre, post, cmd) {
  var n1 = internal.getFeatureCount(pre),
      n2 = internal.getFeatureCount(post),
      msg = utils.format('[%s] Dissolved %,d feature%s into %,d feature%s',
        cmd || 'dissolve', n1, utils.pluralSuffix(n1), n2,
        utils.pluralSuffix(n2));
  message(msg);
};
