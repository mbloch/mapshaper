import { El } from './gui-el';
import { internal } from './gui-core';

export function InteractionMode(gui) {

  var menus = {
    standard: ['info', 'data', 'selection', 'box', 'off'],
    table: ['info', 'data', 'selection', 'off'],
    labels: ['info', 'data', 'selection', 'box', 'labels', 'location', 'off'],
    points: ['info', 'data', 'selection', 'box', 'location', 'off']
  };

  var prompts = {
    box: 'Shift-drag to draw a box',
    data: 'Click-select features to edit their attributes',
    selection: 'Click-select or shift-drag to select features'
  };

  // mode name -> menu text lookup
  var labels = {
    info: 'inspect attributes',
    box: 'shift-drag box tool',
    data: 'edit attributes',
    labels: 'position labels',
    location: 'drag points',
    selection: 'select features',
    off: 'turn off'
  };
  var btn, menu, tab;
  var _menuTimeout;

  // state variables
  var _editMode = 'off';
  var _prevMode = 'info'; // stored mode for re-opening menu
  var _menuOpen = false;

  // Only render edit mode button/menu if this option is present
  if (gui.options.inspectorControl) {
    btn = gui.buttons.addButton('#pointer-icon');
    menu = El('div').addClass('nav-sub-menu').appendTo(btn.node());

    // tab = gui.buttons.initButton('#info-menu-icon').addClass('nav-sub-btn').appendTo(btn.node());

    btn.on('mouseleave', function() {
      btn.removeClass('hover');
      // tab.hide();
      autoClose();
    });

    btn.on('mouseenter', function() {
      btn.addClass('hover');
      if (_editMode != 'off') {
        clearTimeout(_menuTimeout);
        openMenu();
        // tab.show();
      }
    });

    // tab.on('mouseenter', openMenu);

    btn.on('click', function(e) {
      if (active()) {
        setMode('off');
        closeMenu();
      } else if (_menuOpen) {
        closeMenu();
      } else {
        if (_editMode == 'off') {
          // turn on interaction when menu opens
          // (could this be confusing?)
          setMode(openWithMode());
        }
        clearTimeout(_menuTimeout);
        openMenu();
      }
      e.stopPropagation();
    });
  }

  this.turnOff = function() {
    setMode('off');
  };

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
    if (!internal.layerHasGeometry(o.layer)) {
      return menus.table;
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
          closeMenu(mode == 'off' ? 200 : 350);
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

  function openWithMode() {
    if (getAvailableModes().indexOf(_prevMode) > -1) {
      return _prevMode;
    }
    return 'info';
  }

  function openMenu() {
    clearTimeout(_menuTimeout);
    // if (!_menuOpen && _editMode != 'off') {
    if (!_menuOpen) {
      // tab.hide();
      _menuOpen = true;
      updateAppearance();
    }
  }

  function autoClose() {
    clearTimeout(_menuTimeout);
    _menuTimeout = setTimeout(closeMenu, 300);
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
    // if (mode == 'off') tab.hide();
    if (changed) {
      menu.classed('active', mode != 'off');
      if (_editMode != 'off') {
        _prevMode = _editMode; // save edit mode so we can re-open control with the same mode
      }
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
      btn.addClass('open');
      renderMenu();
    } else {
      btn.removeClass('hover');
      btn.removeClass('open');
      // menu.hide();
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
