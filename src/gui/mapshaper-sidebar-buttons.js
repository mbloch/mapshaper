
function SidebarButtons(gui) {
  var root = gui.container.findChild('.mshp-main-map');
  var buttons = El('div').addClass('nav-buttons').appendTo(root).hide();
  var _hidden = false;
  gui.on('active', updateVisibility);
  gui.on('inactive', updateVisibility);

  // @iconRef: selector for an (svg) button icon
  this.addButton = function(iconRef) {
    var btn = initButton(iconRef).addClass('nav-btn');
    btn.appendTo(buttons);
    return btn;
  };

  this.addDoubleButton = function(icon1Ref, icon2Ref) {
    var btn1 = initButton(icon1Ref).addClass('nav-btn');
    var btn2 = initButton(icon2Ref).addClass('nav-sub-btn');
    var wrapper = El('div').addClass('nav-btn-wrapper');
    btn1.appendTo(wrapper);
    btn2.appendTo(wrapper);
    wrapper.appendTo(buttons);
    return [btn1, btn2];
  };

  this.show = function() {
    _hidden = false;
    updateVisibility();
  };

  this.hide = function() {
    _hidden = true;
    updateVisibility();
  };

  function updateVisibility() {
    if (GUI.isActiveInstance(gui) && !_hidden) {
      buttons.show();
    } else {
      buttons.hide();
    }
  }

  function initButton(iconRef) {
    var icon = El('body').findChild(iconRef).node().cloneNode(true);
    var btn = El('div')
      .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
    btn.appendChild(icon);
    if (icon.hasAttribute('id')) icon.removeAttribute('id');
    return btn;
  }
}
