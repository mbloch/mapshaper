/* @require mapshaper-common */

api.shape = function(source, opts) {
  var bounds, coords;
  if (source) {
    bounds = internal.getLayerBounds(source.layer, source.dataset.arcs);
  } else if (opts.bbox) {
    bounds = new Bounds(opts.bbox);
  }
  if (!bounds || !bounds.hasBounds()) {
    stop('Missing shape extent');
  }
  if (opts.offset > 0) {
    bounds.padBounds(opts.offset, opts.offset, opts.offset, opts.offset);
  }
  var geojson = internal.convertBboxToGeoJSON(bounds.toArray(), opts);
  var dataset = internal.importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'shape';
  return dataset;
};

internal.convertBboxToGeoJSON = function(bbox, opts) {
  var coords = [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]],
      [bbox[2], bbox[1]], [bbox[0], bbox[1]]];
  return {
    type: 'Polygon',
    coordinates: [coords]
  };
};
