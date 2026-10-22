import { El } from './gui-el';
import { internal } from './gui-core';
import {
  claimFieldKeys, isTextInput, opensAMenu, releasePanelFocus
} from './gui-panel-focus';
import {
  makeColorRow, makeCollapsibleSection, makePanelButton, makePanelSection,
  makePanelToggle
} from './gui-panel-controls';
import { SizeField, getLowerModeValue } from './gui-size-field';
import { formatEditingStatus } from './gui-editing-status';
import { runGuiEditCommand } from './gui-edit-command';
import { getSymbolStyleCommand, getRestyleSymbolCommand } from './gui-symbol-commands';
import { getLabelStyleCommand } from './gui-label-commands';
import {
  ARROWHEAD_POSITIONS, getShapeChangeStyle,
  getIconShape, getIconSize, getIconPaint, getIconRotation, getIconStyle,
  getRestyleIconOptions,
  getCurveStyle, getArrowheadFields, getArrowheadPosition, getArrowheadShape,
  shapeHasStrokeWidth, shapeHasRotation
} from './gui-symbol-style';
import {
  getMarkerIconSize, getAutoNumberStart, shapeTakesText, getMarkerTextStyle, getBaselineEm,
  getAddMarkerTextCommand, getRemoveMarkerTextCommand, groupRestyleOptions
} from './gui-marker-style';
import {
  FontControls, MIXED_TEXT, getFontChangeValues, getFontStyleValues
} from './gui-font-controls';
import { getNearestFontStyleVariant } from './gui-label-fonts';
import { encodeLabelText, decodeLabelText } from './gui-label-text';
import { pointIsUnstyled } from './gui-unstyled-points';
import { ARROWHEAD_SHAPES, getArrowheadGlyph } from './gui-arrowhead-shapes';
import { getIconShapes, getDefaultStrokeWidth } from './gui-icon-shapes';
import { IconShapeButtons } from './gui-icon-shape-buttons';
import { isNytUser } from './gui-nyt';

// The symbol tool's panel. With symbols selected it restyles them: icons
// through -symbols ids=, curves through -style ids=, and the text on a
// numbered marker through -labels ids= (see gui-marker-style.mjs). With none, and a tool armed, it sets the style of the next
// symbol placed, and shows the section for the kind of symbol the toolbar is
// ready to place; with no tool armed, it restyles every symbol in the layer,
// as the label panel restyles every label.
//
// opts:
//   getTarget()        the layer the symbols are in
//   getSelectedIds()   the selected symbols
//   getAllIds()        every symbol in the layer
//   getArmed()         null, 'icon' or 'curve'
//   getNewStyle()      {icon, curve, text}: the style of the next symbol, which
//                      the panel changes in place. text is the text on it,
//                      with autoNumber; its text is '' for a symbol with none.
//   getMarkerTextStyle()  a copy of the next symbol's text style, with its
//                      font and face filled in
//   isCurve(lyr, id)
//   deselect()
//   close()            the close button: hides the panel, leaving the tool on
export function SymbolPanel(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel symbol-style-panel rollover')
    .appendTo(parent).hide();
  var status, clearLink;
  var iconSection, shapeBtns, iconFill, iconSizeField, iconStroke,
      iconStrokeWidthField, rotationRow, rotationField;
  var curveSection, curveStroke, curveWidthField, arrowShapeRow, arrowShapeBtns = {},
      arrowSizeField, arrowRow, arrowBtns = {}, fadeField, taperRow, taperField, curveFill;
  var textSection, textInput, autoNumberCell, autoNumberToggle, fontControls,
      textColor, baselineField, baselineAuto;
  // what the controls describe: {mode: 'new'|'selection', icons: [ids],
  //   curves: [ids], markers: [ids], markable: [ids], records}, where markers
  //   are the icons with text on them and markable the circles and squares
  //   that could have
  var state = null;
  var shownShapes = null;

  initPanel();

  this.show = function() {
    panel.show();
    fontControls.renderFontOptions();
    this.update();
  };

  this.hide = function() {
    [iconFill, iconStroke, textColor, curveStroke, curveFill].forEach(function(c) {
      c.picker.hide();
    });
    shapeBtns.closeMenu();
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
    initTextSection();
    initCurveSection();
  }

  // A number or letter in a circle or square: a numbered marker. Typing text
  // is what puts it on, as picking a color puts on a label's halo, and the ×
  // takes it off.
  function initTextSection() {
    var o = makeCollapsibleSection(panel, 'Label', {
      onRemove: removeText,
      removeTitle: 'Remove label'
    });
    var section = o.section;
    var row, cell;
    textSection = o;

    // A number or a letter, so the field is a few characters wide, captioned
    // beside it rather than over it, with Auto at the far end of the column
    row = El('div').addClass('label-style-row label-split-row').appendTo(section);
    cell = El('div').addClass('label-split-cell symbol-label-text-cell').appendTo(row);
    textInput = El('input').attr('type', 'text').attr('aria-label', 'Label text')
      .addClass('symbol-label-text-input').appendTo(cell)
      // The next symbol's text is what the field holds, as it is typed: there
      // is no command to wait for, and a click on the map is the commit
      .on('input', function() {
        if (state && state.mode == 'new') applyText(getTypedText());
      })
      .on('change', function() {
        if (state && state.mode != 'new') applyText(getTypedText());
      });
    El('span').appendTo(cell).text('Text');
    // Each symbol placed takes the next number or letter
    autoNumberCell = El('div').addClass('symbol-label-auto').appendTo(cell);
    autoNumberToggle = makePanelToggle(autoNumberCell, {
      title: 'Auto',
      onChange: applyAutoNumber
    });
    El('span').appendTo(autoNumberCell).text('Auto');

    fontControls = new FontControls(section, {
      onFont: applyTextFont,
      onFace: applyTextFace,
      onSize: applyTextSize,
      onSizeStep: function(delta) {
        var size = Number(fontControls.getSize());
        if (size > 0) applyTextSize(Math.max(1, size + delta));
      },
      onDone: releaseFocus
    });

    textColor = makeColorRow(section, {
      label: 'Color',
      ariaLabel: 'Text color',
      noOpacity: true,
      onColor: applyTextColor,
      revert: update
    });
    // How far below the symbol's centre the text's baseline sits. Left alone,
    // the font's capitals are centred, which a figure in a lining font fills;
    // this is for the font that sits its figures differently.
    cell = El('span').appendTo(textColor.aside).text('Baseline ');
    baselineAuto = El('span').addClass('colored-text symbol-baseline-auto')
      .attr('role', 'button').appendTo(cell).text('auto')
      .on('click', function() { applyBaseline(''); });
    baselineField = new SizeField(textColor.aside, {
      min: -99,
      max: 99,
      step: 0.5,
      bigStep: 2,
      title: 'Baseline of the text below the center of the symbol, in px',
      onSet: applyBaseline,
      onStep: function(delta) {
        var val = baselineField.getValue();
        if (val !== null) applyBaseline(Math.round((val + delta) * 10) / 10);
      },
      onDone: releaseFocus
    });
  }

  function initIconSection() {
    // Not "Symbol": icons and curves are both symbols
    iconSection = makePanelSection(panel, 'Icons');
    var shapeRow = El('div').addClass('label-style-row label-icon-shapes-row').appendTo(iconSection);
    var group = El('div').addClass('label-btn-group label-icon-buttons').appendTo(shapeRow);
    shapeBtns = new IconShapeButtons(group, getShownShapes(), applyIconShape);

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
        applyIconSize(Math.max(1, getIconSizeStepBase() + delta));
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
    curveSection = makePanelSection(panel, 'Curves').addClass('symbol-curve-section');
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

  // Read once, when first asked: whether the NYT icons are offered does not
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
      markers: [],
      markable: [],
      records: records
    };
    ids.forEach(function(id) {
      (opts.isCurve(lyr, id) ? o.curves : o.icons).push(id);
    });
    o.icons.forEach(function(id) {
      var rec = records[id] || {};
      if (internal.svg.featureIsMarker(rec)) {
        o.markers.push(id);
      } else if (!pointIsUnstyled(rec) && shapeTakesText(getIconShape(rec))) {
        o.markable.push(id);
      }
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
      newShapes: armed == 'curve' ? 'curves' : armed ? 'icons' : null
    }));
    clearLink.classed('hidden', state.mode != 'selection' || state.all);
    toggle(iconSection, state.mode == 'selection' ? state.icons.length > 0 : armed != 'curve');
    toggle(curveSection, state.mode == 'selection' ? state.curves.length > 0 : armed == 'curve');
    toggle(textSection.section, state.mode == 'selection' ?
      state.markers.length + state.markable.length > 0 : armed != 'curve');
    // A rule between the icon controls and the curve controls, when both show
    curveSection.classed('symbol-section-rule', iconSection.visible() && curveSection.visible());
    updateIconControls();
    updateTextControls();
    updateCurveControls();
  }

  // Text on the next symbol, or on any of the selected ones: their shape can
  // only be one with room for it
  function textLimitsShape() {
    return state.mode == 'new' ? !!opts.getNewStyle().text.text : state.markers.length > 0;
  }

  // The style the Text controls show: the next marker's, or the selected
  // markers' where they agree ('' where they do not). With no markers
  // selected, the next marker's, which is what text typed for the selection
  // is set in.
  function getShownTextStyle() {
    var o, keys;
    if (state.mode == 'new' || state.markers.length === 0) {
      o = opts.getMarkerTextStyle();
      if (state.mode == 'selection') o.text = '';
      return o;
    }
    o = {};
    keys = ['text', 'font', 'style', 'weight', 'size', 'color', 'baseline'];
    keys.forEach(function(key) {
      var val = commonValue(state.markers, function(rec) { return getMarkerTextStyle(rec)[key]; });
      o[key] = val === null ? '' : val;
      o[key + 'Mixed'] = val === null;
    });
    return o;
  }

  function updateTextControls() {
    var t = getShownTextStyle();
    var noMarkers = state.mode == 'selection' && state.markers.length === 0;
    var presence;
    if (state.mode == 'new') {
      presence = t.text ? 'on' : 'off';
    } else {
      presence = state.markers.length === 0 ? 'off' :
        state.markable.length > 0 ? 'mixed' : 'on';
    }
    textSection.setPresence(presence);
    showTypedText(decodeLabelText(t.text || ''));
    autoNumberToggle.setState(opts.getNewStyle().text.autoNumber ? 'on' : 'off');
    // Selected symbols with no text yet are given it in the next marker's
    // style, which the selection has no say in until then
    fontControls.showFont({value: t.font, mixed: !!t.fontMixed}, noMarkers);
    fontControls.showFace(t.font, t.styleMixed ? '' : t.style || 'normal',
      t.weightMixed ? '' : t.weight || '400', noMarkers);
    fontControls.showSize({value: t.size, mixed: !!t.sizeMixed}, noMarkers);
    textColor.showColor(t.color || '');
    textColor.input.node().disabled = noMarkers;
    // An automatic baseline shows where it is, as a value, as any unset
    // property in the panels shows the one it is drawn with
    baselineField.setValue(t.baseline === '' && !t.baselineMixed ? formatAutoBaseline(t) : t.baseline);
    baselineField.setPlaceholder(t.baselineMixed ? MIXED_TEXT : '');
    baselineField.setDisabled(noMarkers);
    baselineAuto.classed('hidden', noMarkers || t.baseline === '' && !t.baselineMixed);
  }

  // The next symbol's text is applied as it is typed, so the field can always
  // show it -- it is only rewritten when it says something else, which keeps
  // the caret where it is. Typing for a selection is applied on Enter or
  // when the field is left, and is not overwritten before then.
  function showTypedText(str) {
    var el = textInput.node();
    if (state.mode != 'new' && document.activeElement === el) return;
    if (state.mode == 'new' && getTypedText() == str) return;
    el.value = str;
  }

  // Where the text's baseline goes with no baseline of its own, in px: the
  // cap height centred, as svg-properties.mjs places it
  function getAutoBaseline(t) {
    var em, size = Number(t.size);
    if (!(size > 0)) return null;
    em = parseFloat(internal.getCapCentredOffset({'font-family': t.font,
      'font-style': t.style, 'font-weight': t.weight}));
    return isFinite(em) ? Math.round(em * size * 10) / 10 : null;
  }

  function formatAutoBaseline(t) {
    var val = t.sizeMixed || t.fontMixed ? null : getAutoBaseline(t);
    return val === null ? '' : String(val);
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
    shapeBtns.update(shape || '', function(name) {
      return textLimitsShape() && !shapeTakesText(name);
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

  function getIconSizeStepBase() {
    var shown = getShownIconSize();
    if (shown !== null) return shown;
    return getLowerModeValue(state.icons.map(function(id) {
      return getIconSize(state.records[id] || {});
    })) || 0;
  }

  // --- applying

  function applyIconShape(shape) {
    var style;
    if (textLimitsShape() && !shapeTakesText(shape)) return;
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

  function getTypedText() {
    return textInput.node().value.trim();
  }

  // Auto with nothing typed starts the count at 1, which makes the next
  // symbol a marker, as typing a 1 would; with a number or letter that a
  // marker already has, at the next one none has. With symbols selected it is
  // still the setting for the symbols placed next, and leaves the selection
  // alone.
  function applyAutoNumber(on) {
    var t = opts.getNewStyle().text;
    t.autoNumber = on;
    if (on && state.mode == 'new') {
      if (t.text) {
        t.text = getAutoNumberStart(t.text, getMarkerTexts());
      } else {
        t.text = '1';
        prepareMarkerIcon(opts.getNewStyle().icon);
      }
    }
    update();
  }

  // The text of every marker in the layer, as it is now: a command may have
  // replaced its records since the panel last read them
  function getMarkerTexts() {
    var lyr = opts.getTarget();
    var records = lyr && lyr.data ? lyr.data.getRecords() : [];
    return records.filter(internal.svg.featureIsMarker).map(function(rec) {
      return String(rec['label-text']);
    });
  }

  // Text typed for the next symbol makes it a marker. Typed for a selection,
  // it replaces the markers' text and puts it on the circles and squares, in
  // the next marker's style; emptied, it takes the text off.
  function applyText(value) {
    var cmds = [];
    if (state.mode == 'new') {
      opts.getNewStyle().text.text = value;
      if (value) prepareMarkerIcon(opts.getNewStyle().icon);
      return update();
    }
    if (!value) return removeText();
    if (state.markers.length > 0) {
      cmds.push(getLabelStyleCommand({text: encodeLabelText(value)}, state.markers.join(',')));
    }
    if (state.markable.length > 0) {
      cmds.push(getAddMarkerTextCommand(Object.assign(opts.getMarkerTextStyle(), {text: value}),
        groupRestyleOptions(state.records, state.markable, getIconStyle),
        state.markable.filter(hasStroke)));
    }
    run(cmds.join(' '), state.markable.length > 0 ? 'Add text' : 'Edit text');
  }

  // The next symbol, given text: a shape and a size with room for it
  function prepareMarkerIcon(icon) {
    if (!shapeTakesText(icon.shape)) {
      Object.assign(icon, getShapeChangeStyle('circle', icon.shape, icon));
      icon.shape = 'circle';
    }
    icon.size = getMarkerIconSize(icon.size);
  }

  // A circle's stroke= outlines the text of a label, so it comes off
  function hasStroke(id) {
    var rec = state.records[id] || {};
    return ['stroke', 'stroke-width'].some(function(name) {
      return rec[name] !== undefined && rec[name] !== null && rec[name] !== '';
    });
  }

  function removeText() {
    if (state.mode == 'new') {
      opts.getNewStyle().text.text = '';
      return update();
    }
    if (state.markers.length === 0) return update();
    run(getRemoveMarkerTextCommand(groupRestyleOptions(state.records, state.markers, getIconStyle)),
      'Remove text');
  }

  function applyTextFont(fontName) {
    var t = opts.getNewStyle().text;
    var variant;
    if (state.mode == 'new') {
      t.font = fontName;
      variant = getNearestFontStyleVariant(fontName, t.style, t.weight);
      if (variant) {
        t.style = variant.style;
        t.weight = variant.weight;
      }
      return update();
    }
    applyPerMarker(function(rec) {
      return getFontChangeValues(fontName, rec['font-style'] || 'normal',
        String(rec['font-weight'] || '400'));
    });
  }

  function applyTextFace(variant) {
    var t = opts.getNewStyle().text;
    if (state.mode == 'new') {
      t.style = variant.style;
      t.weight = variant.weight;
      return update();
    }
    applyPerMarker(function() { return getFontStyleValues(variant); });
  }

  function applyTextSize(size) {
    if (!(size > 0)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().text.size = size;
      return update();
    }
    applyPerMarker(function() { return [['font-size', size]]; });
  }

  // '' gives the text back its default black
  function applyTextColor(color) {
    if (state.mode == 'new') {
      opts.getNewStyle().text.color = color;
      return update();
    }
    applyPerMarker(function() { return [['fill', color]]; });
  }

  // @px: the baseline in px, or '' for the automatic one. Stored in em, for
  // each marker's own font size (see getMarkerTextFields()).
  function applyBaseline(px) {
    if (px !== '' && !isFinite(px)) return update();
    if (state.mode == 'new') {
      opts.getNewStyle().text.baseline = px;
      return update();
    }
    applyPerMarker(function(rec) {
      return [['dy', px === '' ? '' : getBaselineEm(px, getMarkerTextStyle(rec).size)]];
    });
  }

  // Restyles the text of the selected markers with -labels ids=: one command
  // per distinct set of [field, value] pairs @getValues(rec) gives, as one undo
  // step. Selected symbols with no text are left alone.
  function applyPerMarker(getValues) {
    var groups = {};
    var cmds = [];
    state.markers.forEach(function(id) {
      var values = {};
      var key;
      getValues(state.records[id] || {}).forEach(function(pair) {
        values[pair[0]] = pair[1];
      });
      key = JSON.stringify(values);
      (groups[key] = groups[key] || {values: values, ids: []}).ids.push(id);
    });
    Object.keys(groups).forEach(function(key) {
      cmds.push(getLabelStyleCommand(groups[key].values, groups[key].ids.join(',')));
    });
    if (cmds.length === 0) return update();
    run(cmds.join(' '), 'Style text');
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
