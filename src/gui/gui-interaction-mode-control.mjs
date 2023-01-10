import { El } from './gui-el';
import { internal } from './gui-core';

export function InteractionMode(gui) {

  // TODO: finish this list
  // var modes = [{
  //   name: 'info',
  //   label: 'inspect features',
  //   selection: true,
  //   popup: true,
  //   types: ['standard', 'polygons', 'lines', 'labels', 'points']
  // }, {
  //   name: 'selection',
  //   label: 'select features',
  //   selection: true,
  //   popup: true,
  //   types: ['standard', 'polygons', 'lines', 'table', 'labels']
  // }]

  var menus = {
    standard: ['info', 'selection', 'data', 'box'],
    polygons: ['info', 'selection', 'data', 'box', 'vertices'],
    lines: ['info', 'selection', 'data', 'box', 'vertices'],
    table: ['info', 'selection', 'data'],
    labels: ['info', 'selection', 'data', 'box', 'labels', 'location'],
    // points: ['info', 'selection', 'data', 'box', 'location', 'add-points']
    points: ['info', 'selection', 'data', 'box', 'location']
  };

  var prompts = {
    box: 'Shift-drag to draw a box',
    data: 'Click-select features to edit their attributes',
    selection: 'Click-select or shift-drag to select features'
  };

  // mode name -> menu text lookup
  var labels = {
    info: 'inspect features',
    box: 'shift-drag box tool',
    data: 'edit attributes',
    labels: 'position labels',
    location: 'drag points',
    vertices: 'edit vertices',
    selection: 'select features',
    'add-points': 'add points',
    off: 'turn off'
  };
  var btn, menu;
  var _menuTimeout;

  // state variables
  var _editMode = 'off';
  var _menuOpen = false;

  // Only render edit mode button/menu if this option is present
  if (gui.options.inspectorControl) {
    // use z-index so the menu is over other buttons
    btn = gui.buttons.addButton('#pointer-icon').addClass('menu-btn pointer-btn'),
    menu = El('div').addClass('nav-sub-menu').appendTo(btn.node());

    btn.on('mouseleave', function() {
      if (!_menuOpen) {
        btn.removeClass('hover');
      } else {
        closeMenu(200);
      }
    });

    btn.on('mouseenter', function() {
      btn.addClass('hover');
      if (_menuOpen) {
        clearTimeout(_menuTimeout); // prevent timed closing
      } else {
        openMenu();
      }
      // if (_editMode != 'off') {
      //   openMenu();
      // }
    });

    btn.on('click', function(e) {
      if (active()) {
        setMode('off');
        closeMenu();
      } else if (_menuOpen) {
        setMode('info'); // select info (inspect) as the default
        // closeMenu(350);
      } else {
        openMenu();
      }
      e.stopPropagation();
    });
  }

  this.turnOff = function() {
    setMode('off');
  };

  this.modeUsesSelection = function(mode) {
    return ['info', 'selection', 'data', 'labels', 'location', 'vertices'].includes(mode);
  };

  this.modeUsesPopup = function(mode) {
    return ['info', 'selection', 'data', 'box', 'labels', 'location'].includes(mode);
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
    if (internal.layerHasPaths(o.layer) && o.layer.geometry_type == 'polyline') {
      return menus.lines;
    }
    if (internal.layerHasPaths(o.layer) && o.layer.geometry_type == 'polygon') {
      return menus.polygons;
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
      // don't show "turn off" link if not currently editing
      if (_editMode == 'off' && mode == 'off') return;
      var link = El('div').addClass('nav-menu-item').attr('data-name', mode).text(labels[mode]).appendTo(menu);
      link.on('click', function(e) {
        if (_editMode == mode) {
          // closeMenu();
          setMode('off');
        } else if (_editMode != mode) {
          setMode(mode);
          if (mode == 'off') closeMenu(120); // only close if turning off
          // closeMenu(mode == 'off' ? 120 : 400); // close after selecting
        }
        e.stopPropagation();
      });
    });
    updateSelectionHighlight();
  }

  // if current editing mode is not available, turn off the tool
  function updateCurrentMode() {
    var modes = getAvailableModes();
    if (modes.indexOf(_editMode) == -1) {
      setMode('off');
    }
  }

  function openMenu() {
    clearTimeout(_menuTimeout);
    if (!_menuOpen) {
      _menuOpen = true;
      renderMenu();
      updateArrowButton();
    }
  }

  // Calling with a delay lets users see the menu update after clicking a selection,
  // and prevents the menu from closing immediately if the pointer briefly drifts
  // off the menu while hovering.
  //
  function closeMenu(delay) {
    if (!_menuOpen) return;
    clearTimeout(_menuTimeout);
    _menuTimeout = setTimeout(function() {
      _menuOpen = false;
      updateArrowButton();
    }, delay || 0);
  }

  function setMode(mode) {
    var changed = mode != _editMode;
    if (changed) {
      menu.classed('active', mode != 'off');
      _editMode = mode;
      onModeChange();
      updateArrowButton();
      updateSelectionHighlight();
    }
  }

  function onModeChange() {
    var mode = getInteractionMode();
    gui.state.interaction_mode = mode;
    gui.dispatchEvent('interaction_mode_change', {mode: mode});
  }

  // Update button highlight and selected menu item highlight (if any)
  function updateArrowButton() {
    if (!menu) return;
    if (_menuOpen) {
      btn.addClass('open');
    } else {
      btn.removeClass('open');
    }
    btn.classed('hover', _menuOpen);
    // btn.classed('selected', active() && !_menuOpen);
    btn.classed('selected', active());
  }

  function updateSelectionHighlight() {
    El.findAll('.nav-menu-item').forEach(function(el) {
      el = El(el);
      el.classed('selected', el.attr('data-name') == _editMode);
    });
  }
}
