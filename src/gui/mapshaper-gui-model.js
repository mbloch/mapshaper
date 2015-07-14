/* @requires mapshaper-gui-lib */

function Model() {
  var datasets = [],
      self = this,
      mode = null,
      editing;

  this.size = function() {
    return datasets.length;
  };

  this.removeDataset = function(target) {
    if (target == (editing && editing.dataset)) {
      error("Can't remove dataset while editing");
    }
    datasets = datasets.filter(function(d) {
      return d != target;
    });
    this.dispatchEvent('delete', {dataset: target});
  };

  this.getDatasets = function() {
    return datasets;
  };

  function setEditingLayer(lyr, dataset) {
    if (editing && editing.layer == lyr) {
      return;
    }
    if (dataset.layers.indexOf(lyr) == -1) {
      error("Selected layer not found");
    }
    if (datasets.indexOf(dataset) == -1) {
      datasets.push(dataset);
    }
    editing = {
      layer: lyr,
      dataset: dataset
    };
  }

  this.updated = function(flags, lyr, dataset) {
    var e;
    flags = flags || {};
    if (lyr && dataset && (!editing || editing.lyr != lyr)) {
      setEditingLayer(lyr, dataset);
      flags.select = true;
    }
    if (editing) {
      if (flags.select) {
        this.dispatchEvent('select', editing);
      }
      e = utils.extend({flags: flags}, editing);
      this.dispatchEvent('update', e);
    }
  };

  this.getEditingLayer = function() {
    return editing || {};
  };

  // return a function to trigger this mode
  this.addMode = function(name, enter, exit) {
    this.on('mode', function(e) {
      if (e.prev == name) {
        exit();
      }
      if (e.name == name) {
        enter();
      }
    });
  };

  this.addMode(null, function() {}, function() {}); // null mode

  this.clearMode = function() {
    self.enterMode(null);
  };

  this.enterMode = function(next) {
    var prev = mode;
    // console.log(">>> enterMode() prev:", prev, "next:", next);
    if (next != prev) {
      mode = next;
      self.dispatchEvent('mode', {name: next, prev: prev});
    }
  };

}

utils.inherit(Model, EventDispatcher);
