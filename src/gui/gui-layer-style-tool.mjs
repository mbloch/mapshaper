import { isHexColor } from './gui-color-picker';
import { El } from './gui-el';
import {
  claimFieldKeys, isTextInput, releasePanelFocus
} from './gui-panel-focus';
import { makeColorRow, makePanelActionButton } from './gui-panel-controls';
import { SizeField } from './gui-size-field';
import { parseOpacityValue, formatOpacityPct } from './gui-style-values';
import { StylePresetControl } from './gui-style-preset-control';
import { runGuiEditCommand } from './gui-edit-command';
import { internal } from './gui-core';
import { quoteCommandValue } from './gui-command-utils';

var savedStylesKey = 'layer_style_presets';
var styleFields = ['stroke', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity'];

export function LayerStyleTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel layer-style-panel rollover').appendTo(parent).hide();
  var title, editingStatus, clearLink, strokeControl, fillControl, strokeWidthField, randomFillBtn, presetControl, hit;
  var targetLayer = null;

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
    applyDefaultLineStyle();
    panel.show();
    updateControls();
  }

  function turnOff() {
    panel.hide();
    strokeControl.picker.hide();
    fillControl.picker.hide();
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
    panel.node().addEventListener('click', function() {
      if (isTextInput(document.activeElement)) return;
      releaseFocus();
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    title = El('span').appendTo(header);
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', closePanel);

    var editRow = El('div').addClass('label-style-row label-style-selection-row layer-style-selection-row').appendTo(panel);
    editingStatus = El('span').addClass('label-editing-status').appendTo(editRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(editRow).text('deselect').on('click', clearSelection);

    fillControl = addColorControl(panel, 'Fill', 'fill', '');
    strokeControl = addColorControl(panel, 'Stroke', 'stroke', '#000000');
    strokeWidthField = addStrokeWidthControl(panel);

    var buttonRow = El('div').addClass('label-style-row label-panel-button-row').appendTo(panel);
    randomFillBtn = makePanelActionButton(buttonRow, 'Random fills', applyRandomFillColors);
    makePanelActionButton(buttonRow, 'Clear style', clearLayerStyle);

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
        // Blanking the field is not a way to unset a colour: -style reads an
        // empty value as "remove this", and a field left empty by a mistyped
        // hex would then clear the layer rather than say nothing.
        if (color) applyColorControlStyle(control, color);
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

  // In the wide column, under the stroke colour it belongs to. Stepping runs
  // up a ladder of widths rather than by a fixed amount, because the useful
  // ones are close together at the hairline end and far apart above 2px.
  function addStrokeWidthControl(parent) {
    var row = El('div').addClass('label-style-row label-split-row').appendTo(parent);
    var cell = El('div').addClass('label-split-cell').appendTo(row);
    El('div').addClass('label-split-cell').appendTo(row);
    El('span').appendTo(cell).text('Stroke width');
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
    updateColorControl(strokeControl);
    updateColorControl(fillControl);
    updateStrokeWidthControl();
    randomFillBtn.classed('hidden', geom != 'polygon');
    presetControl.render();
    updateSavedStyleControls();
  }

  function updateColorControl(control) {
    var value = getCommonStyleValue(control.field);
    setColorControlValue(control, value);
    updateOpacityControl(control);
    if (isHexColor(value)) {
      control.picker.setColor(value);
    } else {
      control.picker.hide();
    }
  }

  function updateOpacityControl(control) {
    var value = getCommonStyleValue(control.field + '-opacity');
    control.opacity.node().value =
      formatOpacityPct(value === '' || value === undefined || value === null ? 1 : value);
  }

  function setColorControlValue(control, value) {
    control.setColor(value);
  }

  function updateStrokeWidthControl() {
    var value = getCommonStyleValue('stroke-width');
    strokeWidthField.setValue(
      formatNumberValue(value === '' || value === undefined || value === null ?
        getDefaultStrokeWidth() : value));
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
    if (control.field == 'stroke' && strokeWidthIsUnsetForTargets()) {
      styles.push(['stroke-width', 1]);
    }
    runStyleCommand(styles);
  }

  function applyStrokeWidthStyle(value) {
    var styles = [['stroke-width', value]];
    if (value > 0 && styleFieldIsUnsetForTargets('stroke')) {
      styles.push(['stroke', strokeControl.defaultColor]);
    }
    runStyleCommand(styles);
  }

  function runStyleCommand(styles) {
    var parts = ['-style'];
    releaseFocus();
    syncTargetLayer();
    var ids = getTargetIds();
    if (!gui.console || !targetLayer || ids.length === 0) return;
    styles.forEach(function(style) {
      parts.push(style[0] + '=' + quoteCommandValue(style[1]));
    });
    addTargetOption(parts);
    if (ids.length < internal.getFeatureCount(targetLayer)) {
      parts.push('ids=' + ids.join(','));
    }
    runCommand(parts.join(' '), 'Style layer');
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

  function applyRandomFillColors() {
    var cmd = '-classify colors=random non-adjacent';
    syncTargetLayer();
    if (!gui.console || !targetLayer || targetLayer.geometry_type != 'polygon') return;
    if (getActiveLayer() != targetLayer) {
      cmd += ' target=' + internal.formatOptionValue(internal.getLayerTargetId(gui.model, targetLayer));
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
      runStyleCommand(styles);
    }
  }

  function getCurrentStyle() {
    var style = {};
    addStyleValue(style, 'stroke', getControlValue(strokeControl.input));
    addStyleValue(style, 'stroke-width', strokeWidthField.getValue());
    addStyleValue(style, 'stroke-opacity', parseOpacityValue(strokeControl.opacity.node().value));
    if (targetLayer && targetLayer.geometry_type == 'polygon') {
      addStyleValue(style, 'fill', getControlValue(fillControl.input));
      addStyleValue(style, 'fill-opacity', parseOpacityValue(fillControl.opacity.node().value));
    }
    return style;
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

  function updateEditingStatus(count) {
    editingStatus.text(count > 0 ? 'Editing: ' + count + ' selected' : 'Editing: all');
    clearLink.classed('hidden', count === 0);
  }

  function getActiveLayer() {
    var active = gui.model.getActiveLayer();
    return active && active.layer;
  }

  function syncTargetLayer() {
    var lyr = getActiveLayer();
    if (lyr == targetLayer) return;
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
