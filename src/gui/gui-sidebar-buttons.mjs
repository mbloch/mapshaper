import { El } from './gui-el';
import { GUI } from './gui-lib';

export function SidebarButtons(gui) {
  var root = gui.container.findChild('.mshp-main-map');
  var buttons = El('div').addClass('nav-buttons').appendTo(root).hide();
  var _hidden = true;
  gui.on('active', updateVisibility);
  gui.on('inactive', updateVisibility);

  // @iconRef: selector for an (svg) button icon
  this.addButton = function(iconRef) {
    var btn = initButton(iconRef).addClass('nav-btn');
    btn.appendTo(buttons);
    return btn;
  };

  this.show = function() {
    _hidden = false;
    updateVisibility();
  };

  this.hide = function() {
    _hidden = true;
    updateVisibility();
  };

  var initButton = this.initButton = function(iconRef) {
    var icon = El('body').findChild(iconRef).node().cloneNode(true);
    var btn = El('div')
      .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
    btn.appendChild(icon);
    if (icon.hasAttribute('id')) icon.removeAttribute('id');
    return btn;
  };

  function updateVisibility() {
    if (GUI.isActiveInstance(gui) && !_hidden) {
      buttons.show();
    } else {
      buttons.hide();
    }
  }
}
