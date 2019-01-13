/* @require mapshaper-gui-lib */

function InteractionMode(gui, opts) {
  var buttons = gui.buttons.addDoubleButton('#info-icon2', '#info-menu-icon');
  var btn1 = buttons[0]; // [i] button
  var btn2 = buttons[1]; // submenu button
  var menu = El('div').addClass('nav-sub-menu').appendTo(btn2.node().parentNode);

  // all possible menu contents
  var menus = {
    standard: ['info', 'data'],
    labels: ['info', 'data', 'labels', 'location'],
    points: ['info', 'data', 'location']
  };

  // mode name -> menu text lookup
  var labels = {
    info: 'off', // no data editing, just popup
    data: 'data',
    labels: 'labels',
    location: 'coordinates'
  };

  // state variables
  var _editMode = 'info'; // one of labels{} keys
  var _active = false; // interaction on/off
  var _menuOpen = false;

  menu.on('click', function() {
    closeMenu(0); // dismiss menu by clicking off an active link
  });

  this.getMode = function() {
    return getInteractionMode();
  };

  this.setMode = function(mode) {
    // TODO: check that this mode is valid for the current dataset
    if (mode in labels) {
      setMode(mode);
    }
  };

  this.modeUsesDrag = function(name) {
    return name == 'location' || name == 'labels';
  };

  this.modeUsesClick = function(name) {
    return name == 'data' || name == 'info'; // click used to pin popup
  };

  updateMenu();

  btn1.on('click', function() {
    gui.dispatchEvent('interaction_toggle');
  });

  btn2.on('click', function() {
    _menuOpen = true;
    updateMenu();
  });

  gui.on('interaction_toggle', function() {
    _active = !_active;
    _menuOpen = false; // make sure menu does not stay open
    updateVisibility();
    onModeChange();
  });

  gui.model.on('update', function(e) {
    // need to update mode if active layer doesn't support the current mode
    if (_menuOpen) {
      updateMenu();
    }
  }, null, -1); // low priority?

  function getAvailableModes() {
    var o = gui.model.getActiveLayer();
    if (!o || !o.layer) {
      return menus.standard; // TODO: more sensible handling of missing layer
    }
    if (internal.layerHasLabels(o.layer)) {
      return menus.labels;
    }
    if (internal.layerHasPoints(o.layer)) {
      return menus.points;
    }
    return menus.standard;
  }

  function getInteractionMode() {
    return _active ? _editMode : 'off';
  }

  function renderMenu(modes) {
    menu.empty();
    El('div').addClass('nav-menu-item').text('interactive editing:').appendTo(menu);
    modes.forEach(function(mode) {
      var link = El('div').addClass('nav-menu-item nav-menu-link').attr('data-name', mode).text(labels[mode]).appendTo(menu);
      link.on('click', function(e) {
        if (_editMode != mode) {
          setMode(mode);
          closeMenu(500);
          e.stopPropagation();
        }
      });
    });
  }

  function updateMenu() {
    var modes = getAvailableModes();
    renderMenu(modes);
    updateModeDisplay();
    updateVisibility();
    // kludge: if current editing mode is not available, switch to another mode
    if (modes.indexOf(_editMode) == -1) {
      setMode(modes[0]);
    }
  }

  function openMenu() {
    _menuOpen = true;
    updateVisibility();
  }

  function closeMenu(delay) {
    setTimeout(function() {
      _menuOpen = false;
      updateVisibility();
    }, delay || 0);
  }

  function setMode(mode) {
    var changed = mode != _editMode;
    if (changed) {
      _editMode = mode;
      updateMenu();
      onModeChange();
    }
  }

  function onModeChange() {
    gui.dispatchEvent('interaction_mode_change', {mode: getInteractionMode()});
  }

  function updateVisibility() {
    // menu
    if (_menuOpen && _active) {
      menu.show();
    } else {
      menu.hide();
    }
    // button
    if (_menuOpen || !_active) {
      btn2.hide();
    } else {
      btn2.show();
    }
    btn1.classed('selected', _active);
  }

  function updateModeDisplay() {
    El.findAll('.nav-menu-item').forEach(function(el) {
      el = El(el);
      el.classed('selected', el.attr('data-name') == _editMode);
    });
  }

  function initLink(label) {
    return El('div').addClass('edit-mode-link').text(label);
  }

}
