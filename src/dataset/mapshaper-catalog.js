
import { findCommandTargets } from '../dataset/mapshaper-target-utils';

// Catalog contains zero or more multi-layer datasets
// One layer is always "active", corresponding to the currently selected
//   layer in the GUI or the current target in the CLI
export function Catalog() {
  var datasets = [],
      defaultTargets = [];// saved default command targets [{layers:[], dataset}, ...]

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
    // if deleting first target layer (selected in gui) -- switch to some other layer
    if (this.getActiveLayer().layer == lyr) {
      defaultTargets = [];
    }

    // remove layer from its dataset
    dataset.layers.splice(dataset.layers.indexOf(lyr), 1);
    if (dataset.layers.length === 0) {
      this.removeDataset(dataset);
    }

    // remove layer from defaultTargets
    defaultTargets = defaultTargets.filter(function(targ) {
      var i = targ.layers.indexOf(lyr);
      if (i == -1) return true;
      targ.layers.splice(i, 1);
      return targ.layers.length > 0;
    });
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
    if (pattern) {
      return findCommandTargets(this, pattern, type);
    }
    return this.getDefaultTargets() || [];
  };

  this.removeDataset = function(dataset) {
    defaultTargets = defaultTargets.filter(function(targ) {
      return targ.dataset != dataset;
    });
    datasets = datasets.filter(function(d) {
      return d != dataset;
    });
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
    if (datasets.indexOf(dataset) == -1) {
      datasets.push(dataset);
    }
    defaultTargets = [{
      // Copy layers array, in case layers is a reference to dataset.layers.
      // This prevents layers that are added to the dataset inside a command from
      //  being added to the next command's target, e.g. debugging layers added
      //  by '-join unmatched unjoined'.
      layers: layers.concat(),
      dataset: dataset
    }];
  };

  this.setDefaultTargets = function(arr) {
    defaultTargets = arr;
  };

  // should be in gui-model.js, moved here for testing
  this.getActiveLayer = function() {
    var targ = (this.getDefaultTargets() || [])[0];
    return targ ? {layer: targ.layers[0], dataset: targ.dataset} : null;
  };

  function layerObject(lyr, dataset) {
    return {
      layer: lyr,
      dataset: dataset
    };
  }

  function indexOfLayer(lyr, layers) {
    var idx = -1;
    layers.forEach(function(o, i) {
      if (o.layer == lyr) idx = i;
    });
    return idx;
  }
}

export function getFormattedLayerList(catalog) {
  var lines = [];
  catalog.forEachLayer(function(lyr, dataset, i) {
    lines.push('  [' + (i+1) + ']  ' + (lyr.name || '[unnamed]'));
  });
  return lines.length > 0 ? lines.join('\n') : '[none]';
}
