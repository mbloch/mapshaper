
function SidebarButtons(gui) {
  var root = gui.container.findChild('.mshp-main-map');
  var buttons = El('div').addClass('nav-buttons').appendTo(root).hide();

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

  this.enable = function() {
    if (GUI.isActiveInstance(gui)) {
      buttons.show();
    }
    gui.on('active', buttons.show.bind(buttons));
    gui.on('inactive', buttons.hide.bind(buttons));
  };

  function initButton(iconRef) {
    var icon = El('body').findChild(iconRef).node().cloneNode(true);
    var btn = El('div')
      .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
    btn.appendChild(icon);
    if (icon.hasAttribute('id')) icon.removeAttribute('id');
    return btn;
  }
}
