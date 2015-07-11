/* @requires mapshaper-gui-lib */

function Model() {
  var datasets = [],
      self = this,
      mode = null,
      editing;

  this.size = function() {
    return datasets.length;
  };

  this.addDataset = function(d) {
    datasets.push(d);
    this.dispatchEvent('add', {dataset: d});
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

  this.updated = function(o) {
    var e;
    if (editing) {
      e = utils.extend({}, editing, o);
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
        // console.log(">>> exit mode:", name);
        exit();
      }
      if (e.name == name) {
        // console.log(">>> enter mode:", name);
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

  this.setEditingLayer = function(lyr, dataset, opts) {
    if (editing && editing.layer == lyr) {
      return;
    }
    if (dataset.layers.indexOf(lyr) == -1) {
      error("Selected layer not found");
    }
    if (datasets.indexOf(dataset) == -1) {
      this.addDataset(dataset);
    }
    editing = {
      layer: lyr,
      dataset: dataset,
      opts: opts || {}
    };
    this.dispatchEvent('select', editing);
  };

}

utils.inherit(Model, EventDispatcher);
