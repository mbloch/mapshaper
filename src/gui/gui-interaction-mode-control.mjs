import { El } from './gui-el';
import { internal } from './gui-core';
import { getLabelTarget } from './gui-label-commands';

export function InteractionMode(gui) {

  // Each menu holds the tools that suit the active layer, so the label tool
  // appears only where the layer is one labels go into: 'labels' and
  // 'emptyPoints'. On any other layer it would be an entry for editing a layer
  // that does not exist yet -- making one is the business of the "Draw"
  // links in the layer panel (gui-add-layer-links.mjs), which create the layer
  // and open this tool on it in one click.
  //
  // The tool still acts on any target once it is open: see
  // labelModeIsAvailable().
  var menus = {
    standard: ['info', 'selection', 'box', 'ruler'],
    empty: ['edit_polygons', 'edit_lines', 'edit_points', 'box', 'ruler'],
    polygons: ['info', 'selection', 'polygon_style', 'edit_polygons', 'box', 'ruler'],
    rectangles: ['info', 'selection', 'polygon_style', 'edit_polygons', 'rectangles', 'box', 'ruler'],
    lines: ['info', 'selection', 'line_style', 'edit_lines', 'snip_lines', 'box', 'ruler'],
    table: ['info', 'selection'],
    raster: ['box', 'ruler'],
    labels: ['info', 'selection', 'label', 'box', 'ruler'],
    points: ['info', 'selection', 'edit_points', 'point_style', 'box', 'ruler'], // , 'add-points'
    // An empty point layer is the layer the "Draw: labels" link creates,
    // and a label goes into it rather than beside it (see labelWouldJoin), so
    // the label tool belongs in its menu as well as the point tools: it is the
    // way back into a labels layer that has no label in it yet.
    emptyPoints: ['info', 'selection', 'label', 'point_style', 'edit_points', 'box', 'ruler']
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
    label: 'add/edit labels',
    label_style: 'style labels',
    point_style: 'style points',
    line_style: 'style lines',
    polygon_style: 'style polygons',
    edit_points: 'add/drag points',
    edit_lines: 'draw/edit lines',
    edit_polygons: 'draw/edit polygons',
    snip_lines: 'snip lines',
    vertices: 'edit vertices',
    selection: 'selection tool',
    ruler: 'measure distance',
    frame: 'edit map frame',
    frame_draw: 'draw map frame',
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
      if (stylePanelIsActive()) return;
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
      if (_editMode == 'label_style') {
        setMode('off');
        closeMenu();
      } else if (active()) {
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
    return ['info', 'selection', 'data', 'label', 'label_style', 'point_style', 'line_style', 'polygon_style', 'edit_points', 'vertices', 'rectangles', 'edit_lines', 'edit_polygons', 'snip_lines'].includes(mode);
  };

  this.modeUsesPopup = function(mode) {
    return ['info', 'selection', 'data', 'box', 'edit_points'].includes(mode);
  };

  this.modeSupportsUndo = function(mode) {
    return ['data', 'frame', 'label', 'label_style', 'point_style', 'line_style', 'polygon_style', 'edit_points', 'edit_lines', 'edit_polygons', 'snip_lines', 'vertices', 'rectangles'].includes(mode);
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

  // A mode with a panel of its own: hovering the button must not open the mode
  // menu over the panel.
  function stylePanelIsActive() {
    return _editMode == 'frame' || _editMode == 'frame_draw' ||
      _editMode == 'label' || _editMode == 'label_style' ||
      _editMode == 'point_style' || _editMode == 'line_style' ||
      _editMode == 'polygon_style';
  }

  function getAvailableModes() {
    var o = gui.model.getActiveLayer();
    if (!o || !o.layer) {
      return menus.empty; // TODO: more sensible handling of missing layer
    }
    if (internal.layerHasRaster(o.layer)) {
      return menus.raster;
    }
    if (!o.layer.geometry_type) {
      return menus.table;
    }
    if (internal.layerHasLabels(o.layer)) {
      return menus.labels;
    }
    if (o.layer.geometry_type == 'point') {
      return labelWouldJoin(o.layer) ? menus.emptyPoints : menus.points;
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
      var link = El('div').addClass('nav-menu-item').attr('data-name', mode).text(getModeLabel(mode)).appendTo(menu);
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

  function getModeLabel(mode) {
    return labels[mode];
  }

  // if current editing mode is not available, turn off the tool
  function updateCurrentMode() {
    var modes = getAvailableModes();
    if (modes.indexOf(_editMode) == -1 && !inFrameMode() && !labelModeIsAvailable() && !labelStyleModeIsAvailable() && !layerStyleModeIsAvailable() && !pointStyleModeIsAvailable()) {
      setMode('off');
    }
  }

  // The frame modes are reached from the layer panel and the frame menu, never
  // from this button's menu, so they neither belong to the active layer's tool
  // list nor light the button up.
  function inFrameMode() {
    return _editMode == 'frame' || _editMode == 'frame_draw';
  }

  // Whether a label made now would join the active layer rather than starting a
  // layer of its own, which is the label tool's own rule for what a label layer
  // is: one with a label-text field, or an empty point layer.
  function labelWouldJoin(lyr) {
    return getLabelTarget(lyr, internal.layerHasLabels).mode == 'existing';
  }

  // The label tool is offered where a label would join the active layer (see
  // menus above), but it can act on any target once it is open: a label goes
  // into a label layer created beside a layer that cannot hold one. So
  // selecting a polygon layer while the tool is open must not close it -- the
  // next label will start a label layer of its own.
  function labelModeIsAvailable() {
    var o = gui.model.getActiveLayer();
    if (_editMode != 'label') return false;
    if (!o || !o.layer) return true; // the tool creates the layer it needs
    // A table is the one target with no map to click on.
    return internal.layerHasRaster(o.layer) || !!o.layer.geometry_type;
  }

  function labelStyleModeIsAvailable() {
    var o = gui.model.getActiveLayer();
    return _editMode == 'label_style' && o && o.layer && internal.layerHasLabels(o.layer);
  }

  function layerStyleModeIsAvailable() {
    var o = gui.model.getActiveLayer();
    return _editMode == 'line_style' && o && o.layer && o.layer.geometry_type == 'polyline' ||
      _editMode == 'polygon_style' && o && o.layer && o.layer.geometry_type == 'polygon';
  }

  function pointStyleModeIsAvailable() {
    var o = gui.model.getActiveLayer();
    return _editMode == 'point_style' && o && o.layer && o.layer.geometry_type == 'point';
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
    btn.classed('selected', active() && !inFrameMode());
  }

  function updateSelectionHighlight() {
    El.findAll('.nav-menu-item').forEach(function(el) {
      el = El(el);
      el.classed('selected', el.attr('data-name') == _editMode);
    });
  }
}
