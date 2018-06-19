/* @require mapshaper-geojson, mapshaper-dataset-utils */

// Create rectangles around each feature in a layer
api.rectangles = function(targetLyr, targetDataset, opts) {
  if (!internal.layerHasGeometry(targetLyr)) {
    stop("Layer is missing geometric shapes");
  }
  var crs = internal.getDatasetCRS(targetDataset);
  var records = targetLyr.data ? targetLyr.data.getRecords() : null;
  var geometries = targetLyr.shapes.map(function(shp) {
    var bounds = targetLyr.geometryType == 'point' ?
      internal.getPointFeatureBounds(shp) : targetDataset.arcs.getMultiShapeBounds(shp);
    if (!bounds.hasBounds()) return null;
    if (opts.offset) {
      bounds = internal.applyBoundsOffset(opts.offset, bounds, crs);
    }
    if (bounds.area() <= 0) return null;
    return internal.convertBboxToGeoJSON(bounds.toArray(), opts);
  });
  var geojson = {
    type: 'FeatureCollection',
    features: geometries.map(function(geom, i) {
      var rec = records && records[i] || null;
      if (rec && opts.no_replace) {
        rec = utils.extend({}, rec); // make a copy
      }
      return {
        type: 'Feature',
        properties: rec,
        geometry: geom
      };
    })
  };
  var dataset = internal.importGeoJSON(geojson, {});
  var merged = internal.mergeDatasets([targetDataset, dataset]);
  var outputLyr = dataset.layers[0];
  targetDataset.arcs = merged.arcs;
  if (!opts.no_replace) {
    outputLyr.name = targetLyr.name || outputLyr.name;
  }
  return [outputLyr];
};

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
    bounds = internal.applyBoundsOffset(opts.offset, bounds, crs);
  }
  var geojson = internal.convertBboxToGeoJSON(bounds.toArray(), opts);
  var dataset = internal.importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'rectangle';
  if (sourceInfo) {
    internal.setDatasetCRS(dataset, sourceInfo);
  }
  return dataset;
};

internal.applyBoundsOffset = function(offsetOpt, bounds, crs) {
  var clampGeographicBoxes = true; // TODO: make this an option?
  var isGeoBox = internal.probablyDecimalDegreeBounds(bounds);
  var offsets = internal.convertFourSides(offsetOpt, crs, bounds);
  bounds.padBounds(offsets[0], offsets[1], offsets[2], offsets[3]);
  if (isGeoBox && clampGeographicBoxes) {
    bounds = internal.clampToWorldBounds(bounds);
  }
  return bounds;
};

internal.convertBboxToGeoJSON = function(bbox, opts) {
  var coords = [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]],
      [bbox[2], bbox[1]], [bbox[0], bbox[1]]];
  return {
    type: 'Polygon',
    coordinates: [coords]
  };
};
