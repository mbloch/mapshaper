/* @requires
mapshaper-data-table
mapshaper-data-aggregation
mapshaper-point-dissolve
mapshaper-polygon-dissolve
mapshaper-polyline-dissolve
*/

// Generate a dissolved layer
// @opts.field (optional) name of data field (dissolves all if falsy)
// @opts.sum-fields (Array) (optional)
// @opts.copy-fields (Array) (optional)
//
api.dissolve = function(lyr, arcs, o) {
  var opts = o || {},
      getGroupId = internal.getCategoryClassifier(opts.field, lyr.data),
      dissolveShapes = null;

  if (lyr.geometry_type == 'polygon') {
    dissolveShapes = dissolvePolygonGeometry(lyr.shapes, getGroupId);
  } else if (lyr.geometry_type == 'polyline') {
    dissolveShapes = internal.dissolvePolylineGeometry(lyr, getGroupId, arcs, opts);
  } else if (lyr.geometry_type == 'point') {
    dissolveShapes = dissolvePointLayerGeometry(lyr, getGroupId, opts);
  }
  return internal.composeDissolveLayer(lyr, dissolveShapes, getGroupId, opts);
};

// @lyr: original undissolved layer
// @shapes: dissolved shapes
internal.composeDissolveLayer = function(lyr, shapes, getGroupId, opts) {
  var records = null;
  var lyr2;
  if (lyr.data) {
    records = internal.aggregateDataRecords(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=records.length; i<n; i++) {
      if (shapes && !shapes[i]) {
        shapes[i] = null;
      }
    }
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    shapes: shapes,
    data: records ? new DataTable(records) : null,
    geometry_type: lyr.geometry_type
  };
  if (!opts.silent) {
    internal.printDissolveMessage(lyr, lyr2);
  }
  return lyr2;
};

internal.printDissolveMessage = function(pre, post) {
  var n1 = internal.getFeatureCount(pre),
      n2 = internal.getFeatureCount(post),
      msg = utils.format('Dissolved %,d feature%s into %,d feature%s',
        n1, utils.pluralSuffix(n1), n2,
        utils.pluralSuffix(n2));
  message(msg);
};
