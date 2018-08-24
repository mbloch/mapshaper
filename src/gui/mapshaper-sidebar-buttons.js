
function SidebarButtons(gui) {
  var root = gui.container.findChild('.mshp-main-map');
  var buttons = El('div').addClass('nav-buttons').appendTo(root).hide();

  gui.on('active', buttons.show.bind(buttons));
  gui.on('inactive', buttons.hide.bind(buttons));

  // @iconRef: selector for an (svg) button icon
  this.addButton = function(iconRef) {
    var icon = El('body').findChild(iconRef).node().cloneNode(true);
    var btn = El('div').addClass('nav-btn')
      .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
    btn.appendChild(icon);
    if (icon.hasAttribute('id')) icon.removeAttribute('id');
    btn.appendTo(buttons);
    return btn;
  };
}
