/* @require
mapshaper-point-buffer
mapshaper-polyline-buffer
mapshaper-polygon-buffer
*/

// returns a dataset
api.buffer = function(layers, dataset, opts) {
  return internal.makeBufferLayer(layers[0], dataset, opts);
};

internal.makeBufferLayer = function(lyr, dataset, opts) {
  var dataset2;
  if (lyr.geometry_type == 'point') {
    dataset2 = internal.makePointBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polyline') {
    dataset2 = internal.makePolylineBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polygon') {
    dataset2 = internal.makePolygonBuffer(lyr, dataset, opts);
  } else {
    stop("Unsupported geometry type");
  }
  dataset2.layers[0].name = opts.name || lyr.name;
  return dataset2;
};

