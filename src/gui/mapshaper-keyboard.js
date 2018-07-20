

function KeyboardEvents(gui) {
  var self = this;
  document.addEventListener('keydown', function(e) {
    if (!GUI.isActiveInstance(gui)) return;
    self.dispatchEvent('keydown', {originalEvent: e});
  });
}

utils.inherit(KeyboardEvents, EventDispatcher);
