
import utils from '../utils/mapshaper-utils';
import {
  getLayerBounds,
  layerHasGeometry,
  layerHasPaths,
  transformPointsInLayer,
  copyLayerShapes,
  copyLayer,
  layerHasPoints,
  layerHasRaster,
  layerIsEmpty,
  setOutputLayerName,
  getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { buildTopology } from '../topology/mapshaper-topology';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { error } from '../utils/mapshaper-logging';
import {
  markDatasetChanged,
  markDatasetInfoChanged,
  markLayerChanged,
  noteDatasetInfoWillChange,
  noteDatasetWillChange,
  noteLayerWillChange
} from '../undo/mapshaper-undo-tracking';

// utility functions for datasets

// Split into datasets with one layer each
export function splitDataset(dataset) {
  return dataset.layers.map(function(lyr) {
    var split = {
      arcs: dataset.arcs,
      layers: [lyr],
      info: utils.extend({}, dataset.info)
    };
    dissolveArcs(split); // replace arcs with filtered + dissolved copy
    return split;
  });
}

// dest: destination dataset
// src: source dataset
export function mergeDatasetInfo(dest, src) {
  var srcInfo = src.info || {};
  var destInfo = dest.info || (dest.info = {});
  noteDatasetInfoWillChange(dest, {operation: 'mergeDatasetInfo'});
  destInfo.input_files = utils.uniq((destInfo.input_files || []).concat(srcInfo.input_files || []));
  destInfo.input_formats = utils.uniq((destInfo.input_formats || []).concat(srcInfo.input_formats || []));
  // Preserved GeoJSON metadata stays with the dataset it was imported into; it
  // is never inherited from a merged-in source (e.g. a -join / clip / erase
  // source), which would otherwise leak that source's metadata into the output.
  // The same goes for a frame reference.
  var destMetadata = destInfo.input_geojson_metadata;
  var destFrame = destInfo.frame;
  // merge other info properties (e.g. input_geojson_crs, input_delimiter, prj, crs)
  utils.defaults(destInfo, srcInfo);
  if (destMetadata) {
    destInfo.input_geojson_metadata = destMetadata;
  } else {
    delete destInfo.input_geojson_metadata;
  }
  if (destFrame) {
    destInfo.frame = destFrame;
  } else {
    delete destInfo.frame;
  }
  markDatasetInfoChanged(dest, {operation: 'mergeDatasetInfo'});
}

export function copyDatasetInfo(info) {
  // not a deep copy... objects like info.crs are read-only, so copy-by-reference
  // should be ok
  var info2 = Object.assign({}, info);
  if (Array.isArray(info.input_files)) {
    info2.input_files = info.input_files.concat();
  }
  return info2;
}

export function splitApartLayers(dataset, layers) {
  var datasets = [];
  noteDatasetWillChange(dataset, {operation: 'splitApartLayers', unit: 'layers'});
  dataset.layers = dataset.layers.filter(function(lyr) {
    if (!layers.includes(lyr)) {
      return true;
    }
    var split = {
      arcs: dataset.arcs,
      layers: [lyr],
      info: utils.extend({}, dataset.info)
    };
    dissolveArcs(split); // replace arcs with filtered + dissolved copy
    datasets.push(split);
    return false;
  });
  if (dataset.layers.length) {
    dissolveArcs(dataset);
    datasets.push(dataset);
  }
  markDatasetChanged(dataset, {operation: 'splitApartLayers', unit: 'layers'});
  return datasets;
}

// clone all layers, make a filtered copy of arcs
// (the copy gets its own ID when it is added to a catalog)
export function copyDataset(dataset) {
  var d2 = utils.extend({}, dataset);
  delete d2.id;
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

export function datasetIsEmpty(dataset) {
  return dataset.layers.every(function(lyr) {
    return layerIsEmpty(lyr);
  });
}

export function datasetHasGeometry(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return layerHasGeometry(lyr);
  });
}

export function datasetHasRaster(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return layerHasRaster(lyr);
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
    noteDatasetWillChange(dataset, {operation: 'cleanupArcs', unit: 'arcs'});
    dataset.arcs = null;
    markDatasetChanged(dataset, {operation: 'cleanupArcs', unit: 'arcs'});
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
  noteDatasetWillChange(dataset, {operation: 'replaceLayers', unit: 'layers'});
  handOverLayerStacking(cutLayers, newLayers);
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
  markDatasetChanged(dataset, {operation: 'replaceLayers', unit: 'layers'});
}

// A replacement layer takes over the stacking position (menu_order) and
// visibility (pinned, frame_hidden) of the layer it replaces, so that a
// command like -dissolve does not move a layer to the top of the stack or show
// a hidden layer. Extra new layers are stacked directly above the last
// replaced layer, in order. Values that a new layer already has are kept.
export function handOverLayerStacking(cutLayers, newLayers) {
  var n = Math.min(cutLayers.length, newLayers.length);
  var src = n > 0 ? cutLayers[n - 1] : null;
  var extras = newLayers.length - n;
  newLayers.forEach(function(newLyr, i) {
    var cutLyr = i < n ? cutLayers[i] : src;
    if (!cutLyr || !newLyr || newLyr == cutLyr) return;
    if (!(newLyr.menu_order > 0) && cutLyr.menu_order > 0) {
      newLyr.menu_order = i < n ? cutLyr.menu_order :
        cutLyr.menu_order + (i - n + 1) / (extras + 1);
    }
    if (newLyr.pinned === undefined && cutLyr.pinned !== undefined) {
      newLyr.pinned = cutLyr.pinned;
    }
    if (newLyr.frame_hidden === undefined && cutLyr.frame_hidden) {
      newLyr.frame_hidden = true;
    }
  });
}

// Replace a layer with a layer from a second dataset
// (in-place)
// (Typically, the second dataset is imported from dynamically generated GeoJSON and contains one layer)
export function replaceLayerContents(lyr, dataset, dataset2) {
  var lyr2 = mergeOutputLayerIntoDataset(lyr, dataset, dataset2, {});
  if (layerHasPaths(lyr2)) {
    buildTopology(dataset);
  }
}

export function mergeOutputLayerIntoDataset(lyr, dataset, dataset2, opts) {
  var output = mergeOutputLayersIntoDataset(lyr, dataset, dataset2, opts);
  if (output.length != 1) {
    error('Expected 1 output layer, received:', output.length);
  }
  return output[0];
}

export function mergeOutputLayersIntoDataset(lyr, dataset, dataset2, opts) {
  if (!dataset2 || dataset2.layers.length === 0) {
    error('Invalid source dataset');
  }
  if (dataset.layers.includes(lyr) === false) {
    error('Invalid target layer');
  }
  // this command returns merged layers instead of adding them to target dataset
  var outputLayers = mergeDatasetsIntoDataset(dataset, [dataset2]);
  var lyr2 = outputLayers[0];
  // TODO: find a more reliable way of knowing when to copy data
  var copyData = !lyr2.data && lyr.data && getFeatureCount(lyr2) == lyr.data.size();
  if (copyData) {
    lyr2.data = opts.no_replace ? lyr.data.clone() : lyr.data;
  }
  lyr2.name = opts.name || lyr.name;
  if (!opts.no_replace) {
    noteLayerWillChange(lyr, {operation: 'mergeOutputLayersIntoDataset'});
    outputLayers[0] = Object.assign(lyr, {data: null, shapes: null}, lyr2);
    markLayerChanged(lyr, {operation: 'mergeOutputLayersIntoDataset'});
    if (layerHasPaths(lyr)) {
      // Remove unused arcs from replaced layer
      // TODO: consider using clean insead of this
      dissolveArcs(dataset);
    }
  }
  return outputLayers;
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
