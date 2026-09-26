// The buttons that open and close the sidebar panels: an icon strip on the
// map while the sidebar is closed, and a strip of toggles at the top of the
// sidebar while it is open. Each button toggles its own panel, so both panels
// can be open at once.
export function SidebarTabs(gui) {
  var buttons = gui.container.findChildren('.sidebar-tab, .sidebar-strip-btn');
  var hideBtn = gui.container.findChild('.sidebar-hide-btn');

  buttons.forEach(function(btn) {
    var panel = btn.attr('data-panel');
    btn.on('click', function() {
      gui.toggleSidebarPanel(panel);
    });
    onKeyboardActivate(btn, function() {
      gui.toggleSidebarPanel(panel);
    });
  });

  hideBtn.on('click', hideSidebar);
  onKeyboardActivate(hideBtn, hideSidebar);

  gui.on('sidebar', function(e) {
    buttons.forEach(function(btn) {
      var open = e.panels.includes(btn.attr('data-panel'));
      btn.classed('active', open).attr('aria-expanded', String(open));
    });
  });

  function hideSidebar() {
    gui.setSidebarPanels(null);
  }

  function onKeyboardActivate(btn, action) {
    btn.on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        e.stopPropagation();
        action();
      }
    });
  }
}
