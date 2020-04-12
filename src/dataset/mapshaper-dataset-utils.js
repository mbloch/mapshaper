
import utils from '../utils/mapshaper-utils';
import { getLayerBounds, layerHasGeometry, layerHasPaths, transformPointsInLayer,
  copyLayerShapes, copyLayer, layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';

// utility functions for datasets

// Split into datasets with one layer each
export function splitDataset(dataset) {
  return dataset.layers.map(function(lyr) {
    var split = {
      arcs: dataset.arcs,
      layers: [lyr],
      info: dataset.info
    };
    dissolveArcs(split); // replace arcs with filtered + dissolved copy
    return split;
  });
}

// clone all layers, make a filtered copy of arcs
export function copyDataset(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(copyLayer);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
}

// clone coordinate data, shallow-copy attribute data
export function copyDatasetForExport(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(copyLayerShapes);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
}

// shallow-copy layers, so they can be renamed (for export)
export function copyDatasetForRenaming(dataset) {
  return utils.defaults({
    layers: dataset.layers.map(function(lyr) {return utils.extend({}, lyr);})
  }, dataset);
}

export function getDatasetBounds(dataset) {
  var bounds = new Bounds();
  dataset.layers.forEach(function(lyr) {
    var lyrbb = getLayerBounds(lyr, dataset.arcs);
    if (lyrbb) bounds.mergeBounds(lyrbb);
  });
  return bounds;
}

export function datasetHasGeometry(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return layerHasGeometry(lyr);
  });
}

export function datasetHasPaths(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return layerHasPaths(lyr);
  });
}

// Remove ArcCollection of a dataset if not referenced by any layer
// TODO: consider doing arc dissolve, or just removing unreferenced arcs
// (currently cleanupArcs() is run after every command, so be mindful of performance)
export function cleanupArcs(dataset) {
  if (dataset.arcs && !utils.some(dataset.layers, layerHasPaths)) {
    dataset.arcs = null;
    return true;
  }
}

// Remove unused arcs from a dataset
// Warning: using dissolveArcs() means that adjacent arcs are combined when possible
export function pruneArcs(dataset) {
  cleanupArcs(dataset);
  if (dataset.arcs) {
    dissolveArcs(dataset);
  }
}

// replace cut layers in-sequence (to maintain layer indexes)
// append any additional new layers
export function replaceLayers(dataset, cutLayers, newLayers) {
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
}

// Transform the points in a dataset in-place; don't clean up corrupted shapes
export function transformPoints(dataset, f) {
  if (dataset.arcs) {
    dataset.arcs.transformPoints(f);
  }
  dataset.layers.forEach(function(lyr) {
    if (layerHasPoints(lyr)) {
      transformPointsInLayer(lyr, f);
    }
  });
}
