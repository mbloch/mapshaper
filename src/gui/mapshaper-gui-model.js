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
    var layers = self.getLayers(),
        active = self.getActiveLayer(),
        idx = indexOfLayer(active.layer, layers),
        next;
    if (layers.length > 1 && idx > -1) {
      next = layers[(idx + 1) % layers.length];
      self.selectLayer(next.layer, next.dataset);
    }
  };

  self.selectPrevLayer = function() {
    var layers = self.getLayers(),
        active = self.getActiveLayer(),
        idx = indexOfLayer(active.layer, layers),
        prev;
    if (layers.length > 1 && idx > -1) {
      prev = layers[idx === 0 ? layers.length - 1 : idx - 1];
      self.selectLayer(prev.layer, prev.dataset);
    }
  };

  // layer panel (after deletion)
  self.findAnotherLayer = function(target) {
    var layers = self.getLayers(),
        found = null;
    if (layers.length > 1) {
      found = layers[0].layer == target ? layers[1] : layers[0];
    }
    return found;
  };

  return self;
}
