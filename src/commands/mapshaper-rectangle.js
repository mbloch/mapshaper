/* @require mapshaper-geojson, mapshaper-dataset-utils */

// Create rectangles around one or more target layers
//
api.rectangle2 = function(target, opts) {
  var outputLayers = [];
  var datasets = target.layers.map(function(lyr) {
    var dataset = api.rectangle({layer: lyr, dataset: target.dataset}, opts);
    outputLayers.push(dataset.layers[0]);
    if (!opts.no_replace) {
      dataset.layers[0].name = lyr.name || dataset.layers[0].name;
    }
    return dataset;
  });
  var merged = internal.mergeDatasets([target.dataset].concat(datasets));
  target.dataset.arcs = merged.arcs;
  return outputLayers;
};

api.rectangle = function(source, opts) {
  var clampGeographicBoxes = true; // TODO: make this an option?
  var isGeoBox;
  var offsets, bounds, crs, coords, sourceInfo;
  if (source) {
    bounds = internal.getLayerBounds(source.layer, source.dataset.arcs);
    sourceInfo = source.dataset.info;
    crs = internal.getDatasetCRS(source.dataset);
  } else if (opts.bbox) {
    bounds = new Bounds(opts.bbox);
    crs = internal.getCRS('wgs84');
  }
  if (!bounds || !bounds.hasBounds()) {
    stop('Missing rectangle extent');
  }
  if (opts.offset) {
    isGeoBox = internal.probablyDecimalDegreeBounds(bounds);
    offsets = internal.convertFourSides(opts.offset, crs, bounds);
    bounds.padBounds(offsets[0], offsets[1], offsets[2], offsets[3]);
    if (isGeoBox && clampGeographicBoxes) {
      bounds = internal.clampToWorldBounds(bounds);
    }

  }
  var geojson = internal.convertBboxToGeoJSON(bounds.toArray(), opts);
  var dataset = internal.importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'rectangle';
  if (sourceInfo) {
    internal.setDatasetCRS(dataset, sourceInfo);
  }
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
