import { EventDispatcher } from './gui-events';
import { internal, utils } from './gui-core';
import { showNewLayers, getLayerMenuGroups } from './gui-layer-utils';

export function Model(gui) {
  var self = new internal.Catalog();
  var deleteLayer = self.deleteLayer;
  var setDefaultTargets = self.setDefaultTargets;
  utils.extend(self, EventDispatcher.prototype);

  // A map frame (and its furniture) is composition state, not editable content. Commands may
  // explicitly target it, but it must not replace the GUI's active content
  // layer or become the implicit target of the next console command.
  self.setDefaultTargets = function(targets, opts) {
    var previousContent = getContentTargets(self.getDefaultTargets());
    var requestedContent = getContentTargets(targets);
    setDefaultTargets.call(self, targets, opts);
    if (countTargetLayers(requestedContent) < countTargetLayers(targets)) {
      var contentTargets = requestedContent.length ?
        requestedContent : relocateTargets(previousContent);
      if (!contentTargets.length) {
        contentTargets = getFirstContentTarget();
      }
      if (contentTargets.length) {
        setDefaultTargets.call(self, contentTargets);
      }
    }
  };

  // override Catalog method (so -drop command will work in web console)
  self.deleteLayer = function(lyr, dataset) {
    var active, flags;
    deleteLayer.call(self, lyr, dataset);
    if (self.isEmpty()) {
      // refresh browser if deleted layer was the last layer
      window.location.href = window.location.href.toString();
    } else {
      // trigger event to update layer list and, if needed, the map view
      flags = {};
      active = self.getActiveLayer();
      if (active.layer != lyr) {
        flags.select = true;
      }
      internal.cleanupArcs(active.dataset);
      if (internal.layerHasPaths(lyr)) {
        flags.arc_count = true; // looks like a kludge, try to remove
      }
      self.updated(flags, active.layer, active.dataset);
    }
  };

  // The frame shown by the map, preview mode and the frame tools: the frame of
  // the selected layer. Null in the unframed view. This is GUI state, derived
  // from the selection so that it needs no undo or session handling of its
  // own; core code resolves frames from datasets instead.
  self.getActiveFrame = function() {
    var active = self.getActiveLayer();
    return active ? internal.getDisplayFrameForDataset(self, active.dataset) : null;
  };

  self.updated = function(flags) {
    var targets = self.getDefaultTargets();
    var active, relocated;
    if (targetsAreStale(targets)) {
      relocated = relocateTargets(targets);
      setDefaultTargets.call(self, relocated.length ? relocated : getFirstContentTarget());
      targets = self.getDefaultTargets();
    }
    active = self.getActiveLayer();
    if (internal.countTargetLayers(targets) > 1) {
      self.setDefaultTarget([active.layer], active.dataset);
      gui.session.setTargetLayer(active.layer); // add -target command to target single layer
    }
    // Before anything hears of the update, so that the map draws a layer that
    // has just arrived along with the ones already showing.
    showNewLayers(self.getLayers());
    if (flags.select) {
      self.dispatchEvent('select', active);
    }
    self.dispatchEvent('update', {flags: flags});
  };

  self.selectLayer = function(lyr, dataset) {
    if (self.getActiveLayer().layer == lyr) {
      return;
    }
    self.setDefaultTarget([lyr], dataset);
    // selection_only: nothing but the selection changed, unlike the other
    // updates with the select flag, which follow edits
    self.updated({select: true, selection_only: true});
    gui.session.setTargetLayer(lyr);
  };

  // Layers are stepped through in the layers panel's order, which dragging
  // changes without changing the catalog's order. The next layer is the one
  // above in the panel, as it was before layers could be dragged.
  self.selectNextLayer = function() {
    selectMenuLayer(-1);
  };

  self.selectPrevLayer = function() {
    selectMenuLayer(1);
  };

  function selectMenuLayer(step) {
    var groups = getLayerMenuGroups(self);
    var layers = groups.frames.reduce(function(memo, g) {
      return memo.concat(g.members);
    }, groups.unframed);
    var active = self.getActiveLayer();
    var i = layers.findIndex(function(o) { return active && o.layer == active.layer; });
    var o = layers[(i + step + layers.length) % layers.length];
    if (o) self.selectLayer(o.layer, o.dataset);
  }

  return self;

  function getContentTargets(targets) {
    return (targets || []).map(function(target) {
      return {
        dataset: target.dataset,
        layers: target.layers.filter(function(lyr) {
          return !internal.isFrameComponentLayer(lyr, target.dataset);
        })
      };
    }).filter(function(target) {
      return target.layers.length > 0;
    });
  }

  // A command can move a layer to another dataset (a move into or out of a
  // frame splits datasets and joins them), so a target from before the command
  // is looked up again. Layers that are gone are dropped.
  function relocateTargets(targets) {
    var relocated = [];
    targets.forEach(function(target) {
      target.layers.forEach(function(lyr) {
        var o = self.findLayer(lyr);
        var match = o && relocated.find(function(t) { return t.dataset == o.dataset; });
        if (match) {
          match.layers.push(lyr);
        } else if (o) {
          relocated.push({dataset: o.dataset, layers: [lyr]});
        }
      });
    });
    return relocated;
  }

  // -frame sets its targets before it splits datasets, so a target can name a
  // layer that has since moved to another dataset
  function targetsAreStale(targets) {
    return targets.some(function(target) {
      return target.layers.some(function(lyr) {
        return !target.dataset.layers.includes(lyr);
      });
    });
  }

  function getFirstContentTarget() {
    var target = self.getLayers().find(function(o) {
      return !internal.isFrameComponentLayer(o.layer, o.dataset);
    });
    return target ? [{dataset: target.dataset, layers: [target.layer]}] : [];
  }

  function countTargetLayers(targets) {
    return (targets || []).reduce(function(sum, target) {
      return sum + target.layers.length;
    }, 0);
  }
}
