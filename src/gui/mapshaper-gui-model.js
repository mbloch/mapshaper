/* @requires mapshaper-gui-lib */

function Model() {
  var datasets = [],
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

  this.updated = function() {
    this.dispatchEvent('update', editing);
  };

  this.setSimplifyPct = function(pct) {
    if (editing) {
      editing.simplify_pct = pct;
      this.updated();
    }
  };

  this.getEditingLayer = function() {
    return editing;
  };

  this.setEditingLayer = function(lyr, dataset, opts) {
    // TODO: how to handle repeat selection
    if (dataset.layers.indexOf(lyr) == -1) {
      error("Selected layer not found");
    }
    if (datasets.indexOf(dataset) == -1) {
      this.addDataset(dataset);
    }
    editing = {
      layer: lyr,
      dataset: dataset,
      opts: opts,
      simplify_pct: dataset.arcs ? dataset.arcs.getRetainedPct() : 1
    };
    this.dispatchEvent('select', editing);
  };

}

utils.inherit(Model, EventDispatcher);
