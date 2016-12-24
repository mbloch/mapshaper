
MapShaper.getFormattedLayerList = function(catalog) {
  var lines = [];
  catalog.forEachLayer(function(lyr, i) {
    lines.push('  [' + i + ']  ' + (lyr.name || '[unnamed]'));
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

// @pattern is a layer identifier or a comma-sep. list of identifiers
// an identifier is a literal name, a name containing "*" wildcard or
// a 0-based array index
MapShaper.getTargetMatch = function(pattern) {
  var tests = pattern.split(',').map(MapShaper.getLayerMatch);
  return function(lyr, i) {
    return utils.some(tests, function(test) {
      return test(lyr, i);
    });
  };
};

function Catalog() {
  var datasets = [],
      active;

  this.forEachLayer = function(cb) {
    var i = 0;
    datasets.forEach(function(dataset) {
      dataset.layers.forEach(function(lyr) {
        cb(lyr, dataset, i++);
      });
    });
  };

  this.deleteLayer = function(lyr, dataset) {
    var layers = dataset.layers;
    var other = this.findAnotherLayer(lyr);
    layers.splice(layers.indexOf(lyr), 1);
    if (active.layer == lyr) {
      active = null;
      if (other) {
        this.setActiveLayer(other.layer, other.dataset);
      }
    }
    if (layers.length === 0) {
      this.removeDataset(dataset);
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
    var targets = [];
    if (pattern) {
      datasets.forEach(function(dataset) {
        var layers = MapShaper.findMatchingLayers(dataset.layers, pattern);
        if (layers.length > 0) {
          targets.push({
            layers: layers,
            dataset: dataset
          });
        }
      });
    } else if (active) {
      targets.push({
        layers: [active.layer],
        dataset: active.dataset
      });
    }
    return targets;
  };

  this.removeDataset = function(target) {
    if (target == (active && active.dataset)) {
      error("Can't remove dataset while active");
    }
    datasets = datasets.filter(function(d) {
      return d != target;
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
    datasets.push(dataset);
    this.setActiveLayer(dataset.layers[0], dataset);
    return this;
  };

  this.findAnotherLayer = function(target) {
    var layers = this.getLayers(),
        found = null;
    if (layers.length > 1) {
      found = layers[0].layer == target ? layers[1] : layers[0];
    }
    return found;
  };

  this.getActiveLayer = function() {
    return active || null;
  };

  this.setActiveLayer = function(lyr, dataset) {
    if (active && active.layer == lyr) {
      return;
    }
    if (dataset.layers.indexOf(lyr) == -1) {
      error("Selected layer not found");
    }
    if (datasets.indexOf(dataset) == -1) {
      datasets.push(dataset);
    }
    active = layerObject(lyr, dataset);
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
