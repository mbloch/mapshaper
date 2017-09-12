/* @requires mapshaper-common, mapshaper-shape-utils, mapshaper-point-utils */

// utility functions for datasets and layers

// Divide a collection of features with mixed types into layers of a single type
// (Used for importing TopoJSON and GeoJSON features)
internal.divideFeaturesByType = function(shapes, properties, types) {
  var typeSet = utils.uniq(types);
  var layers = typeSet.map(function(geoType) {
    var p = [],
        s = [],
        dataNulls = 0,
        rec;
    for (var i=0, n=shapes.length; i<n; i++) {
      if (types[i] != geoType) continue;
      if (geoType) s.push(shapes[i]);
      rec = properties[i];
      p.push(rec);
      if (!rec) dataNulls++;
    }
    return {
      geometry_type: geoType,
      shapes: s,
      data: dataNulls < s.length ? new DataTable(p) : null
    };
  });
  return layers;
};

// Split into datasets with one layer each
internal.splitDataset = function(dataset) {
  return dataset.layers.map(function(lyr) {
    var split = {
      arcs: dataset.arcs,
      layers: [lyr],
      info: dataset.info
    };
    internal.dissolveArcs(split); // replace arcs with filtered + dissolved copy
    return split;
  });
};

// clone all layers, make a filtered copy of arcs
internal.copyDataset = function(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(internal.copyLayer);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
};

// clone coordinate data, shallow-copy attribute data
internal.copyDatasetForExport = function(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(internal.copyLayerShapes);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
};

// shallow-copy layers, so they can be renamed (for export)
internal.copyDatasetForRenaming = function(dataset) {
  return utils.defaults({
    layers: dataset.layers.map(function(lyr) {return utils.extend({}, lyr);})
  }, dataset);
};

// make a stub copy if the no_replace option is given, else pass thru src layer
internal.getOutputLayer = function(src, opts) {
  return opts && opts.no_replace ? {geometry_type: src.geometry_type} : src;
};

// Make a deep copy of a layer
internal.copyLayer = function(lyr) {
  var copy = internal.copyLayerShapes(lyr);
  if (copy.data) {
    copy.data = copy.data.clone();
  }
  return copy;
};

internal.copyLayerShapes = function(lyr) {
  var copy = utils.extend({}, lyr);
    if (lyr.shapes) {
      copy.shapes = internal.cloneShapes(lyr.shapes);
    }
    return copy;
};

internal.getDatasetBounds = function(dataset) {
  var bounds = new Bounds();
  dataset.layers.forEach(function(lyr) {
    var lyrbb = internal.getLayerBounds(lyr, dataset.arcs);
    if (lyrbb) bounds.mergeBounds(lyrbb);
  });
  return bounds;
};


internal.datasetHasPaths = function(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return internal.layerHasPaths(lyr);
  });
};

// Remove ArcCollection of a dataset if not referenced by any layer
// TODO: consider doing arc dissolve, or just removing unreferenced arcs
// (currently cleanupArcs() is run after every command, so be mindful of performance)
internal.cleanupArcs = function(dataset) {
  if (dataset.arcs && !utils.some(dataset.layers, internal.layerHasPaths)) {
    dataset.arcs = null;
    return true;
  }
};

// Remove unused arcs from a dataset
// Warning: using dissolveArcs() means that adjacent arcs are combined when possible
internal.pruneArcs = function(dataset) {
  internal.cleanupArcs(dataset);
  if (dataset.arcs) {
    internal.dissolveArcs(dataset);
  }
};

internal.countMultiPartFeatures = function(shapes) {
  var count = 0;
  for (var i=0, n=shapes.length; i<n; i++) {
    if (shapes[i] && shapes[i].length > 1) count++;
  }
  return count;
};

internal.getFeatureCount = function(lyr) {
  var count = 0;
  if (lyr.data) {
    count = lyr.data.size();
  } else if (lyr.shapes) {
    count = lyr.shapes.length;
  }
  return count;
};

internal.getLayerBounds = function(lyr, arcs) {
  var bounds = null;
  if (lyr.geometry_type == 'point') {
    bounds = internal.getPointBounds(lyr.shapes);
  } else if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
    bounds = internal.getPathBounds(lyr.shapes, arcs);
  } else {
    // just return null if layer has no bounds
    // error("Layer is missing a valid geometry type");
  }
  return bounds;
};


internal.getPathBounds = function(shapes, arcs) {
  var bounds = new Bounds();
  internal.forEachArcId(shapes, function(id) {
    arcs.mergeArcBounds(id, bounds);
  });
  return bounds;
};

// replace cut layers in-sequence (to maintain layer indexes)
// append any additional new layers
internal.replaceLayers = function(dataset, cutLayers, newLayers) {
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

internal.isolateLayer = function(layer, dataset) {
  return utils.defaults({
    layers: dataset.layers.filter(function(lyr) {return lyr == layer;})
  }, dataset);
};

// Transform the points in a dataset in-place; don't clean up corrupted shapes
internal.transformPoints = function(dataset, f) {
  if (dataset.arcs) {
    dataset.arcs.transformPoints(f);
  }
  dataset.layers.forEach(function(lyr) {
    if (internal.layerHasPoints(lyr)) {
      internal.transformPointsInLayer(lyr, f);
    }
  });
};

internal.initDataTable = function(lyr) {
  lyr.data = new DataTable(internal.getFeatureCount(lyr));
};
