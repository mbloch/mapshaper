
import { findCommandTargets, findMatchingLayers } from '../dataset/mapshaper-target-utils';
import { stop } from '../utils/mapshaper-logging';
import {
  getUndoId,
  getUndoRevision,
  markCatalogChanged,
  markDatasetChanged,
  noteDatasetWillChange,
  noteCatalogWillChange
} from '../undo/mapshaper-undo-tracking';

// Catalog contains zero or more multi-layer datasets
// One layer is always "active", corresponding to the currently selected
//   layer in the GUI or the current target in the CLI
export function Catalog() {
  var datasets = [],
      defaultTargets = [];// saved default command targets [{layers:[], dataset}, ...]

  this.getUndoId = function() {
    return getUndoId(this);
  };

  this.getUndoRevision = function() {
    return getUndoRevision(this);
  };

  this.captureCatalogBefore = function(detail) {
    noteCatalogWillChange(this, detail);
  };

  this.markCatalogChanged = function(detail) {
    return markCatalogChanged(this, detail);
  };

  this.forEachLayer = function(cb) {
    var i = 0;
    datasets.forEach(function(dataset) {
      dataset.layers.forEach(function(lyr) {
        cb(lyr, dataset, i++);
      });
    });
  };

  // remove a layer from a dataset
  this.deleteLayer = function(lyr, dataset) {
    this.captureCatalogBefore({operation: 'deleteLayer'});
    // if deleting first target layer (selected in gui) -- switch to some other layer
    if (this.getActiveLayer().layer == lyr) {
      defaultTargets = [];
    }

    // remove layer from its dataset
    noteDatasetWillChange(dataset, {operation: 'deleteLayer', unit: 'layers'});
    dataset.layers.splice(dataset.layers.indexOf(lyr), 1);
    if (dataset.layers.length === 0) {
      removeDatasetRaw(dataset);
    }
    markDatasetChanged(dataset, {operation: 'deleteLayer', unit: 'layers'});

    // remove layer from defaultTargets
    defaultTargets = defaultTargets.filter(function(targ) {
      var i = targ.layers.indexOf(lyr);
      if (i == -1) return true;
      targ.layers.splice(i, 1);
      return targ.layers.length > 0;
    });
    this.markCatalogChanged({operation: 'deleteLayer'});
  };

  // @arg: a layer object or a test function
  this.findLayer = function(arg) {
    var test = typeof arg == 'function' ? arg : null;
    var found = null;
    this.forEachLayer(function(lyr, dataset) {
      if (test ? test(lyr, dataset) : lyr == arg) {
        found = layerObject(lyr, dataset);
      }
    });
    return found;
  };

  this.findCommandTargets = function(pattern, type) {
    if (!pattern) return this.getDefaultTargets() || [];
    return findCommandTargets(this.getLayers(), pattern, type);
  };

  this.findSingleLayer = function(pattern) {
    var matches = findMatchingLayers(this.getLayers(), pattern);
    if (matches.length > 1) {
      stop('Ambiguous pattern (multiple layers were matched):', pattern);
    }
    return matches[0] || null;
  };

  this.clear = function() {
    this.captureCatalogBefore({operation: 'clear'});
    datasets = [];
    defaultTargets = [];
    this.markCatalogChanged({operation: 'clear'});
  };

  this.removeDataset = function(dataset) {
    this.captureCatalogBefore({operation: 'removeDataset'});
    removeDatasetRaw(dataset);
    this.markCatalogChanged({operation: 'removeDataset'});
  };

  this.getDatasets = function() {
    return datasets;
  };

  this.getLayers = function() {
    var layers = [];
    this.forEachLayer(function(lyr, dataset) {
      layers.push(layerObject(lyr, dataset));
    });
    return layers;
  };

  this.addDataset = function(dataset) {
    this.setDefaultTarget(dataset.layers, dataset);
    return this;
  };

  this.addDatasets = function(datasets) {
    datasets.forEach(function(dataset) {
      this.addDataset(dataset);
    }, this);
  };

  this.findNextLayer = function(lyr) {
    var layers = this.getLayers(),
        idx = indexOfLayer(lyr, layers);
    return idx > -1 ? layers[(idx + 1) % layers.length] : null;
  };

  this.findPrevLayer = function(lyr) {
    var layers = this.getLayers(),
        idx = indexOfLayer(lyr, layers);
    return idx > -1 ? layers[(idx - 1 + layers.length) % layers.length] : null;
  };

  this.isEmpty = function() {
    return datasets.length === 0;
  };

  this.getDefaultTargets = function() {
    if (defaultTargets.length === 0 && !this.isEmpty()) {
      defaultTargets = [{dataset: datasets[0], layers: datasets[0].layers.slice(0, 1)}];
    }
    return defaultTargets;
  };

  this.setDefaultTarget = function(layers, dataset) {
    this.setDefaultTargets([{
      // Copy layers array, in case layers is a reference to dataset.layers.
      // This prevents layers that are added to the dataset inside a command from
      //  being added to the next command's target, e.g. debugging layers added
      //  by '-join unmatched unjoined'.
      layers: layers.concat(),
      dataset: dataset
    }]);
  };

  // arr: array of target objects {layers:[], dataset:{}}
  this.setDefaultTargets = function(arr) {
    if (targetsAreSame(defaultTargets, arr)) return;
    this.captureCatalogBefore({operation: 'setDefaultTargets'});
    arr.forEach(function(target) {
      if (datasets.indexOf(target.dataset) == -1) {
        datasets.push(target.dataset);
      }
    });
    defaultTargets = arr;
    this.markCatalogChanged({operation: 'setDefaultTargets'});
  };

  // should be in gui-model.js, moved here for testing
  this.getActiveLayer = function() {
    var targ = (this.getDefaultTargets() || [])[0];
    // var lyr = targ.layers[0];
    // Reasons to select the last layer of a multi-layer target:
    // * This layer was imported last
    // * This layer is displayed on top of other layers
    // * This layer is at the top of the layers list
    // * In TopoJSON input, it makes sense to think of the last object/layer
    //   as the topmost one -- it corresponds to the painter's algorithm and
    //   the way that objects are ordered in SVG.
    var lyr = targ?.layers[targ.layers.length - 1];
    return targ ? {layer: lyr, dataset: targ.dataset} : null;
  };

  function layerObject(lyr, dataset) {
    return {
      layer: lyr,
      dataset: dataset
    };
  }

  function targetsAreSame(a, b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].dataset != b[i].dataset || !layersAreSame(a[i].layers, b[i].layers)) {
        return false;
      }
    }
    return true;
  }

  function layersAreSame(a, b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  function indexOfLayer(lyr, layers) {
    var idx = -1;
    layers.forEach(function(o, i) {
      if (o.layer == lyr) idx = i;
    });
    return idx;
  }

  function removeDatasetRaw(dataset) {
    defaultTargets = defaultTargets.filter(function(targ) {
      return targ.dataset != dataset;
    });
    datasets = datasets.filter(function(d) {
      return d != dataset;
    });
  }
}

export function getFormattedLayerList(catalog) {
  var lines = [];
  catalog.forEachLayer(function(lyr, dataset, i) {
    lines.push('  [' + (i+1) + ']  ' + (lyr.name || '[unnamed]'));
  });
  return lines.length > 0 ? lines.join('\n') : '[none]';
}
