import { isHexColor } from './gui-color-picker';
import { El } from './gui-el';
import {
  claimFieldKeys, isTextInput, opensAMenu, releasePanelFocus
} from './gui-panel-focus';
import {
  makeColorRow, makeFieldTip, makePanelActionButton, makePanelButton, makePanelSection,
  makePanelToggle
} from './gui-panel-controls';
import { calloutButtonSymbols } from './gui-label-tool';
import { formatEditingStatus } from './gui-editing-status';
import { SizeField } from './gui-size-field';
import {
  parseOpacityValue, formatOpacityPct, formatColorOpacityPct, normalizeDashArrayInput
} from './gui-style-values';
import { StylePresetControl } from './gui-style-preset-control';
import { PatternFillControl } from './gui-pattern-fill-control';
import { GlowEffectsControl } from './gui-glow-control';
import { groupStyleEdits } from './gui-fill-pattern';
import { runGuiEditCommand } from './gui-edit-command';
import { internal } from './gui-core';
import { quoteCommandValue } from './gui-command-utils';
import { ColorSchemePanel, getStripBackground } from './gui-color-scheme-panel';
import { getLayerScheme } from './gui-color-scheme-model';

var savedStylesKey = 'layer_style_presets';
var styleFields = ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'line-start', 'line-end', 'line-end-size', 'line-fade', 'fill', 'fill-opacity', 'fill-pattern'].concat(internal.svg.glowFields);
var arrowShapes = [{
  name: 'arrow',
  title: 'solid arrowheads'
}, {
  name: 'open-arrow',
  title: 'open arrowheads'
}, {
  name: 'dot',
  title: 'dots'
}];
// The arrows are the label callout's, which point left, the way a line's
// start head does; the dot's left edge is where their tips are.
var arrowButtonSymbols = {
  arrow: calloutButtonSymbols.arrow,
  'open-arrow': calloutButtonSymbols['open-arrow'],
  dot: '<path d="M5 8H13"></path><circle class="fill" cx="5" cy="8" r="2.6"></circle>'
};
var arrowPositions = [{
  name: 'start',
  label: 'Start',
  title: 'arrowhead at the start of the line'
}, {
  name: 'end',
  label: 'End',
  title: 'arrowhead at the end of the line'
}, {
  name: 'both',
  label: 'Both',
  title: 'arrowheads at both ends of the line'
}];
var lineCaps = [{
  name: 'round',
  label: 'Round',
  title: 'round line caps'
}, {
  name: 'butt',
  label: 'Butt',
  title: 'flat line caps that end at the line\'s endpoints'
}, {
  name: 'square',
  label: 'Square',
  title: 'flat line caps that extend past the line\'s endpoints'
}];

export function LayerStyleTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel layer-style-panel rollover').appendTo(parent).hide();
  var title, editingStatus, clearLink, strokeControl, fillControl, strokeWidthField, capControl, dashControl, arrowControl, presetControl, patternControl, glowControl, hit;
  var schemeBtn, schemeStrip, schemePanel;
  var targetLayer = null;
  // What the arrowhead switch turns on, for lines that have no heads
  var lastArrow = {shape: 'arrow', position: 'end', fade: 0};

  initPanel();
  hit = gui.map.getHitControl && gui.map.getHitControl();
  if (hit) {
    hit.on('change', function(e) {
      if (targetLayer && (e.mode == 'line_style' || e.mode == 'polygon_style')) {
        updateControls();
      }
    });
  }

  this.open = function(lyr, dataset) {
    if (!layerCanBeStyled(lyr)) return;
    if (!gui.map.isActiveLayer(lyr)) {
      modelSelectLayer(lyr, dataset);
    }
    gui.interaction.setMode(lyr.geometry_type == 'polygon' ? 'polygon_style' : 'line_style');
  };

  gui.on('interaction_mode_change', function(e) {
    if (modeMatchesActiveLayer(e.mode)) {
      turnOn();
    } else {
      turnOff();
    }
  });

  gui.model.on('update', function() {
    if (panel.visible() && !modeMatchesActiveLayer(gui.interaction.getMode())) {
      gui.interaction.turnOff();
    } else if (panel.visible()) {
      updateControls();
    }
  });

  gui.on('undo_redo_post', function() {
    if (panel.visible()) {
      updateControls();
    }
  });

  function turnOn() {
    targetLayer = getActiveLayer();
    patternControl.reset();
    applyDefaultLineStyle();
    panel.show();
    updateControls();
  }

  function turnOff() {
    schemePanel.close();
    panel.hide();
    strokeControl.picker.hide();
    fillControl.picker.hide();
    patternControl.hidePicker();
    patternControl.reset();
    glowControl.reset();
    targetLayer = null;
  }

  function initPanel() {
    // The same rules as the label panel's fields, minus the label being typed
    // into: there is nothing here for the keyboard to go back to, so a field
    // that is finished with gives it up altogether.
    claimFieldKeys(panel.node(), {
      revert: updateControls,
      release: releaseFocus
    });

    // For the controls that take focus and then set no style -- the colour
    // picker's Close button, and the panel's own buttons in the browsers that
    // focus a button on click. Left alone while the user is typing into a
    // field, which a click elsewhere in the panel ends on its own.
    panel.node().addEventListener('click', function(e) {
      if (isTextInput(document.activeElement) || opensAMenu(e.target)) return;
      releaseFocus();
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    title = El('span').appendTo(header);
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', closePanel);

    var editRow = El('div').addClass('label-style-row label-style-selection-row layer-style-selection-row').appendTo(panel);
    editingStatus = El('span').addClass('label-editing-status').appendTo(editRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(editRow).text('deselect').on('click', clearSelection);

    strokeControl = addColorControl(panel, 'Stroke', 'stroke', '#000000');
    strokeWidthField = addStrokeWidthControl(strokeControl.aside);
    fillControl = addColorControl(panel, 'Fill', 'fill', '');
    addColorSchemeControl();
    var lineRow = El('div').addClass('label-style-row label-split-row layer-line-row').appendTo(panel);
    capControl = addLineCapControl(lineRow);
    dashControl = addDashArrayControl(lineRow);
    dashControl.row = lineRow;
    arrowControl = addArrowControl(panel);

    var buttonRow = El('div').addClass('label-style-row label-panel-button-row').appendTo(panel);
    makePanelActionButton(buttonRow, 'Clear style', clearLayerStyle);

    patternControl = new PatternFillControl(panel, {
      getRecords: function() {
        return targetLayer && targetLayer.data ? targetLayer.data.getRecords() : [];
      },
      getTargetIds: getTargetIds,
      applyEdits: runStyleEdits,
      revert: updateControls,
      releaseFocus: releaseFocus
    });

    glowControl = new GlowEffectsControl(panel, {
      getRecords: getTargetRecords,
      getTargetIds: getTargetIds,
      applyEdits: runStyleEdits,
      revert: updateControls,
      releaseFocus: releaseFocus
    });

    presetControl = new StylePresetControl(panel, {
      storageKey: savedStylesKey,
      type: getStyleType,
      saveTitle: 'Save layer style',
      styleLabel: 'layer style',
      getStyle: getCurrentStyle,
      applyStyle: applyStyleObject,
      filter: function(item, type) {
        return item.type == type;
      },
      sort: function(a, b) {
        return getSortKey(a) < getSortKey(b) ? -1 :
          getSortKey(a) > getSortKey(b) ? 1 : 0;
      }
    });
  }

  function addColorControl(parent, label, field, defaultColor) {
    var control = makeColorRow(parent, {
      label: label,
      onColor: function(color) {
        // An emptied field unsets the colour: -style reads an empty value as
        // "remove this".
        applyColorControlStyle(control, color);
      },
      onOpacity: function(value) {
        applyLayerStyle(field + '-opacity', value);
      },
      revert: updateControls
    });
    control.field = field;
    control.defaultColor = defaultColor;
    return control;
  }

  // Fills colored by a data field. While a scheme is applied, its colors take
  // the place of the fill's swatch and hex value, which have no one value to
  // show; the opacity still applies. Clicking them reopens the scheme.
  function addColorSchemeControl() {
    var box = fillControl.input.parent();
    schemeStrip = El('div').addClass('layer-scheme-strip').attr('role', 'button')
      .attr('aria-label', 'Edit color scheme');
    box.node().insertBefore(schemeStrip.node(), fillControl.input.node());
    schemeStrip.on('click', openColorSchemePanel);
    El('div').addClass('layer-scheme-colors').appendTo(schemeStrip);
    El('div').addClass('layer-scheme-remove').attr('role', 'button')
      .attr('aria-label', 'Remove color scheme').attr('title', 'Remove color scheme')
      .text('×').appendTo(schemeStrip)
      .on('click', function(e) {
        e.stopPropagation();
        removeColorScheme();
      });
    schemeBtn = makePanelActionButton(fillControl.aside, 'Palettes', openColorSchemePanel)
      .addClass('layer-palettes-btn');
    schemePanel = new ColorSchemePanel(gui, {
      getExtraCommands: function() {
        if (!targetLayer) return '';
        return formatStyleEditCommands(patternControl.getRefillExpressionEdits(getAllFeatureIds(targetLayer)));
      },
      getSelectionCount: function() {
        return getSelectionIds().length;
      },
      onUpdate: function() {
        if (panel.visible()) updateControls();
      },
      onClose: function() {
        panel.removeClass('replaced');
      }
    });
  }

  function openColorSchemePanel() {
    syncTargetLayer();
    if (!targetLayer || targetLayer.geometry_type != 'polygon') return;
    fillControl.picker.hide();
    strokeControl.picker.hide();
    patternControl.hidePicker();
    // The scheme panel takes this panel's place until it closes
    panel.addClass('replaced');
    schemePanel.open(targetLayer);
  }

  // Back to a single fill, unset, as when the fill field is emptied
  function removeColorScheme() {
    schemePanel.close();
    applyColorControlStyle(fillControl, '');
  }

  function updateColorSchemeControl() {
    var isPolygon = targetLayer && targetLayer.geometry_type == 'polygon';
    var scheme = isPolygon ? getLayerScheme(targetLayer) : null;
    schemeBtn.classed('hidden', !isPolygon);
    fillControl.input.parent().classed('has-scheme', !!scheme);
    schemeBtn.classed('selected', schemePanel.isOpen());
    if (scheme) {
      schemeStrip.findChild('.layer-scheme-colors')
        .css('background-image', getStripBackground(scheme.colors));
      schemeStrip.attr('title', 'Colored by ' + scheme.field);
      fillControl.picker.hide();
    }
  }

  // In the narrow column beside the stroke's colour. Stepping runs up a ladder
  // of widths rather than by a fixed amount, because the useful ones are close
  // together at the hairline end and far apart above 2px.
  function addStrokeWidthControl(cell) {
    El('span').appendTo(cell).text('Width');
    return new SizeField(cell, {
      min: 0,
      // Quarter-pixel widths are the useful hairlines, and the ladder below
      // steps through them.
      decimals: 2,
      title: 'Stroke width in px',
      onSet: applyStrokeWidthStyle,
      onStep: function(delta) {
        nudgeStrokeWidth(delta > 0 ? 1 : -1);
      },
      onDone: releaseFocus
    });
  }

  // Round is the default, except on a dashed line, which the renderers give
  // butt caps unless it has a cap of its own.
  function addLineCapControl(row) {
    var cell = El('div').addClass('label-split-cell label-align-row').appendTo(row);
    var control = {btns: {}};
    El('span').appendTo(cell).text('Caps');
    var group = El('div').addClass('label-btn-group layer-cap-buttons').appendTo(cell);
    lineCaps.forEach(function(item) {
      control.btns[item.name] = makePanelButton(group, item.label, function() {
        applyLineCap(item.name);
      }).attr('data-line-cap', item.name).attr('aria-label', item.title);
    });
    return control;
  }

  function getDefaultLineCap(rec) {
    return rec && rec['stroke-dasharray'] ? 'butt' : 'round';
  }

  function getLineCap(rec) {
    return rec && rec['stroke-linecap'] || getDefaultLineCap(rec);
  }

  // A cap that is the line's default is unset rather than stored, so that a
  // layer left at Round gets no stroke-linecap column.
  function applyLineCap(cap) {
    var records = getTargetRecords();
    var edits = [];
    getTargetIds().forEach(function(id) {
      var rec = records[id] || {};
      var value = cap == getDefaultLineCap(rec) ? '' : cap;
      if (value != (rec['stroke-linecap'] || '')) {
        edits.push({id: id, styles: [['stroke-linecap', value]]});
      }
    });
    runStyleEdits(edits);
  }

  function updateLineCapControl() {
    var records = getTargetRecords();
    var cap;
    getTargetIds().forEach(function(id, i) {
      var val = getLineCap(records[id]);
      cap = i === 0 || val == cap ? val : '';
    });
    lineCaps.forEach(function(item) {
      capControl.btns[item.name].classed('selected', item.name == cap);
    });
  }

  // A literal stroke-dasharray, in the narrow column beside the caps. A blank
  // field makes the line solid again.
  function addDashArrayControl(row) {
    var cell = El('div').addClass('label-split-cell layer-dash-cell').appendTo(row);
    var caption = El('div').addClass('label-style-row-label').appendTo(cell).text('Dashes');
    makeFieldTip(caption,
      'Dash and gap lengths in pixels, separated\n' +
      'by spaces. "4" gives 4px dashes and 4px gaps.\n' +
      '"6 3" gives 6px dashes and 3px gaps.');
    var input = El('input').attr('type', 'text').appendTo(cell)
      .on('change', function() {
        var value = normalizeDashArrayInput(input.node().value);
        if (value && internal.parseStyleLiteral('stroke-dasharray', value) === undefined) {
          updateControls();
          return;
        }
        applyDashArrayStyle(value);
      });
    return {input: input};
  }

  // A switch in the heading says whether the lines have arrowheads; the rows
  // under it are the head's shape with its size beside it, then which ends
  // get it with the line's fade beside that. A line has one shape for both
  // ends, which is all the panel sets, though -style can give the two ends
  // different ones.
  function addArrowControl(parent) {
    var section = makePanelSection(parent, 'Arrowheads');
    var toggle = makePanelToggle(section.findChild('.label-style-section-title'), {
      title: 'Add arrowheads',
      className: 'layer-arrow-toggle',
      onChange: setArrowsOn
    });
    var shapeRow = El('div').addClass('label-style-row label-split-row').appendTo(section);
    var shapeCell = El('div').addClass('label-split-cell label-align-row').appendTo(shapeRow);
    var sizeCell = El('div').addClass('label-split-cell label-spacing-row layer-arrow-size-row').appendTo(shapeRow);
    var posRow = El('div').addClass('label-style-row label-split-row').appendTo(section);
    var posCell = El('div').addClass('label-split-cell label-align-row').appendTo(posRow);
    var fadeCell = El('div').addClass('label-split-cell layer-arrow-fade-cell').appendTo(posRow);
    var control = {section: section, toggle: toggle, shapeBtns: {}, posBtns: {}};
    El('span').appendTo(shapeCell).text('Shape');
    var shapeGroup = El('div').addClass('label-btn-group label-callout-buttons layer-arrow-shape-buttons').appendTo(shapeCell);
    arrowShapes.forEach(function(item) {
      var btn = makePanelButton(shapeGroup, '', function() {
        applyArrowShape(item.name);
      }).attr('data-arrow-shape', item.name).attr('aria-label', item.title);
      El('<svg class="label-callout-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
        arrowButtonSymbols[item.name] + '</svg>').appendTo(btn);
      control.shapeBtns[item.name] = btn;
    });
    El('span').appendTo(posCell).text('Ends');
    var posGroup = El('div').addClass('label-btn-group layer-arrow-position-buttons').appendTo(posCell);
    arrowPositions.forEach(function(item) {
      control.posBtns[item.name] = makePanelButton(posGroup, item.label, function() {
        applyArrowPosition(item.name);
      }).attr('data-arrow-position', item.name).attr('aria-label', item.title);
    });
    El('span').appendTo(sizeCell).text('Size');
    control.sizeField = new SizeField(sizeCell, {
      title: 'Arrowhead size in px, the length of its sides or the diameter of a dot',
      min: 1,
      max: 60,
      step: 1,
      bigStep: 5,
      onSet: applyArrowSize,
      onStep: nudgeArrowSize,
      onDone: releaseFocus
    });
    var fadeCaption = El('div').addClass('label-style-row-label').appendTo(fadeCell).text('Fade %');
    makeFieldTip(fadeCaption,
      'How much of the line fades in from its\n' +
      'tail, as a percent of its length. The fade\n' +
      'is a straight gradient, so it follows\n' +
      'straight and gently curved lines best.');
    control.fadeField = new SizeField(fadeCell, {
      title: 'Percent of the line that fades in from its tail',
      min: 0,
      max: 100,
      step: 5,
      bigStep: 25,
      onSet: applyArrowFade,
      onStep: nudgeArrowFade,
      onDone: releaseFocus
    });
    return control;
  }

  // {shape, position} for one record, 'none' and '' when it has no heads. A
  // line whose two ends have different shapes reports the start's.
  function getArrowInfo(rec) {
    var start = internal.svg.getLineEndType(rec || {}, 'line-start');
    var end = internal.svg.getLineEndType(rec || {}, 'line-end');
    var shape = start != 'none' ? start : end;
    var position = start != 'none' && end != 'none' ? 'both' :
      start != 'none' ? 'start' : end != 'none' ? 'end' : '';
    return {shape: shape, position: position};
  }

  // Switching on gives the lines that have no heads the last shape, ends and
  // fade the section showed, so that off and on again is a round trip; the
  // lines that have heads keep theirs. Switching off leaves line-end-size
  // alone, for the same reason, but removes the fade, which would otherwise
  // go on showing with its control hidden.
  function setArrowsOn(on) {
    applyArrowEdits(function(info) {
      return on ? fillArrowInfo(info) : {shape: 'none', position: ''};
    });
  }

  // Each target keeps whichever of shape and position is not being set, so
  // that changing the shape of a selection whose lines point different ways
  // leaves them pointing those ways.
  function applyArrowShape(shape) {
    applyArrowEdits(function(info) {
      return {shape: shape, position: fillArrowInfo(info).position};
    });
  }

  function applyArrowPosition(position) {
    applyArrowEdits(function(info) {
      return {shape: fillArrowInfo(info).shape, position: position};
    });
  }

  function fillArrowInfo(info) {
    return info.shape == 'none' ? {shape: lastArrow.shape, position: lastArrow.position} : info;
  }

  function applyArrowEdits(getNext) {
    var records = getTargetRecords();
    var addStroke = styleFieldIsUnsetForTargets('stroke');
    var edits = [];
    getTargetIds().forEach(function(id) {
      var rec = records[id] || {};
      var info = getArrowInfo(rec);
      var next = getNext(info);
      var on = next.shape != 'none';
      var styles = [
        ['line-start', on && next.position != 'end' ? next.shape : ''],
        ['line-end', on && next.position != 'start' ? next.shape : '']
      ].filter(function(style) {
        // no need to remove what is not there
        return style[1] || rec[style[0]];
      });
      if (!on && rec['line-fade']) {
        styles.push(['line-fade', '']);
      } else if (on && info.shape == 'none' && lastArrow.fade > 0 && !rec['line-fade']) {
        styles.push(['line-fade', lastArrow.fade]);
      }
      if (on && addStroke) styles.push(['stroke', strokeControl.defaultColor]);
      if (styles.length > 0) edits.push({id: id, styles: styles});
    });
    runStyleEdits(edits);
  }

  function applyArrowSize(value) {
    var ids = getArrowTargetIds();
    if (ids.length === 0) return;
    runStyleEdits(ids.map(function(id) {
      return {id: id, styles: [['line-end-size', value]]};
    }));
  }

  function nudgeArrowSize(delta) {
    var shown = getArrowSizeShown(getArrowTargetIds());
    var size = Number(shown.value);
    if (!isFinite(size) || shown.value === '') return;
    applyArrowSize(Math.max(1, Math.round(size + delta)));
  }

  // The field is a percent; line-fade is a share of the line, 0-1. No fade
  // is unset rather than stored as 0.
  function applyArrowFade(pct) {
    var ids = getArrowTargetIds();
    var value = pct > 0 ? Math.round(pct * 10) / 1000 : '';
    if (ids.length === 0) return;
    runStyleEdits(ids.map(function(id) {
      return {id: id, styles: [['line-fade', value]]};
    }));
  }

  function nudgeArrowFade(delta) {
    var shown = getArrowFadeShown(getArrowTargetIds());
    if (shown.value === '') return;
    applyArrowFade(Math.max(0, Math.min(100, Math.round(shown.value + delta))));
  }

  function getArrowFadeShown(ids) {
    var records = getTargetRecords();
    var value = '', pct;
    for (var i=0; i<ids.length; i++) {
      pct = Math.round(internal.svg.parseLineFade(records[ids[i]] && records[ids[i]]['line-fade']) * 1000) / 10;
      if (i > 0 && pct !== value) return {value: '', mixed: true};
      value = pct;
    }
    return {value: value, mixed: false};
  }

  function getArrowTargetIds() {
    var records = getTargetRecords();
    return getTargetIds().filter(function(id) {
      return getArrowInfo(records[id]).shape != 'none';
    });
  }

  // The size a head is drawn at, which is the one its line width gives it
  // when it has none of its own.
  function getArrowSizeShown(ids) {
    var records = getTargetRecords();
    var value = '', size;
    for (var i=0; i<ids.length; i++) {
      size = getArrowSize(records[ids[i]]);
      if (i > 0 && size !== value) return {value: '', mixed: true};
      value = size;
    }
    return {value: value, mixed: false};
  }

  function getArrowSize(rec) {
    var opts = internal.svg.makeLineArrowOpts('arrow', '', rec && rec['line-end-size'],
      rec && rec['stroke-width'], 1);
    var size = getArrowInfo(rec).shape == 'dot' ? opts.dotSize : opts.size;
    return formatNumberValue(Math.round(size * 100) / 100);
  }

  // The shape and ends shown are those of the lines with heads; lines
  // without are what the switch's mixed state is for.
  function updateArrowControl() {
    var records = getTargetRecords();
    var ids = getTargetIds();
    var arrowIds = getArrowTargetIds();
    var shape, position, info;
    for (var i=0; i<arrowIds.length; i++) {
      info = getArrowInfo(records[arrowIds[i]]);
      if (i === 0) {
        shape = info.shape;
        position = info.position;
      } else {
        if (info.shape != shape) shape = '';
        if (info.position != position) position = '';
      }
    }
    if (shape) lastArrow.shape = shape;
    if (position) lastArrow.position = position;
    var state = arrowIds.length === 0 ? 'off' :
      arrowIds.length < ids.length ? 'mixed' : 'on';
    arrowControl.toggle.setState(state);
    arrowControl.section.classed('collapsed', state == 'off');
    arrowShapes.forEach(function(item) {
      arrowControl.shapeBtns[item.name].classed('selected', item.name == shape);
    });
    arrowPositions.forEach(function(item) {
      arrowControl.posBtns[item.name].classed('selected', item.name == position);
    });
    var shown = arrowIds.length > 0 ? getArrowSizeShown(arrowIds) : {value: '', mixed: false};
    arrowControl.sizeField.setValue(shown.value);
    arrowControl.sizeField.setPlaceholder(shown.mixed ? 'mixed' : '');
    arrowControl.sizeField.setDisabled(arrowIds.length === 0);
    var fade = arrowIds.length > 0 ? getArrowFadeShown(arrowIds) : {value: '', mixed: false};
    if (fade.value !== '') lastArrow.fade = fade.value / 100;
    arrowControl.fadeField.setValue(fade.value);
    arrowControl.fadeField.setPlaceholder(fade.mixed ? 'mixed' : '');
    arrowControl.fadeField.setDisabled(arrowIds.length === 0);
  }

  function getTargetRecords() {
    return targetLayer && targetLayer.data ? targetLayer.data.getRecords() : [];
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  function updateControls() {
    syncTargetLayer();
    var geom = targetLayer && targetLayer.geometry_type;
    var manualIds = getSelectionIds();
    if (!targetLayer) return;
    title.text(geom == 'polygon' ? 'Polygon styles' : 'Line styles');
    updateEditingStatus(manualIds.length);
    strokeControl.row.show();
    fillControl.row.classed('hidden', geom != 'polygon');
    dashControl.row.classed('hidden', geom != 'polyline');
    arrowControl.section.classed('hidden', geom != 'polyline');
    updateColorControl(strokeControl);
    updateColorControl(fillControl);
    updateStrokeWidthControl();
    updateDashArrayControl();
    if (geom == 'polyline') {
      updateLineCapControl();
      updateArrowControl();
    }
    updateColorSchemeControl();
    patternControl.section.classed('hidden', geom != 'polygon');
    if (geom == 'polygon') patternControl.update();
    glowControl.section.classed('hidden', geom != 'polygon');
    if (geom == 'polygon') glowControl.update();
    presetControl.render();
    updateSavedStyleControls();
  }

  function updateColorControl(control) {
    var value = getCommonStyleValue(control.field);
    control.showColor(value);
    updateOpacityControl(control);
    // Nothing for the picker to sit on when the selection has no one colour.
    if (!isHexColor(value)) control.picker.hide();
  }

  // A selection whose colours disagree still has colours, so an opacity unset
  // on all of it shows as full rather than blank.
  function updateOpacityControl(control) {
    var field = control.field + '-opacity';
    control.opacity.node().value = styleFieldIsUnsetForTargets(field) ?
      formatColorOpacityPct(null, !styleFieldIsUnsetForTargets(control.field)) :
      formatOpacityPct(getCommonStyleValue(field));
  }

  function updateStrokeWidthControl() {
    var value = getCommonStyleValue('stroke-width');
    strokeWidthField.setValue(
      formatNumberValue(value === '' || value === undefined || value === null ?
        getDefaultStrokeWidth() : value));
  }

  function updateDashArrayControl() {
    var value = getCommonStyleValue('stroke-dasharray');
    dashControl.input.node().value = value === undefined || value === null ? '' : String(value);
  }

  function nudgeStrokeWidth(direction) {
    var value = Number(getCommonStyleValue('stroke-width'));
    if (!isFinite(value)) value = getDefaultStrokeWidth();
    applyStrokeWidthStyle(getNextStrokeWidth(value, direction));
  }

  function getNextStrokeWidth(value, direction) {
    var baseSteps = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    var i;
    if (direction > 0) {
      for (i=0; i<baseSteps.length; i++) {
        if (value < baseSteps[i]) return baseSteps[i];
      }
      return Math.floor(value) + 1;
    }
    for (i=baseSteps.length - 1; i>=0; i--) {
      if (value > baseSteps[i]) return baseSteps[i];
    }
    return baseSteps[0];
  }

  function applyLayerStyle(field, value) {
    runStyleCommand([[field, value]]);
  }

  function applyColorControlStyle(control, color) {
    var styles = [[control.field, color]];
    if (color && control.field == 'stroke' && strokeWidthIsUnsetForTargets()) {
      styles.push(['stroke-width', 1]);
    }
    if (control.field == 'fill') {
      runStyleEdits(patternControl.getStyleEdits(styles));
    } else {
      runStyleCommand(styles);
    }
  }

  function applyStrokeWidthStyle(value) {
    var styles = [['stroke-width', value]];
    if (value > 0 && styleFieldIsUnsetForTargets('stroke')) {
      styles.push(['stroke', strokeControl.defaultColor]);
    }
    runStyleCommand(styles);
  }

  function applyDashArrayStyle(value) {
    var styles = [['stroke-dasharray', value]];
    if (value && styleFieldIsUnsetForTargets('stroke')) {
      styles.push(['stroke', strokeControl.defaultColor]);
    }
    runStyleCommand(styles);
  }

  function runStyleCommand(styles) {
    releaseFocus();
    syncTargetLayer();
    var ids = getTargetIds();
    if (!gui.console || !targetLayer || ids.length === 0) return;
    runCommand(formatStyleCommand(styles, ids), 'Style layer');
  }

  // Per-feature edits ([{id, styles}]), as one -style command for each set of
  // styles. They are run as one command string, which is one undo step.
  function runStyleEdits(edits, title) {
    releaseFocus();
    syncTargetLayer();
    if (!gui.console || !targetLayer || edits.length === 0) return;
    runCommand(formatStyleEditCommands(edits), title || 'Style layer');
  }

  function formatStyleEditCommands(edits) {
    return groupStyleEdits(edits).map(function(group) {
      return formatStyleCommand(group.styles, group.ids);
    }).join(' ');
  }

  function formatStyleCommand(styles, ids) {
    var parts = ['-style'];
    styles.forEach(function(style) {
      parts.push(style[0] + '=' + quoteCommandValue(style[1]));
    });
    addTargetOption(parts);
    if (ids.length < internal.getFeatureCount(targetLayer)) {
      parts.push('ids=' + ids.join(','));
    }
    return parts.join(' ');
  }

  function applyDefaultLineStyle() {
    var styles = [];
    if (!targetLayer || targetLayer.geometry_type != 'polyline') return;
    if (styleFieldIsUnsetForTargets('stroke-width')) {
      styles.push(['stroke-width', 1]);
    }
    if (styles.length > 0) {
      runStyleCommand(styles);
    }
  }

  // No button runs this for now; the Random fill button is waiting for a new
  // place in the panel.
  // Patterns keep their backgrounds in step with the fills, and the new fills
  // are not known until -classify has chosen them, so the patterns are
  // rewritten by an expression that reads each feature's fill when it runs.
  function applyRandomFillColors() {
    var cmd = '-classify colors=random non-adjacent';
    var patternEdits;
    syncTargetLayer();
    if (!gui.console || !targetLayer || targetLayer.geometry_type != 'polygon') return;
    if (getActiveLayer() != targetLayer) {
      cmd += ' target=' + internal.formatOptionValue(internal.getLayerTargetId(gui.model, targetLayer));
    }
    patternEdits = patternControl.getRefillExpressionEdits(getAllFeatureIds(targetLayer));
    if (patternEdits.length > 0) {
      cmd += ' ' + formatStyleEditCommands(patternEdits);
    }
    runCommand(cmd, 'Random fill colors');
  }

  function runCommand(cmd, title) {
    runGuiEditCommand(gui, cmd, {
      title: title,
      onDone: updateControls
    });
  }

  function applyStyleObject(style) {
    var styles = [];
    styleFields.forEach(function(field) {
      if (field in style) {
        styles.push([field, style[field]]);
      }
    });
    if (styles.length > 0) {
      runStyleEdits(patternControl.getStyleEdits(styles));
    }
  }

  function getCurrentStyle() {
    var style = {};
    addStyleValue(style, 'stroke', getControlValue(strokeControl.input));
    addStyleValue(style, 'stroke-width', strokeWidthField.getValue());
    addStyleValue(style, 'stroke-opacity', parseOpacityValue(strokeControl.opacity.node().value));
    if (targetLayer && targetLayer.geometry_type == 'polyline') {
      addStyleValue(style, 'stroke-dasharray', getControlValue(dashControl.input));
      addStyleValue(style, 'stroke-linecap', getCommonStyleValue('stroke-linecap'));
      addArrowStyleValues(style);
    }
    if (targetLayer && targetLayer.geometry_type == 'polygon') {
      addStyleValue(style, 'fill', getControlValue(fillControl.input));
      addStyleValue(style, 'fill-opacity', parseOpacityValue(fillControl.opacity.node().value));
      addStyleValue(style, 'fill-pattern', patternControl.getCode(getControlValue(fillControl.input)));
      glowControl.addStyleValues(style);
    }
    return style;
  }

  // Only when every target agrees, as with the other controls; a size is
  // saved only if the lines have their own.
  function addArrowStyleValues(style) {
    ['line-start', 'line-end', 'line-end-size', 'line-fade'].forEach(function(field) {
      addStyleValue(style, field, getCommonStyleValue(field));
    });
  }

  function addStyleValue(style, field, value) {
    if (value || value === 0) {
      style[field] = value;
    }
  }

  function getControlValue(input) {
    return input.node().value.trim();
  }

  function updateSavedStyleControls() {
    presetControl.update();
  }

  function getStyleType() {
    return targetLayer && targetLayer.geometry_type == 'polygon' ? 'polygon' : 'line';
  }

  function getSortKey(item) {
    return (item.type || '') + '\t' + String(item.name || '').toLowerCase() + '\t' + (item.id || '');
  }

  function clearLayerStyle() {
    var parts = ['-style clear'];
    syncTargetLayer();
    if (!gui.console || !targetLayer) return;
    addTargetOption(parts);
    runCommand(parts.join(' '), 'Clear style');
  }

  function addTargetOption(parts) {
    if (getActiveLayer() != targetLayer) {
      parts.push('target=' + internal.formatOptionValue(internal.getLayerTargetId(gui.model, targetLayer)));
    }
  }

  function getCommonStyleValue(field, idsArg) {
    var records = targetLayer && targetLayer.data && targetLayer.data.getRecords();
    var ids;
    var value, val;
    if (!records) return '';
    ids = idsArg || getTargetIds();
    if (ids.length === 0) return '';
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (i === 0) {
        value = val;
      } else if (val != value) {
        return '';
      }
    }
    return value;
  }

  function strokeWidthIsUnsetForTargets() {
    return styleFieldIsUnsetForTargets('stroke-width');
  }

  function styleFieldIsUnsetForTargets(field) {
    var records = targetLayer && targetLayer.data && targetLayer.data.getRecords();
    var ids = getTargetIds();
    var val;
    if (!records) return true;
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (val !== undefined && val !== null && val !== '') {
        return false;
      }
    }
    return ids.length > 0;
  }

  function getDefaultStrokeWidth() {
    return targetLayer && targetLayer.geometry_type == 'polyline' ? 1 : 0;
  }

  function getAllFeatureIds(lyr) {
    var ids = [];
    for (var i=0, n=internal.getFeatureCount(lyr); i<n; i++) {
      ids.push(i);
    }
    return ids;
  }

  function getSelectionIds() {
    return hit ? hit.getSelectionIds() : [];
  }

  function getTargetIds() {
    var ids = getSelectionIds();
    if (!targetLayer) return [];
    return ids.length > 0 ? ids : getAllFeatureIds(targetLayer);
  }

  function clearSelection() {
    if (hit) hit.clearSelection();
    updateControls();
  }

  // An empty layer has nothing for the controls to act on, so they are shown
  // disabled rather than left to do nothing.
  function updateEditingStatus(count) {
    var total = targetLayer ? internal.getFeatureCount(targetLayer) : 0;
    editingStatus.text(formatEditingStatus({selected: count, total: total}));
    clearLink.classed('hidden', count === 0);
    panel.classed('no-targets', total === 0);
  }

  function getActiveLayer() {
    var active = gui.model.getActiveLayer();
    return active && active.layer;
  }

  function syncTargetLayer() {
    var lyr = getActiveLayer();
    if (lyr == targetLayer) return;
    schemePanel.close();
    if (layerCanBeStyled(lyr)) {
      targetLayer = lyr;
      if (hit) hit.clearSelection();
    } else {
      targetLayer = null;
    }
  }

  function closePanel() {
    turnOff();
    if (gui.interaction.getMode() == 'line_style' || gui.interaction.getMode() == 'polygon_style') {
      gui.interaction.turnOff();
    }
  }

  function layerCanBeStyled(lyr) {
    return !!(lyr && (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon'));
  }

  function modeMatchesActiveLayer(mode) {
    var lyr = getActiveLayer();
    return mode == 'line_style' && lyr && lyr.geometry_type == 'polyline' ||
      mode == 'polygon_style' && lyr && lyr.geometry_type == 'polygon';
  }

  function modelSelectLayer(lyr, dataset) {
    if (lyr) lyr.hidden = false;
    gui.model.selectLayer(lyr, dataset);
  }

  function formatNumberValue(val) {
    val = Number(val);
    return isFinite(val) ? String(val) : '';
  }

}
