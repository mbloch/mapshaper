/* @require gui-lib */

function InteractionMode(gui) {

  var menus = {
    standard: ['info', 'data', 'selection'],
    labels: ['info', 'data', 'selection', 'labels', 'location'],
    points: ['info', 'data', 'selection', 'location']
  };

  // mode name -> menu text lookup
  var labels = {
    info: 'inspect attributes',
    data: 'edit attributes',
    labels: 'position labels',
    location: 'drag points',
    selection: 'select features'
  };
  var btn, menu;
  var _menuTimeout;

  // state variables
  var _editMode = 'off';
  var _menuOpen = false;

  // Only render edit mode button/menu if this option is present
  if (gui.options.inspectorControl) {
    btn = gui.buttons.addButton('#pointer-icon');
    menu = El('div').addClass('nav-sub-menu').appendTo(btn.node());

    btn.on('mouseleave', autoClose);
    btn.on('mouseenter', function() {
      clearTimeout(_menuTimeout);
    });

    btn.on('click', function(e) {
      if (active()) {
        setMode('off');
        closeMenu();
      } else {
        if (_editMode == 'off') {
          setMode('info');
        }
        clearTimeout(_menuTimeout);
        openMenu();
      }
      e.stopPropagation();
    });
  }

  this.getMode = getInteractionMode;

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
      renderMenu();
    }
  }, null, -1); // low priority?

  function active() {
    return _editMode && _editMode != 'off';
  }

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
    return active() ? _editMode : 'off';
  }

  function renderMenu() {
    if (!menu) return;
    var modes = getAvailableModes();
    menu.empty();
    modes.forEach(function(mode) {
      var link = El('div').addClass('nav-menu-item').attr('data-name', mode).text(labels[mode]).appendTo(menu);
      link.on('click', function(e) {
        if (_editMode == mode) {
          closeMenu();
        } else if (_editMode != mode) {
          setMode(mode);
          closeMenu(400);
        }
        e.stopPropagation();
      });
    });
    updateModeDisplay();
  }

  // if current editing mode is not available, switch to another mode
  function updateCurrentMode() {
    var modes = getAvailableModes();
    if (modes.indexOf(_editMode) == -1) {
      setMode('off');
    }
  }

  function openMenu() {
    _menuOpen = true;
    updateAppearance();
  }

  function autoClose() {
    clearTimeout(_menuTimeout);
    _menuTimeout = setTimeout(closeMenu, 800);
  }

  function closeMenu(delay) {
    if (!_menuOpen) return;
    _menuOpen = false;
    setTimeout(function() {
      _menuOpen = false;
      updateAppearance();
    }, delay || 0);
  }

  function setMode(mode) {
    var changed = mode != _editMode;
    if (changed) {
      _editMode = mode;
      onModeChange();
      updateAppearance();
    }
  }

  function onModeChange() {
    gui.dispatchEvent('interaction_mode_change', {mode: getInteractionMode()});
  }

  function updateAppearance() {
    if (!menu) return;
    if (_menuOpen) {
      menu.show();
      renderMenu();
    } else {
      menu.hide();
    }
    btn.classed('selected', active() || _menuOpen);
  }

  function updateModeDisplay() {
    El.findAll('.nav-menu-item').forEach(function(el) {
      el = El(el);
      el.classed('selected', el.attr('data-name') == _editMode);
    });
  }
}
