/* @require mapshaper-geojson, mapshaper-dataset-utils */

api.shape = function(opts) {
  var coords = opts.coordinates;
  var offsets = opts.offsets || [];
  var coordinates = [];
  var geojson, dataset, type, i, x, y;

  if (!coords || coords.length >= 2 === false) {
    stop('Missing list of coordinates');
  }
  for (i=0; i<coords.length; i+= 2) {
    x = coords[i];
    y = coords[i + 1];
    coordinates.push([x, y]);
  }
  for (i=0; i<offsets.length; i+=2) {
    x += offsets[i];
    y += offsets[i + 1];
    coordinates.push([x, y]);
  }
  if (GeoJSON.pathIsRing(coordinates)) {
    type = 'Polygon';
  } else if (opts.closed && coordinates.length >= 3) {
    type = 'Polygon';
    coordinates.push(coordinates[0]);
  } else {
    type = 'LineString';
  }
  geojson = {
    type: type,
    coordinates: type == 'Polygon' ? [coordinates] : coordinates
  };
  dataset = internal.importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'shape';
  return dataset;
};

api.rectangle = function(source, opts) {
  var bounds, coords, sourceInfo;
  if (source) {
    bounds = internal.getLayerBounds(source.layer, source.dataset.arcs);
    sourceInfo = source.dataset.info;
  } else if (opts.bbox) {
    bounds = new Bounds(opts.bbox);
  }
  if (!bounds || !bounds.hasBounds()) {
    stop('Missing rectangle extent');
  }
  if (opts.offset > 0) {
    bounds.padBounds(opts.offset, opts.offset, opts.offset, opts.offset);
  }
  var geojson = internal.convertBboxToGeoJSON(bounds.toArray(), opts);
  var dataset = internal.importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'rectangle';
  if (sourceInfo) {
    internal.setDatasetProjection(dataset, sourceInfo);
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
