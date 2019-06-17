/* @requires
mapshaper-common
mapshaper-shape-utils
mapshaper-point-utils
mapshaper-layer-utils
mapshaper-merging
*/

// utility functions for datasets

internal.mergeDatasetsIntoDataset = function(dataset, datasets) {
  var merged = internal.mergeDatasets([dataset].concat(datasets));
  var mergedLayers = datasets.reduce(function(memo, dataset) {
    return memo.concat(dataset.layers);
  }, []);
  dataset.arcs = merged.arcs;
  return mergedLayers;
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

internal.getDatasetBounds = function(dataset) {
  var bounds = new Bounds();
  dataset.layers.forEach(function(lyr) {
    var lyrbb = internal.getLayerBounds(lyr, dataset.arcs);
    if (lyrbb) bounds.mergeBounds(lyrbb);
  });
  return bounds;
};

internal.datasetHasGeometry = function(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return internal.layerHasGeometry(lyr);
  });
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
