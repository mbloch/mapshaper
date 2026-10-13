import { El } from './gui-el';
import { internal } from './gui-core';
import {
  claimFieldKeys, isTextInput, opensAMenu, releasePanelFocus
} from './gui-panel-focus';
import { makeColorRow, makePanelButton, makePanelSection } from './gui-panel-controls';
import { SizeField } from './gui-size-field';
import { formatEditingStatus } from './gui-editing-status';
import { runGuiEditCommand } from './gui-edit-command';
import { getSymbolStyleCommand, getRestyleSymbolCommand } from './gui-symbol-commands';
import {
  ARROWHEAD_POSITIONS, getShapeChangeStyle,
  getIconShape, getIconSize, getIconPaint, getIconRotation, getIconStyle,
  getRestyleIconOptions,
  getCurveStyle, getArrowheadFields, getArrowheadPosition, getArrowheadShape,
  shapeHasStrokeWidth, shapeHasRotation
} from './gui-symbol-style';
import { pointIsUnstyled } from './gui-unstyled-points';
import { ARROWHEAD_SHAPES, getArrowheadGlyph } from './gui-arrowhead-shapes';
import { getIconShapes, getIconShapeGlyph, getDefaultStrokeWidth } from './gui-icon-shapes';
import { isNytUser } from './gui-nyt';

// The symbol tool's panel. With symbols selected it restyles them: icons
// through -symbols ids=, curves through -style ids=. With none, and a tool armed, it sets the style of the next
// symbol placed, and shows the section for the kind of symbol the toolbar is
// ready to place; with no tool armed, it restyles every symbol in the layer,
// as the label panel restyles every label.
//
// opts:
//   getTarget()        the layer the symbols are in
//   getSelectedIds()   the selected symbols
//   getAllIds()        every symbol in the layer
//   getArmed()         null, 'icon' or 'curve'
//   getNewStyle()      {icon, curve}: the style of the next symbol, which the
//                      panel changes in place
//   isCurve(lyr, id)
//   deselect()
//   close()            the close button: hides the panel, leaving the tool on
export function SymbolPanel(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel symbol-style-panel rollover')
    .appendTo(parent).hide();
  var status, clearLink;
  var iconSection, shapeBtns = {}, iconFill, iconSizeField, iconStroke,
      iconStrokeWidthField, rotationRow, rotationField;
  var curveSection, curveStroke, curveWidthField, arrowShapeRow, arrowShapeBtns = {},
      arrowSizeField, arrowRow, arrowBtns = {}, fadeField, taperRow, taperField, curveFill;
  // what the controls describe: {mode: 'new'|'selection', icons: [ids],
  //   curves: [ids], records}
  var state = null;
  var shownShapes = null;

  initPanel();

  this.show = function() {
    panel.show();
    this.update();
  };

  this.hide = function() {
    [iconFill, iconStroke, curveStroke, curveFill].forEach(function(c) {
      c.picker.hide();
    });
    releaseFocus();
    panel.hide();
  };

  this.update = update;

  function initPanel() {
    claimFieldKeys(panel.node(), {revert: update, release: releaseFocus});
    panel.node().addEventListener('click', function(e) {
      if (isTextInput(document.activeElement) || opensAMenu(e.target)) return;
      releaseFocus();
    });
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    El('span').appendTo(header).text('Symbols');
    El('button').addClass('label-style-close').appendTo(header).text('×')
      .on('click', opts.close);

    var statusRow = El('div').addClass('label-style-row label-style-selection-row').appendTo(panel);
    status = El('span').addClass('label-editing-status').appendTo(statusRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(statusRow)
      .text('deselect').on('click', opts.deselect);

    initIconSection();
    initCurveSection();
  }

  function initIconSection() {
    iconSection = makePanelSection(panel, 'Symbol');
    var shapeRow = El('div').addClass('label-style-row label-icon-shapes-row').appendTo(iconSection);
    var group = El('div').addClass('label-btn-group label-icon-buttons').appendTo(shapeRow);
    getShownShapes().forEach(function(item) {
      var btn = makePanelButton(group, '', function() {
        applyIconShape(item.name);
      }).attr('data-icon', item.name).attr('aria-label', item.title);
      El(getIconShapeGlyph(item.name)).appendTo(btn);
      shapeBtns[item.name] = btn;
    });

    // Every shape has a fill and a stroke; a shape only decides which it
    // starts with -- a ring a stroke, the rest a fill.
    iconFill = makeColorRow(iconSection, {
      label: 'Fill',
      noOpacity: true,
      onColor: function(color) {
        applyIconPaint({fill: color});
      },
      revert: update
    });
    El('span').appendTo(iconFill.aside).text('Size');
    iconSizeField = new SizeField(iconFill.aside, {
      min: 1,
      title: 'Symbol size in px',
      onSet: applyIconSize,
      onStep: function(delta) {
        applyIconSize(Math.max(1, (getShownIconSize() || 0) + delta));
      },
      onDone: releaseFocus
    });

    iconStroke = makeColorRow(iconSection, {
      label: 'Stroke',
      noOpacity: true,
      onColor: applyIconStroke,
      revert: update
    });
    El('span').appendTo(iconStroke.aside).text('Width');
    iconStrokeWidthField = new SizeField(iconStroke.aside, {
      min: 0,
      decimals: 2,
      title: 'Stroke width in px',
      onSet: applyIconStrokeWidth,
      onStep: function(delta) {
        applyIconStrokeWidth(Math.max(0, (Number(iconStrokeWidthField.getValue()) || 0) + delta * 0.5));
      },
      onDone: releaseFocus
    });

    rotationRow = El('div').addClass('label-style-row label-split-row').appendTo(iconSection);
    var cell = El('div').addClass('label-split-cell').appendTo(rotationRow);
    El('span').appendTo(cell).text('Rotation');
    rotationField = new SizeField(cell, {
      min: -360,
      max: 360,
      step: 5,
      bigStep: 45,
      title: 'Rotation in degrees',
      onSet: applyIconRotation,
      onStep: function(delta) {
        applyIconRotation((Number(rotationField.getValue()) || 0) + delta);
      },
      onDone: releaseFocus
    });
  }

  function initCurveSection() {
    curveSection = makePanelSection(panel, 'Curve');
    // "Color", as a label callout's is: the line and its heads are drawn in it
    curveStroke = makeColorRow(curveSection, {
      label: 'Color',
      ariaLabel: 'Curve color',
      noOpacity: true,
      onColor: function(color) {
        applyCurveValues({stroke: color}, {stroke: color});
      },
      revert: update
    });
    El('span').appendTo(curveStroke.aside).text('Width');
    curveWidthField = new SizeField(curveStroke.aside, {
      min: 0,
      decimals: 2,
      title: 'Stroke width in px',
      onSet: applyCurveWidth,
      onStep: function(delta) {
        applyCurveWidth(Math.max(0, (Number(curveWidthField.getValue()) || 0) + delta * 0.5));
      },
      onDone: releaseFocus
    });

    // The layer panel's Arrowheads controls, which set the same fields on a
    // line: the head's shape with its size beside it, then which ends get it
    // with the line's fade beside that.
    arrowShapeRow = El('div').addClass('label-style-row label-split-row').appendTo(curveSection);
    var shapeCell = El('div').addClass('label-split-cell label-align-row').appendTo(arrowShapeRow);
    El('span').appendTo(shapeCell).text('Arrowheads');
    var shapeGroup = El('div').addClass('label-btn-group label-callout-buttons symbol-arrow-shape-buttons')
      .appendTo(shapeCell);
    ARROWHEAD_SHAPES.forEach(function(item) {
      arrowShapeBtns[item.name] = makePanelButton(shapeGroup, '', function() {
        applyArrowShape(item.name);
      }).attr('data-arrow-shape', item.name).attr('aria-label', item.title);
      El(getArrowheadGlyph(item.name)).appendTo(arrowShapeBtns[item.name]);
    });
    var sizeCell = El('div').addClass('label-split-cell label-spacing-row').appendTo(arrowShapeRow);
    El('span').appendTo(sizeCell).text('Size');
    arrowSizeField = new SizeField(sizeCell, {
      min: 1,
      max: 60,
      step: 1,
      bigStep: 5,
      title: 'Arrowhead size in px, the length of its sides or the diameter of a dot',
      onSet: applyArrowSize,
      onStep: function(delta) {
        var size = Number(arrowSizeField.getValue());
        if (size > 0) applyArrowSize(Math.max(1, Math.round(size + delta)));
      },
      onDone: releaseFocus
    });

    arrowRow = El('div').addClass('label-style-row label-split-row').appendTo(curveSection);
    var cell = El('div').addClass('label-split-cell label-align-row').appendTo(arrowRow);
    El('span').appendTo(cell).text('Ends');
    var group = El('div').addClass('label-btn-group symbol-arrowhead-buttons').appendTo(cell);
    ARROWHEAD_POSITIONS.forEach(function(item) {
      arrowBtns[item.name] = makePanelButton(group, item.label, function() {
        applyArrowPosition(item.name);
      }).attr('data-arrowheads', item.name).attr('aria-label', item.title);
    });
    var fadeCell = El('div').addClass('label-split-cell label-spacing-row').appendTo(arrowRow);
    El('span').appendTo(fadeCell).text('Fade %');
    fadeField = new SizeField(fadeCell, {
      min: 0,
      max: 100,
      step: 5,
      bigStep: 25,
      title: 'Percent of the curve that fades in from its tail',
      onSet: applyFade,
      onStep: function(delta) {
        applyFade(Math.max(0, Math.min(100, (Number(fadeField.getValue()) || 0) + delta)));
      },
      onDone: releaseFocus
    });

    taperRow = El('div').addClass('label-style-row label-split-row').appendTo(curveSection);
    var taperCell = El('div').addClass('label-split-cell label-spacing-row symbol-curve-taper-cell').appendTo(taperRow);
    El('span').appendTo(taperCell).text('Taper %');
    taperField = new SizeField(taperCell, {
      min: 0,
      max: 100,
      step: 5,
      bigStep: 25,
      title: 'Percent of the width the curve loses toward its tail (100 tapers it to a point)',
      onSet: applyTaper,
      onStep: function(delta) {
        applyTaper(Math.max(0, Math.min(100, (Number(taperField.getValue()) || 0) + delta)));
      },
      onDone: releaseFocus
    });

    curveFill = makeColorRow(curveSection, {
      label: 'Fill',
      noOpacity: true,
      onColor: function(color) {
        applyCurveValues({fill: color}, {fill: color}, true);
      },
      revert: update
    });
  }

  // Read once, when first asked: whether the NYT star is offered does not
  // change during a session.
  function getShownShapes() {
    if (!shownShapes) shownShapes = getIconShapes('symbol', {nyt: isNytUser()});
    return shownShapes;
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  // --- reading

  function getState() {
    var lyr = opts.getTarget();
    var ids = opts.getSelectedIds();
    var all = ids.length === 0 && !opts.getArmed();
    var records = lyr && lyr.data ? lyr.data.getRecords() : [];
    var o;
    if (all) ids = opts.getAllIds();
    o = {
      mode: ids.length > 0 ? 'selection' : 'new',
      all: all,
      target: lyr,
      ids: ids,
      icons: [],
      curves: [],
      records: records
    };
    ids.forEach(function(id) {
      (opts.isCurve(lyr, id) ? o.curves : o.icons).push(id);
    });
    return o;
  }

  function update() {
    var armed;
    if (!panel.visible()) return;
    state = getState();
    armed = opts.getArmed();
    status.text(formatEditingStatus({
      selected: state.all ? 0 : state.ids.length,
      total: state.all ? state.ids.length : 0,
      newShapes: armed ? 'symbols' : null
    }));
    clearLink.classed('hidden', state.mode != 'selection' || state.all);
    toggle(iconSection, state.mode == 'selection' ? state.icons.length > 0 : armed != 'curve');
    toggle(curveSection, state.mode == 'selection' ? state.curves.length > 0 : armed == 'curve');
    updateIconControls();
    updateCurveControls();
  }

  function toggle(el, visible) {
    if (visible) el.show(); else el.hide();
  }

  function updateIconControls() {
    var style = opts.getNewStyle().icon;
    var shape, size, fill, stroke, width, rotation;
    if (state.mode == 'new') {
      shape = style.shape;
      size = style.size;
      fill = style.fill;
      stroke = style.stroke;
      width = style.stroke ? style.strokeWidth : 0;
      rotation = style.rotation;
    } else {
      shape = commonValue(state.icons, getIconShape);
      size = commonValue(state.icons, getIconSize);
      fill = commonValue(state.icons, function(rec) { return getIconPaint(rec).fill; });
      stroke = commonValue(state.icons, function(rec) { return getIconPaint(rec).stroke; });
      width = commonValue(state.icons, function(rec) { return getIconPaint(rec).strokeWidth; });
      rotation = commonValue(state.icons, getIconRotation);
    }
    getShownShapes().forEach(function(item) {
      shapeBtns[item.name].classed('selected', shape == item.name);
    });
    iconFill.showColor(fill || '');
    iconSizeField.setValue(size === null ? '' : size);
    iconStroke.showColor(stroke || '');
    iconStrokeWidthField.setValue(width === null ? '' : width);
    rotationField.setValue(rotation === null ? '' : rotation);
    // shown for a mixed selection, which may have shapes that take them
    iconStroke.aside.classed('hidden', !!shape && !shapeHasStrokeWidth(shape));
    rotationRow.classed('hidden', !!shape && !shapeHasRotation(shape));
  }

  function updateCurveControls() {
    var style = opts.getNewStyle().curve;
    var o, closed;
    if (state.mode == 'new') {
      o = style;
      closed = false;
    } else {
      o = {};
      ['stroke', 'strokeWidth'].forEach(function(key) {
        o[key] = commonValue(state.curves, function(rec) { return getCurveStyle(rec)[key]; });
      });
      // the ends, from the open curves: a closed one has none
      ['arrowheads', 'arrowShape', 'fade', 'taper'].forEach(function(key) {
        o[key] = commonValue(getOpenCurves(), function(rec) { return getCurveStyle(rec)[key]; });
      });
      o.arrowSize = commonValue(getOpenCurves().filter(curveHasHeads), function(rec) {
        return getShownArrowSize(getCurveStyle(rec));
      });
      o.fill = commonValue(state.curves.filter(curveIsClosed), function(rec) {
        return getCurveStyle(rec).fill;
      });
      closed = state.curves.some(curveIsClosed);
    }
    curveStroke.showColor(o.stroke || '');
    curveWidthField.setValue(o.strokeWidth === null ? '' : o.strokeWidth);
    ARROWHEAD_SHAPES.forEach(function(item) {
      arrowShapeBtns[item.name].classed('selected', o.arrowheads != 'none' && o.arrowShape == item.name);
    });
    ARROWHEAD_POSITIONS.forEach(function(item) {
      arrowBtns[item.name].classed('selected', o.arrowheads == item.name);
    });
    if (state.mode == 'new') {
      arrowSizeField.setValue(o.arrowheads == 'none' ? '' : getShownArrowSize(o));
    } else {
      arrowSizeField.setValue(o.arrowSize === null ? '' : o.arrowSize);
    }
    arrowSizeField.setDisabled(o.arrowheads == 'none');
    fadeField.setValue(o.fade === null ? '' : Math.round(o.fade * 1000) / 10);
    taperField.setValue(o.taper === null ? '' : Math.round(o.taper * 1000) / 10);
    curveFill.showColor(o.fill || '');
    // Only a closed curve has an inside to fill, and closed curves are rare,
    // so the row waits for one; arrowheads go on the ends of an open one.
    curveFill.row.classed('hidden', !closed);
    var noEnds = state.mode == 'selection' && state.curves.every(curveIsClosed);
    arrowShapeRow.classed('hidden', noEnds);
    arrowRow.classed('hidden', noEnds);
    taperRow.classed('hidden', noEnds);
  }

  // The size a head is drawn at: its own, or the one the stroke width gives it
  function getShownArrowSize(style) {
    var opts = internal.svg.makeLineArrowOpts('arrow', '', style.arrowSize,
      style.strokeWidth, 1);
    var size = style.arrowShape == 'dot' ? opts.dotSize : opts.size;
    return Math.round(size * 100) / 100;
  }

  function getOpenCurves() {
    return state.curves.filter(function(id) { return !curveIsClosed(id); });
  }

  function curveHasHeads(id) {
    return getArrowheadPosition(state.records[id] || {}) != 'none';
  }

  function curveIsClosed(id) {
    var shp = state.target.shapes[id];
    var last = shp ? shp.length - 1 : 0;
    return last > 2 && shp[0][0] == shp[last][0] && shp[0][1] == shp[last][1];
  }

  // The value @fn reads from every record in @ids, or null if they disagree
  function commonValue(ids, fn) {
    var val = null;
    for (var i = 0; i < ids.length; i++) {
      var v = fn(state.records[ids[i]] || {});
      if (i === 0) val = v;
      else if (v !== val) return null;
    }
    return val;
  }

  function getShownIconSize() {
    var v = Number(iconSizeField.getValue());
    return v > 0 ? v : null;
  }

  // --- applying

  function applyIconShape(shape) {
    var style;
    if (state.mode == 'new') {
      style = opts.getNewStyle().icon;
      Object.assign(style, getShapeChangeStyle(shape, style.shape, style));
      style.shape = shape;
      return update();
    }
    applyPerIcon(function(style) {
      if (style.shape == shape) return false;
      Object.assign(style, getShapeChangeStyle(shape, style.shape, style));
      style.shape = shape;
    }, 'Change symbol shape');
  }

  function applyIconSize(size) {
    if (!(size > 0)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().icon.size = size;
      return update();
    }
    applyPerIcon(function(style) {
      style.size = size;
    }, 'Resize symbol');
  }

  // A stroke given a color and no width gets a width it can be seen at
  function applyIconStroke(color) {
    applyIconPaint({stroke: color}, function(paint, shape) {
      if (color && !(paint.strokeWidth > 0)) paint.strokeWidth = getDefaultStrokeWidth(shape);
    });
  }

  function applyIconStrokeWidth(w) {
    if (!(w >= 0)) return update();
    applyIconPaint({strokeWidth: w});
  }

  // @changes: part of a paint ({fill, stroke, strokeWidth}), applied to the
  // paint each symbol has, then adjusted by @fix(paint, shape)
  function applyIconPaint(changes, fix) {
    var style;
    if (state.mode == 'new') {
      style = opts.getNewStyle().icon;
      Object.assign(style, changes);
      if (fix) fix(style, style.shape);
      return update();
    }
    applyPerIcon(function(style) {
      Object.assign(style, changes);
      if (fix) fix(style, style.shape);
    }, 'Style symbol');
  }

  function applyIconRotation(deg) {
    if (!isFinite(deg)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().icon.rotation = deg;
      return update();
    }
    applyPerIcon(function(style) {
      if (!shapeHasRotation(style.shape)) return false;
      style.rotation = deg;
    }, 'Rotate symbol');
  }

  // Restyles each icon in the selection with -symbols ids=. @change(style)
  // edits a copy of the icon's panel style, and returns false to leave the
  // icon as it is. A point with no symbol yet starts from the next symbol's
  // style, and always gets a symbol. Icons of shapes the panel doesn't offer
  // are left alone.
  function applyPerIcon(change, title) {
    applyPerRecord(state.icons, function(rec) {
      var unstyled = pointIsUnstyled(rec);
      var style = unstyled ? Object.assign({}, opts.getNewStyle().icon) : getIconStyle(rec);
      if (!style) return null;
      if (change(style) === false && !unstyled) return null;
      return getRestyleIconOptions(rec, style);
    }, title, getRestyleSymbolCommand);
  }

  // A shape for curves with no heads puts one at the end, as the layer panel
  // does for lines; each curve keeps the ends it has.
  function applyArrowShape(shape) {
    var style;
    if (state.mode == 'new') {
      style = opts.getNewStyle().curve;
      style.arrowShape = shape;
      if (style.arrowheads == 'none') style.arrowheads = 'end';
      return update();
    }
    applyPerRecord(getOpenCurves(), function(rec) {
      var position = getArrowheadPosition(rec);
      return getArrowheadFields(position == 'none' ? 'end' : position, shape);
    }, 'Style curve');
  }

  // Each curve keeps its heads' shape
  function applyArrowPosition(position) {
    var style = opts.getNewStyle().curve;
    if (state.mode == 'new') {
      style.arrowheads = position;
      return update();
    }
    applyPerRecord(getOpenCurves(), function(rec) {
      return getArrowheadFields(position, getArrowheadShape(rec) || style.arrowShape);
    }, 'Style curve');
  }

  function applyArrowSize(size) {
    if (!(size > 0)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().curve.arrowSize = size;
      return update();
    }
    runStyle({'line-end-size': size}, getOpenCurves().filter(curveHasHeads), 'Style curve');
  }

  // The field is a percent; line-fade is a share of the curve, 0-1, and no
  // fade is unset rather than stored as 0.
  function applyFade(pct) {
    var fade = pct > 0 ? Math.round(pct * 10) / 1000 : 0;
    if (!(pct >= 0)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().curve.fade = fade;
      return update();
    }
    runStyle({'line-fade': fade || ''}, getOpenCurves(), 'Style curve');
  }

  // Like the fade: a percent here, a share of the width in line-taper
  function applyTaper(pct) {
    var taper = pct > 0 ? Math.round(pct * 10) / 1000 : 0;
    if (!(pct >= 0)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().curve.taper = taper;
      return update();
    }
    runStyle({'line-taper': taper || ''}, getOpenCurves(), 'Style curve');
  }

  function applyCurveWidth(w) {
    if (!(w >= 0)) return update();
    applyCurveValues({strokeWidth: w}, {'stroke-width': w});
  }

  // @styleValues: properties of the new-curve style; @fields: the same change
  // to a curve's record. @closedOnly: the fields only apply to closed curves.
  function applyCurveValues(styleValues, fields, closedOnly) {
    var ids;
    if (state.mode == 'new') {
      Object.assign(opts.getNewStyle().curve, styleValues);
      return update();
    }
    ids = closedOnly ? state.curves.filter(curveIsClosed) : state.curves;
    runStyle(fields, ids, 'Style curve');
  }

  // Symbols of different shapes need different fields for the same change:
  // one command per distinct set of fields (-style by default), run together
  // so that they are one undo step.
  function applyPerRecord(ids, getFields, title, toCommand) {
    var groups = {};
    var cmds = [];
    ids.forEach(function(id) {
      var fields = getFields(state.records[id] || {});
      var key;
      if (!fields) return;
      key = JSON.stringify(fields);
      (groups[key] = groups[key] || {fields: fields, ids: []}).ids.push(id);
    });
    Object.keys(groups).forEach(function(key) {
      cmds.push((toCommand || getSymbolStyleCommand)(groups[key].fields, groups[key].ids));
    });
    run(cmds.join(' '), title);
  }

  function runStyle(fields, ids, title) {
    if (ids.length === 0) return update();
    run(getSymbolStyleCommand(fields, ids), title);
  }

  function run(cmd, title) {
    var ids = state.all ? null : state.ids.slice();
    if (!cmd) return update();
    runGuiEditCommand(gui, cmd, {
      title: title,
      onSuccess: function() {
        var hit = gui.map.getHitControl && gui.map.getHitControl();
        if (hit && ids) hit.setSelectionIds(ids);
        update();
      },
      onError: update
    });
  }
}
