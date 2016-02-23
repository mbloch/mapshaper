/* @requires mapshaper-common, mapshaper-shape-utils */

// utility functions for datasets and layers

// clone all layers, make a filtered copy of arcs
MapShaper.copyDataset = function(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(MapShaper.copyLayer);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
};

// make a stub copy if the no_replace option is given, else pass thru src layer
MapShaper.getOutputLayer = function(src, opts) {
  return opts && opts.no_replace ? {geometry_type: src.geometry_type} : src;
};

// Make a deep copy of a layer
MapShaper.copyLayer = function(lyr) {
  var copy = utils.extend({}, lyr);
  if (lyr.data) {
    copy.data = lyr.data.clone();
  }
  if (lyr.shapes) {
    copy.shapes = MapShaper.cloneShapes(lyr.shapes);
  }
  return copy;
};

MapShaper.getDatasetBounds = function(data) {
  var bounds = new Bounds();
  data.layers.forEach(function(lyr) {
    var lyrbb = MapShaper.getLayerBounds(lyr, data.arcs);
    if (lyrbb) bounds.mergeBounds(lyrbb);
  });
  return bounds;
};

MapShaper.datasetHasPaths = function(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return MapShaper.layerHasPaths(lyr);
  });
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
    // just return null if layer has no bounds
    // error("Layer is missing a valid geometry type");
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
  utils.repeat(Math.max(cutLayers.length, newLayers.length), function(i) {
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

MapShaper.isolateLayer = function(layer, dataset) {
  return utils.defaults({
    layers: dataset.layers.filter(function(lyr) {return lyr == layer;})
  }, dataset);
};

// @target is a layer identifier or a comma-sep. list of identifiers
// an identifier is a literal name, a name containing "*" wildcard or
// a 0-based array index
MapShaper.findMatchingLayers = function(layers, target) {
  var ii = [];
  String(target).split(',').forEach(function(id) {
    var i = Number(id),
        rxp = utils.wildcardToRegExp(id);
    if (utils.isInteger(i)) {
      ii.push(i); // TODO: handle out-of-range index
    } else {
      layers.forEach(function(lyr, i) {
        if (rxp.test(lyr.name)) ii.push(i);
      });
    }
  });

  ii = utils.uniq(ii); // remove dupes
  return ii.map(function(i) {
    return layers[i];
  });
};
