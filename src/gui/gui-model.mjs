import { EventDispatcher } from './gui-events';
import { internal, utils } from './gui-core';

export function Model(gui) {
  var self = new internal.Catalog();
  var deleteLayer = self.deleteLayer;
  var setDefaultTargets = self.setDefaultTargets;
  utils.extend(self, EventDispatcher.prototype);

  // A map frame is composition state, not editable content. Commands may
  // explicitly target it, but it must not replace the GUI's active content
  // layer or become the implicit target of the next console command.
  self.setDefaultTargets = function(targets, opts) {
    var previousContent = getContentTargets(self.getDefaultTargets());
    var requestedContent = getContentTargets(targets);
    setDefaultTargets.call(self, targets, opts);
    if (countTargetLayers(requestedContent) < countTargetLayers(targets)) {
      var contentTargets = requestedContent.length ?
        requestedContent : previousContent;
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

  self.updated = function(flags) {
    var targets = self.getDefaultTargets();
    var active = self.getActiveLayer();
    if (internal.countTargetLayers(targets) > 1) {
      self.setDefaultTarget([active.layer], active.dataset);
      gui.session.setTargetLayer(active.layer); // add -target command to target single layer
    }
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
    self.updated({select: true});
    gui.session.setTargetLayer(lyr);
  };

  self.selectNextLayer = function() {
    var next = self.findNextLayer(self.getActiveLayer().layer);
    if (next) self.selectLayer(next.layer, next.dataset);
  };

  self.selectPrevLayer = function() {
    var prev = self.findPrevLayer(self.getActiveLayer().layer);
    if (prev) self.selectLayer(prev.layer, prev.dataset);
  };

  return self;

  function getContentTargets(targets) {
    return (targets || []).map(function(target) {
      return {
        dataset: target.dataset,
        layers: target.layers.filter(function(lyr) {
          return !internal.isFrameLayer(lyr, target.dataset.arcs);
        })
      };
    }).filter(function(target) {
      return target.layers.length > 0;
    });
  }

  function getFirstContentTarget() {
    var target = self.getLayers().find(function(o) {
      return !internal.isFrameLayer(o.layer, o.dataset.arcs);
    });
    return target ? [{dataset: target.dataset, layers: [target.layer]}] : [];
  }

  function countTargetLayers(targets) {
    return (targets || []).reduce(function(sum, target) {
      return sum + target.layers.length;
    }, 0);
  }
}
