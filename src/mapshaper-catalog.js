/* @requires mapshaper-common */

// Catalog contains zero or more multi-layer datasets
// One layer is always "active", corresponding to the currently selected
//   layer in the GUI or the current target in the CLI
function Catalog() {
  var datasets = [],
      target;

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
    var targ = this.getDefaultTarget(),
        other;

    // remove layer from its dataset
    dataset.layers.splice(dataset.layers.indexOf(lyr), 1);

    if (dataset.layers.length === 0) {
      this.removeDataset(dataset);
    }

    if (this.isEmpty()) {
      target = null;
    } else if (targ.layers[0] == lyr) {
      // deleting first target layer (selected in gui) -- switch to some other layer
      other = this.findAnotherLayer(lyr);
      this.setDefaultTarget([other.layer], other.dataset);
    } else if (targ.layers.indexOf(lyr) > -1) {
      // deleted layer is targeted -- update target
      targ.layers.splice(targ.layers.indexOf(lyr), 1);
      this.setDefaultTarget(targ.layers, targ.dataset);
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

  this.findCommandTargets = function(pattern) {
    var targets = [], test, i;
    if (pattern) {
      i = 0;
      test = MapShaper.getTargetMatch(pattern);
      datasets.forEach(function(dataset) {
        var layers = dataset.layers.filter(function(lyr) {
          return test(lyr, i++);
        });
        if (layers.length > 0) {
          targets.push({
            layers: layers,
            dataset: dataset
          });
        }
      });
    } else if (target) {
      targets.push(target);
    }
    return targets;
  };

  this.removeDataset = function(dataset) {
    if (target && target.dataset == dataset) {
      target = null;
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

  this.findAnotherLayer = function(target) {
    var layers = this.getLayers(),
        found = null;
    if (layers.length > 0) {
      found = layers[0].layer == target ? layers[1] : layers[0];
    }
    return found;
  };

  this.isEmpty = function() {
    return datasets.length === 0;
  };

  this.getDefaultTarget = function() {return target || null;};

  this.setDefaultTarget = function(layers, dataset) {
    if (datasets.indexOf(dataset) == -1) {
      datasets.push(dataset);
    }
    target = {
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


MapShaper.getFormattedLayerList = function(catalog) {
  var lines = [];
  catalog.forEachLayer(function(lyr, dataset, i) {
    lines.push('  [' + (i+1) + ']  ' + (lyr.name || '[unnamed]'));
  });
  return lines.length > 0 ? lines.join('\n') : '[none]';
};

MapShaper.getLayerMatch = function(pattern) {
  var isIndex = utils.isInteger(Number(pattern));
  var nameRxp = isIndex ? null : utils.wildcardToRegExp(pattern);
  return function(lyr, i) {
    return isIndex ? String(i) == pattern : nameRxp.test(lyr.name || '');
  };
};

// @pattern is a layer identifier or a comma-sep. list of identifiers.
// An identifier is a literal name, a pattern containing "*" wildcard or
// a 1-based index (1..n)
MapShaper.getTargetMatch = function(pattern) {
  var tests = pattern.split(',').map(MapShaper.getLayerMatch);
  return function(lyr, i) {
    return utils.some(tests, function(test) {
      return test(lyr, i + 1); // layers are 1-indexed
    });
  };
};
