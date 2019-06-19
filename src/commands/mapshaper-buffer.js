/* @require
mapshaper-point-buffer
mapshaper-polyline-buffer
mapshaper-polygon-buffer
mapshaper-dataset-utils
*/

// returns a dataset
api.buffer = function(layers, dataset, opts) {
  return internal.makeBufferLayer(layers[0], dataset, opts);
};

internal.makeBufferLayer = function(lyr, dataset, opts) {
  var dataset2, lyr2;
  if (lyr.geometry_type == 'point') {
    dataset2 = internal.makePointBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polyline') {
    dataset2 = internal.makePolylineBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polygon') {
    dataset2 = internal.makePolygonBuffer(lyr, dataset, opts);
  } else {
    stop("Unsupported geometry type");
  }
  var outputLayers = internal.mergeDatasetsIntoDataset(dataset, [dataset2]);
  lyr2 = outputLayers[0];
  lyr2.name = lyr.name;
  if (lyr.data && !lyr2.data) {
    lyr2.data = opts.no_replace ? lyr.data.clone() : lyr.data;
  }
  return outputLayers;
};

