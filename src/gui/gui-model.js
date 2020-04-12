import { EventDispatcher } from './gui-events';
import { internal, utils } from './gui-core';

export function Model(gui) {
  var self = new internal.Catalog();
  var deleteLayer = self.deleteLayer;
  utils.extend(self, EventDispatcher.prototype);

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
    self.dispatchEvent('update', utils.extend({flags: flags}, active));
  };

  self.selectLayer = function(lyr, dataset) {
    if (self.getActiveLayer().layer == lyr) return;
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
}
