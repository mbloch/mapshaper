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
    bounds = internal.applyRectangleOptions(bounds, crs, opts);
    if (!bounds) return null;
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
  var offsets, bounds, crs, coords, sourceInfo;
  if (source) {
    bounds = internal.getLayerBounds(source.layer, source.dataset.arcs);
    sourceInfo = source.dataset.info;
    crs = internal.getDatasetCRS(source.dataset);
  } else if (opts.bbox) {
    bounds = new Bounds(opts.bbox);
    crs = internal.getCRS('wgs84');
  }
  bounds = bounds && internal.applyRectangleOptions(bounds, crs, opts);
  if (!bounds || !bounds.hasBounds()) {
    stop('Missing rectangle extent');
  }
  var geojson = internal.convertBboxToGeoJSON(bounds.toArray(), opts);
  var dataset = internal.importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'rectangle';
  if (sourceInfo) {
    internal.setDatasetCRS(dataset, sourceInfo);
  }
  return dataset;
};

internal.applyRectangleOptions = function(bounds, crs, opts) {
  var isGeoBox = internal.probablyDecimalDegreeBounds(bounds);
  if (opts.offset) {
    bounds = internal.applyBoundsOffset(opts.offset, bounds, crs);
  }
  if (bounds.area() > 0 === false) return null;
  if (opts.aspect_ratio) {
    bounds = internal.applyAspectRatio(opts.aspect_ratio, bounds);
  }
  if (isGeoBox) {
    bounds = internal.clampToWorldBounds(bounds);
  }
  return bounds;
};

// opt: aspect ratio as a single number or a range (e.g. "1,2");
internal.applyAspectRatio = function(opt, bounds) {
  var range = String(opt).split(',').map(parseFloat),
    aspectRatio = bounds.width() / bounds.height(),
    min, max; // min is height limit, max is width limit
  if (range.length == 1) {
    range.push(range[0]);
  } else if (range[0] > range[1]) {
    range.reverse();
  }
  min = range[0];
  max = range[1];
  if (!min && !max) return bounds;
  if (!min) min = -Infinity;
  if (!max) max = Infinity;
  if (aspectRatio < min) {
    bounds.fillOut(min);
  } else if (aspectRatio > max) {
    bounds.fillOut(max);
  }
  return bounds;
};

internal.applyBoundsOffset = function(offsetOpt, bounds, crs) {
  var offsets = internal.convertFourSides(offsetOpt, crs, bounds);
  bounds.padBounds(offsets[0], offsets[1], offsets[2], offsets[3]);
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
