/* @require gui-lib */

function InteractionMode(gui) {
  var buttons, btn1, btn2, menu;

  var menus = {
    standard: ['info', 'data', 'selection'],
    labels: ['info', 'data', 'selection', 'labels', 'location'],
    points: ['info', 'data', 'selection', 'location']
  };

  // mode name -> menu text lookup
  var labels = {
    info: 'off', // no data editing, just popup
    data: 'data',
    labels: 'labels',
    location: 'coordinates',
    selection: 'selection'
  };

  // state variables
  var _editMode = 'info'; // one of labels{} keys
  var _active = false; // interaction on/off
  var _menuOpen = false;

  // Only render edit mode button/menu if this option is present
  if (gui.options.inspectorControl) {
    buttons = gui.buttons.addDoubleButton('#info-icon2', '#info-menu-icon');
    btn1 = buttons[0]; // [i] button
    btn2 = buttons[1]; // submenu button
    menu = El('div').addClass('nav-sub-menu').appendTo(btn2.node().parentNode);

    menu.on('click', function() {
      closeMenu(0); // dismiss menu by clicking off an active link
    });

    btn1.on('click', function() {
      gui.dispatchEvent('interaction_toggle');
    });

    btn2.on('click', function() {
      _menuOpen = true;
      updateMenu();
    });

    // triggered by a keyboard shortcut
    gui.on('interaction_toggle', function() {
      setActive(!_active);
    });

    updateVisibility();
  }

  this.getMode = getInteractionMode;

  this.setActive = setActive;

  this.setMode = function(mode) {
    // TODO: check that this mode is valid for the current dataset
    if (mode in labels) {
      setMode(mode);
    }
  };

  gui.model.on('update', function(e) {
    // change mode if active layer doesn't support the current mode
    updateCurrentMode();
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

  // if current editing mode is not available, switch to another mode
  function updateCurrentMode() {
    var modes = getAvailableModes();
    if (modes.indexOf(_editMode) == -1) {
      setMode(modes[0]);
    }
  }

  function updateMenu() {
    if (menu) {
      renderMenu(getAvailableModes());
      updateModeDisplay();
      updateVisibility();
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

  function setActive(active) {
    if (active != _active) {
      _active = !!active;
      _menuOpen = false; // make sure menu does not stay open when button toggles off
      updateVisibility();
      onModeChange();
    }
  }

  function onModeChange() {
    gui.dispatchEvent('interaction_mode_change', {mode: getInteractionMode()});
  }

  function updateVisibility() {
    if (!menu) return;
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
