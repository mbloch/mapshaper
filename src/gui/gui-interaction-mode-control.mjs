import { El } from './gui-el';
import { internal } from './gui-core';

export function InteractionMode(gui) {

  var menus = {
    standard: ['info', 'selection', 'box'],
    empty: ['edit_polygons', 'edit_lines', 'edit_points', 'box'],
    polygons: ['info', 'selection', 'box', 'edit_polygons'],
    rectangles: ['info', 'selection', 'box', 'rectangles', 'edit_polygons'],
    lines: ['info', 'selection', 'box' , 'edit_lines'],
    table: ['info', 'selection'],
    labels: ['info', 'selection', 'box', 'labels', 'edit_points'],
    points: ['info', 'selection', 'box', 'edit_points'] // , 'add-points'
  };

  var prompts = {
    box: 'Shift-drag to draw a box',
    data: 'Click-select features to edit their attributes',
    selection: 'Click-select or shift-drag to select features'
  };

  // mode name -> menu text lookup
  var labels = {
    info: 'inspect features',
    box: 'rectangle tool',
    data: 'edit attributes',
    labels: 'position labels',
    edit_points: 'add/edit points',
    edit_lines: 'draw/edit polylines',
    edit_polygons: 'draw/edit polygons',
    vertices: 'edit vertices',
    selection: 'selection tool',
    'add-points': 'add points',
    rectangles: 'drag-to-resize',
    off: 'turn off'
  };
  var btn, menu;
  var _menuTimeout;

  // state variables
  var _editMode = 'off';
  var _prevMode;
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

  this.modeWorksWithConsole = function(mode) {
    return ['off', 'info'];
  };

  this.modeUsesHitDetection = function(mode) {
    return ['info', 'selection', 'data', 'labels', 'edit_points', 'vertices', 'rectangles', 'edit_lines', 'edit_polygons'].includes(mode);
  };

  this.modeUsesPopup = function(mode) {
    return ['info', 'selection', 'data', 'box', 'labels', 'edit_points', 'rectangles'].includes(mode);
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
      return menus.empty; // TODO: more sensible handling of missing layer
    }
    if (!o.layer.geometry_type) {
      return menus.table;
    }
    if (internal.layerHasLabels(o.layer)) {
      return menus.labels;
    }
    if (o.layer.geometry_type == 'point') {
      return menus.points;
    }
    if (o.layer.geometry_type == 'polyline') {
      return menus.lines;
    }
    if (o.layer.geometry_type == 'polygon') {
      return internal.layerOnlyHasRectangles(o.layer, o.dataset.arcs) ?
        menus.rectangles : menus.polygons;
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
      _prevMode = _editMode;
      _editMode = mode;
      onModeChange();
      updateArrowButton();
      updateSelectionHighlight();
    }
  }

  function onModeChange() {
    var mode = getInteractionMode();
    gui.state.interaction_mode = mode;
    gui.dispatchEvent('interaction_mode_change', {mode: mode, prev_mode: _prevMode});
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
