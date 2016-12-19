
function Datasets() {
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
    layers.splice(layers.indexOf(lyr), 1);
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
