/* @requires mapshaper-common */

// utility functions for datasets and layers

// make a modified copy of a layer
MapShaper.updateLayer = function(lyr, update, opts) {
  // var newLyr = Utils.defaults(obj, lyr);
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
  var bounds = null;
  if (lyr.geometry_type == 'point') {
    bounds = new Bounds();
    MapShaper.forEachPoint(lyr, function(p) {
      bounds.mergePoint(p[0], p[1]);
    });
  } else if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
    bounds = MapShaper.getPathBounds(lyr.shapes, arcs);
  } else {
    error("Layer is missing a valid geometry type");
  }
  return bounds;
};

MapShaper.getPathBounds = function(shapes, arcs) {
  var bounds = new Bounds();
  MapShaper.forEachArcId(shapes, function(id) {
    arcs.mergeArcBounds(id, bounds);
  });
  return bounds;
};

// replace cut layers in-sequence (to maintain layer indexes)
// append any additional new layers
MapShaper.replaceLayers = function(dataset, cutLayers, newLayers) {
  // modify a copy in case cutLayers == dataset.layers
  var currLayers = dataset.layers.concat();
  Utils.repeat(Math.max(cutLayers.length, newLayers.length), function(i) {
    var cutLyr = cutLayers[i],
        newLyr = newLayers[i],
        idx = cutLyr ? currLayers.indexOf(cutLyr) : currLayers.length;

    if (cutLyr) {
      currLayers.splice(idx, 1);
    }
    if (newLyr) {
      currLayers.splice(idx, 0, newLyr);
    }
  });
  dataset.layers = currLayers;
};

/*
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
*/
