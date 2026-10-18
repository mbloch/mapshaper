import { El } from './gui-el';
import { internal } from './gui-core';
import { getLabelTarget } from './gui-label-commands';
import { formatLayerNameForDisplay } from './gui-layer-utils';
import { addEmptyLayer } from './gui-add-layer';

export function InteractionMode(gui) {
  var self = this;

  // Each menu holds the tools that suit the active layer, so the label tool
  // appears only where the layer is one labels go into: 'labels' and
  // 'emptyPoints'. On any other layer it would be an entry for editing a layer
  // that does not exist yet -- making one is the business of the "Draw"
  // links in the layer panel (gui-add-layer-links.mjs), which create the layer
  // and open this tool on it in one click.
  //
  // The tool still acts on any target once it is open: see
  // labelModeIsAvailable().
  //
  // Lines and polygons are drawn, reshaped and styled in one mode each,
  // 'line_style' and 'polygon_style', with drawing or reshaping armed from the
  // mode's toolbar (see setArmedTool()). 'edit_lines' and 'edit_polygons' are not modes of their
  // own: setMode() takes them as "open the mode with drawing armed", creating
  // a layer to draw in if there is none, which is what the menu for an empty
  // session and the layer panel's "Draw" links ask for.
  //
  // Points are added and moved in 'point_style'. On a layer of plain points
  // a click on empty map always adds one, so the tool mode there is
  // 'edit_points' with nothing to arm (see getToolMode()); a layer of circles
  // keeps its selection for restyling instead. 'edit_points' opens the mode,
  // creating a point layer if there is none. The symbol tool is not offered on a layer of plain points: it draws only
  // symbols, and the panel's Convert button is the way from points to
  // symbols.
  var menus = {
    standard: ['info', 'selection', 'box', 'ruler'],
    empty: [ 'label', 'symbols', 'edit_points', 'edit_lines',  'edit_polygons','box', 'ruler'],
    polygons: ['info', 'polygon_style', 'selection', 'box', 'ruler'],
    rectangles: ['info', 'selection', 'polygon_style', 'rectangles', 'box', 'ruler'],
    lines: ['info', 'line_style', 'snip_lines', 'selection', 'box', 'ruler'],
    table: ['info', 'selection'],
    raster: ['box', 'ruler'],
    labels: ['info', 'label', 'symbols', 'selection', 'box', 'ruler'],
    // a layer of symbols, which the point tools have no controls for
    symbols: ['info', 'symbols', 'selection', 'box', 'ruler'],
    points: ['info', 'point_style', 'selection', 'box', 'ruler'],
    circles: ['info', 'point_style', 'symbols', 'selection', 'box', 'ruler'],
    // An empty point layer is the layer the "Add labels" link creates,
    // and a label goes into it rather than beside it (see labelWouldJoin), so
    // the label tool belongs in its menu as well as the point tools: it is the
    // way back into a labels layer that has no label in it yet.
    emptyPoints: ['info', 'label', 'symbols', 'point_style', 'selection', 'box', 'ruler']
  };

  // Tools that work the same whatever the active layer is. They go below a
  // divider, so the layer-name heading visibly covers only the tools above it.
  var layerIndependentModes = ['box', 'ruler'];

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
    label: 'style/edit labels',
    symbols: 'style/edit symbols',
    label_style: 'style/edit labels',
    point_style: 'style/edit points',
    line_style: 'style/edit lines',
    polygon_style: 'style/edit polygons',
    edit_points: 'style/edit points',
    edit_lines: 'draw lines',
    edit_polygons: 'draw polygons',
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
  var _armedTool = null; // 'draw', 'reshape', 'curve' (lines only) or null
  // the layer the label or symbol tool is editing, once it has one:
  // {layer, name}
  var _toolLayer = null;

  // The tool modes that 'line_style' and 'polygon_style' take on when one of
  // their toolbar's tools is armed
  var drawingModes = {
    line_style: {draw: 'edit_lines', reshape: 'reshape_lines', curve: 'curve_lines'},
    polygon_style: {draw: 'edit_polygons', reshape: 'reshape_polygons'}
  };
  var drawingAliases = {edit_lines: 'line_style', edit_polygons: 'polygon_style',
    edit_points: 'point_style'};
  var drawingGeometryTypes = {line_style: 'polyline', polygon_style: 'polygon',
    point_style: 'point'};

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
    return ['info', 'selection', 'data', 'label', 'label_style', 'symbols', 'point_style', 'line_style', 'polygon_style', 'edit_points', 'vertices', 'rectangles', 'edit_lines', 'edit_polygons', 'snip_lines'].includes(mode);
  };

  this.modeUsesPopup = function(mode) {
    return ['info', 'selection', 'data', 'box', 'edit_points'].includes(mode);
  };

  this.modeSupportsUndo = function(mode) {
    return ['data', 'frame', 'label', 'label_style', 'symbols', 'point_style', 'line_style', 'polygon_style', 'edit_points', 'edit_lines', 'edit_polygons', 'snip_lines', 'vertices', 'rectangles'].includes(mode);
  };

  this.getMode = getInteractionMode;

  // What the pointer does: the mode, except in a line or polygon mode with a
  // tool armed from its toolbar. Drawing ('edit_lines', 'edit_polygons')
  // draws new shapes, and a click on a shape selects it for styling;
  // reshaping ('reshape_lines', 'reshape_polygons') drags, inserts and
  // deletes vertices; the curve tool ('curve_lines') draws lines as curves
  // through clicked knots. The hit control, the overlay and the drawing tool go by
  // this; the panel, undo and the menu go by the mode, which arming does not
  // change.
  this.getToolMode = getToolMode;

  this.getArmedTool = function() {
    return _armedTool;
  };

  this.drawingIsArmed = function() {
    return _armedTool == 'draw';
  };

  this.reshapingIsArmed = function() {
    return _armedTool == 'reshape';
  };

  // A tool that adds shapes is armed, so that with nothing selected, the
  // style panel styles the next shape (see gui-layer-style-tool.mjs)
  this.newShapesAreArmed = function() {
    return _armedTool == 'draw' || _armedTool == 'curve';
  };

  this.drawingCanBeArmed = function() {
    return _editMode in drawingModes;
  };

  // tool: 'draw', 'reshape', 'curve' or null
  this.setArmedTool = function(tool) {
    var next = tool && _editMode in drawingModes && tool in drawingModes[_editMode] ? tool : null;
    var prevToolMode;
    if (next == _armedTool) return;
    prevToolMode = getToolMode();
    _armedTool = next;
    gui.dispatchEvent('interaction_tool_change', {
      mode: getInteractionMode(),
      tool_mode: getToolMode(),
      prev_tool_mode: prevToolMode
    });
  };

  // Disarming leaves the reshape tool alone, if that is what is armed
  this.setDrawingArmed = function(on) {
    if (on) {
      self.setArmedTool('draw');
    } else if (_armedTool == 'draw') {
      self.setArmedTool(null);
    }
  };

  this.setMode = function(mode) {
    // TODO: check that this mode is valid for the current dataset
    if (mode in drawingAliases) {
      openDrawingMode(drawingAliases[mode]);
    } else if (mode in labels) {
      setMode(mode);
    }
  };

  function openDrawingMode(mode) {
    var type = drawingGeometryTypes[mode];
    var o = gui.model.getActiveLayer();
    if (!o || !o.layer || o.layer.geometry_type != type) {
      addEmptyLayer(gui, undefined, type);
    }
    setMode(mode, true);
    self.setDrawingArmed(true);
  }

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
      _editMode == 'label' || _editMode == 'label_style' || _editMode == 'symbols' ||
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
    if (o.layer.geometry_type == 'point' && internal.layerHasSvgSymbols(o.layer)) {
      return menus.symbols;
    }
    if (o.layer.geometry_type == 'point' && labelWouldJoin(o.layer)) {
      return menus.emptyPoints;
    }
    if (o.layer.geometry_type == 'point') {
      return o.layer.data && o.layer.data.fieldExists('r') ? menus.circles : menus.points;
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

  function getToolMode() {
    var mode = getInteractionMode();
    if (mode == 'point_style') {
      return activeLayerHasPlainPoints() ? 'edit_points' : mode;
    }
    return _armedTool && mode in drawingModes ? drawingModes[mode][_armedTool] : mode;
  }

  // Checked on each call rather than on entering the mode, because a -style
  // command run from the console can turn the points into circles.
  function activeLayerHasPlainPoints() {
    var o = gui.model.getActiveLayer();
    return !!(o && o.layer && o.layer.geometry_type == 'point' &&
      !(o.layer.data && o.layer.data.fieldExists('r')));
  }

  // A line or polygon layer with nothing in it has nothing to style or
  // select, so its mode opens ready to draw.
  function layerIsEmpty() {
    var o = gui.model.getActiveLayer();
    return !!(o && o.layer && internal.getFeatureCount(o.layer) === 0);
  }

  function renderMenu() {
    if (!menu) return;
    var modes = getAvailableModes().filter(function(mode) {
      // don't show "turn off" link if not currently editing
      return !(_editMode == 'off' && mode == 'off');
    });
    var layerModes = modes.filter(function(mode) {
      return !layerIndependentModes.includes(mode);
    });
    var otherModes = modes.filter(function(mode) {
      return layerIndependentModes.includes(mode);
    });
    var lyr = gui.model.getActiveLayer()?.layer;
    menu.empty();
    if (lyr && layerModes.length > 0) {
      renderLayerHeading(lyr);
    }
    layerModes.forEach(renderMenuItem);
    if (layerModes.length > 0 && otherModes.length > 0) {
      El('div').addClass('nav-menu-divider').appendTo(menu);
    }
    otherModes.forEach(renderMenuItem);
    updateSelectionHighlight();
  }

  // Names the layer the tools above the divider act on.
  function renderLayerHeading(lyr) {
    var name = formatLayerNameForDisplay(lyr.name);
    var heading = El('div').addClass('nav-menu-heading').attr('title', name).text(name).appendTo(menu);
    // A click on the heading would reach the button, which picks a tool.
    heading.on('click', function(e) {
      e.stopPropagation();
    });
  }

  function renderMenuItem(mode) {
    var link = El('div').addClass('nav-menu-item').attr('data-name', mode).text(getModeLabel(mode)).appendTo(menu);
    link.on('click', function(e) {
      if (_editMode == mode) {
        // closeMenu();
        setMode('off');
      } else if (_editMode != mode) {
        self.setMode(mode); // resolves drawingAliases
        if (mode == 'off') closeMenu(120); // only close if turning off
        // closeMenu(mode == 'off' ? 120 : 400); // close after selecting
      }
      e.stopPropagation();
    });
  }

  function getModeLabel(mode) {
    return labels[mode];
  }

  // if current editing mode is not available, turn off the tool
  function updateCurrentMode() {
    var modes = getAvailableModes();
    if (toolLayerWasRemoved()) {
      setMode('off');
      return;
    }
    if (modes.indexOf(_editMode) == -1 && !inFrameMode() && !labelModeIsAvailable() && !labelStyleModeIsAvailable() && !layerStyleModeIsAvailable() && !pointStyleModeIsAvailable() && !symbolModeIsAvailable()) {
      setMode('off');
    }
  }

  // The label and symbol tools stay open with no layer, because entering them
  // makes the layer they need -- but only on entering. A layer that goes away
  // under them, deleted from the layer menu or undone out of existence, leaves
  // a toolbar and a panel with nowhere to put anything, so the tool closes, as
  // the line and polygon tools do when their layer goes. Selecting another
  // layer the tool works on moves it to that layer instead.
  //
  // The layer is followed by name as well as by identity: a command that
  // edits a layer can replace it with a new one, and undoing the command
  // puts the old one back, so the layer the tool last saw can be gone from
  // the model while its layer is still there.
  function toolLayerWasRemoved() {
    var o = gui.model.getActiveLayer();
    if (_editMode != 'label' && _editMode != 'symbols') {
      _toolLayer = null;
      return false;
    }
    if (_toolLayer && !layerIsInModel(_toolLayer)) {
      _toolLayer = null;
      return true;
    }
    _toolLayer = o && o.layer ? {layer: o.layer, name: o.layer.name || ''} : null;
    return false;
  }

  function layerIsInModel(tracked) {
    return gui.model.getLayers().some(function(o) {
      return o.layer == tracked.layer || (o.layer.name || '') == tracked.name;
    });
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
  // menus above), and it stays open only there: selecting a layer that cannot
  // hold labels closes it, as selecting another kind of layer closes the line
  // and polygon tools. Left open, its panel went on styling a layer that has
  // no labels, and the next label would have started a label layer of its own
  // beside whatever had been selected. With no layer at all the tool stays,
  // since it creates the layer it needs.
  function labelModeIsAvailable() {
    var o = gui.model.getActiveLayer();
    if (_editMode != 'label') return false;
    return !o || !o.layer || labelWouldJoin(o.layer);
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

  // Symbols go into point layers, and the tool makes one if there is no layer
  // at all, as the label tool does.
  function symbolModeIsAvailable() {
    var o = gui.model.getActiveLayer();
    if (_editMode != 'symbols') return false;
    return !o || !o.layer || o.layer.geometry_type == 'point';
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

  // armed: (optional) open a line or polygon mode with drawing armed
  function setMode(mode, armed) {
    var changed = mode != _editMode;
    if (changed) {
      if (menu) menu.classed('active', mode != 'off');
      _prevMode = _editMode;
      _editMode = mode;
      // set before the event, so that its listeners see the tool mode the
      // mode opens in
      _armedTool = mode in drawingModes && (!!armed || layerIsEmpty()) ? 'draw' : null;
      onModeChange();
      // after the tools have heard, since entering one can make its layer
      toolLayerWasRemoved();
      updateArrowButton();
      updateSelectionHighlight();
    }
  }

  function onModeChange() {
    var mode = getInteractionMode();
    gui.state.interaction_mode = mode;
    gui.dispatchEvent('interaction_mode_change', {mode: mode, prev_mode: _prevMode,
      tool_mode: getToolMode()});
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
