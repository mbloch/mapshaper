/* @requires mapshaper-common, mapshaper-target-utils */

// Catalog contains zero or more multi-layer datasets
// One layer is always "active", corresponding to the currently selected
//   layer in the GUI or the current target in the CLI
function Catalog() {
  var datasets = [],
      defaultTarget = null; // saved default command target {layers:[], dataset}

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
    var targ = this.getDefaultTarget();

    // remove layer from its dataset
    dataset.layers.splice(dataset.layers.indexOf(lyr), 1);
    if (dataset.layers.length === 0) {
      this.removeDataset(dataset);
    }
    if (this.isEmpty()) {
      defaultTarget = null;
    } else if (targ.layers[0] == lyr) {
      // deleting first target layer (selected in gui) -- switch to some other layer
      defaultTarget = null;
    } else if (targ.layers.indexOf(lyr) > -1) {
      // deleted layer is targeted -- update target
      targ.layers.splice(targ.layers.indexOf(lyr), 1);
    } else {
      // deleted layer is not a targeted layer, target not updated
    }
  };

  this.findLayer = function(target) {
    var found = null;
    this.forEachLayer(function(lyr, dataset) {
      if (lyr == target) {
        found = layerObject(lyr, dataset);
      }
    });
    return found;
  };

  this.findCommandTargets = function(pattern, type) {
    var targ;
    if (pattern) {
      return internal.findCommandTargets(this, pattern, type);
    }
    targ = this.getDefaultTarget();
    return targ ? [targ] : [];
  };

  this.removeDataset = function(dataset) {
    if (defaultTarget && defaultTarget.dataset == dataset) {
      defaultTarget = null;
    }
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

  this.findAnotherLayer = function(lyr) {
    var layers = this.getLayers(),
        found = null;
    if (layers.length > 0) {
      found = layers[0].layer == lyr ? layers[1] : layers[0];
    }
    return found;
  };

  this.isEmpty = function() {
    return datasets.length === 0;
  };

  this.getDefaultTarget = function() {
    var tmp;
    if (!defaultTarget && !this.isEmpty()) {
      tmp = this.findAnotherLayer(null);
      defaultTarget = {dataset: tmp.dataset, layers: [tmp.layer]};
    }
    return defaultTarget;
  };

  this.setDefaultTarget = function(layers, dataset) {
    if (datasets.indexOf(dataset) == -1) {
      datasets.push(dataset);
    }
    defaultTarget = {
      layers: layers,
      dataset: dataset
    };
  };

  // should be in mapshaper-gui-model.js, moved here for testing
  this.getActiveLayer = function() {
    var targ = this.getDefaultTarget();
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

internal.getFormattedLayerList = function(catalog) {
  var lines = [];
  catalog.forEachLayer(function(lyr, dataset, i) {
    lines.push('  [' + (i+1) + ']  ' + (lyr.name || '[unnamed]'));
  });
  return lines.length > 0 ? lines.join('\n') : '[none]';
};
