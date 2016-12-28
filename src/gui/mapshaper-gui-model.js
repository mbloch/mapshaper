/* @requires mapshaper-gui-lib */

function Model() {
  var self = new api.internal.Catalog();
  utils.extend(self, EventDispatcher.prototype);

  self.updated = function(flags, lyr, dataset) {
    var active = self.getActiveLayer();
    if (lyr && dataset && (!active || active.layer != lyr)) {
      self.setActiveLayer(lyr, dataset);
      active = self.getActiveLayer();
      flags.select = true;
    }
    if (flags.select) {
      self.dispatchEvent('select', active);
    }
    self.dispatchEvent('update', utils.extend({flags: flags}, active));
  };

  self.selectLayer = function(lyr, dataset) {
    self.updated({select: true}, lyr, dataset);
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
