/* @requires mapshaper-common */

// utility functions for datasets and layers

MapShaper.layerHasPaths = function(lyr) {
  return lyr.shapes && (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polygon');
};

MapShaper.layerHasPoints = function(lyr) {
  return lyr.shapes && lyr.geometry_type == 'point';
};

MapShaper.getDatasetBounds = function(data) {
  var bounds = new Bounds();
  data.layers.forEach(function(lyr) {
    bounds.mergeBounds(MapShaper.getLayerBounds(lyr, data.arcs));
  });
  return bounds;
};

MapShaper.getFeatureCount = function(lyr) {
  var count = 0;
  if (lyr.data) {
    count = lyr.data.size();
  } else if (lyr.shapes) {
    count = lyr.shapes.length;
  }
  return count;
};

MapShaper.getLayerBounds = function(lyr, arcs) {
  var bounds = new Bounds();
  if (lyr.geometry_type == 'point') {
    MapShaper.forEachPoint(lyr, function(p) {
      bounds.mergePoint(p[0], p[1]);
    });
  } else if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
    MapShaper.forEachArcId(lyr.shapes, function(id) {
      arcs.mergeArcBounds(id, bounds);
    });
  }
  return bounds;
};

// replace old layers in-place, append any additional new layers
MapShaper.replaceLayers = function(dataset, oldLayers, newLayers) {
  Utils.repeat(Math.max(oldLayers.length, newLayers.length), function(i) {
    var oldLyr = oldLayers[i],
        newLyr = newLayers[i],
        idx = oldLyr ? dataset.layers.indexOf(oldLyr) : dataset.layers.length;
    if (oldLyr) dataset.layers.splice(idx, 1);
    if (newLyr) dataset.layers.splice(idx, 0, newLyr);
  });
};

MapShaper.validateLayer = function(lyr, arcs) {
  var type = lyr.geometry_type;
  if (!Utils.isArray(lyr.shapes)) {
    error("Layer is missing shapes property");
  }
  if (lyr.data && lyr.data.size() != lyr.shapes.length) {
    error("Layer contains mismatched data table and shapes");
  }
  if (arcs && arcs instanceof ArcCollection === false) {
    error("Expected an ArcCollection");
  }
  if (type == 'polygon' || type == 'polyline') {
    if (!arcs) error("Missing ArcCollection for a", type, "layer");
    // TODO: validate shapes, make sure ids are w/in arc range
  } else if (type == 'point') {
    // TODO: validate shapes
  } else if (type === null) {
    // TODO: make sure shapes are all null
  }
};

// Simple integrity checks
MapShaper.validateDataset = function(data) {
  if (!data) invalid("Missing dataset object");
  if (!Utils.isArray(data.layers) || data.layers.length > 0 === false)
    invalid("Missing layers");
  data.layers.forEach(function(lyr) {
    try {
      MapShaper.validateLayer(lyr, data.arcs);
    } catch (e) {
      invalid(e.message);
    }
  });

  function invalid(msg) {
    error("[validateDataset()] " + msg);
  }
};
