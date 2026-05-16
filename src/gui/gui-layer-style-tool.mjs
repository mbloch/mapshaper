import { ColorPicker, isHexColor, layerColorPresetRows } from './gui-color-picker';
import { El } from './gui-el';
import { ClickText2 } from './gui-elements';
import { GUI } from './gui-lib';
import { showPopupAlert, showPrompt } from './gui-alert';
import { makeStylePresetId } from './gui-style-presets';
import { internal } from './gui-core';
import {
  getFeatureCount,
  getLayerDataTable
} from '../dataset/mapshaper-layer-utils';
import { isSupportedSvgStyleProperty } from '../svg/svg-properties';

var savedStylesKey = 'layer_style_presets';
var styleFields = ['stroke', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity'];

export function LayerStyleTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel layer-style-panel rollover').appendTo(parent).hide();
  var title, editingStatus, clearLink, strokeControl, fillControl, strokeWidthText, strokeWidthClickText, strokeOpacityInput, fillOpacityInput, randomFillBtn, styleSelect, hit;
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
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    title = El('span').appendTo(header);
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', closePanel);

    var editRow = El('div').addClass('label-style-row label-style-selection-row layer-style-selection-row').appendTo(panel);
    editingStatus = El('span').addClass('label-editing-status').appendTo(editRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(editRow).text('clear').on('click', clearSelection);

    fillControl = addColorControl(panel, 'Fill', 'fill', '');
    fillOpacityInput = addStyleNumberControl(fillControl, 'Opacity', 'fill-opacity', {
      defaultValue: 1,
      parser: parseOpacityValue,
      formatter: formatOpacityPct
    });
    strokeControl = addColorControl(panel, 'Stroke', 'stroke', '#000000');
    strokeOpacityInput = addStyleNumberControl(strokeControl, 'Opacity', 'stroke-opacity', {
      defaultValue: 1,
      parser: parseOpacityValue,
      formatter: formatOpacityPct
    });
    strokeWidthText = addStrokeWidthControl(panel);

    var buttonRow = El('div').addClass('label-style-row').appendTo(panel);
    randomFillBtn = El('button').appendTo(buttonRow).text('Random fill colors').on('click', applyRandomFillColors);
    El('button').appendTo(buttonRow).text('Clear style').on('click', clearLayerStyle);

    var savedRow = El('div').addClass('label-style-row label-saved-style-row').appendTo(panel);
    El('span').appendTo(savedRow).text('Presets');
    styleSelect = El('select').appendTo(savedRow).on('change', function() {
      if (styleSelect.node().value) {
        applySavedStyle(styleSelect.node().value);
      }
      updateSavedStyleControls();
    });
    El('button').appendTo(savedRow).text('Save preset').on('click', saveCurrentStyle);
    El('button').appendTo(savedRow).text('Delete').on('click', deleteSelectedStyle);
    renderSavedStyles();
  }

  function addColorControl(parent, label, field, defaultColor) {
    var row = El('div').addClass('label-style-row label-color-row layer-color-row').appendTo(parent);
    var control = {
      field: field,
      defaultColor: defaultColor,
      row: row,
      chit: null,
      input: null,
      controls: null,
      picker: null
    };
    var controlLine = El('div').addClass('layer-style-control-line').appendTo(row);
    var colorCell = El('div').addClass('layer-color-cell').appendTo(controlLine);
    control.controls = El('div').addClass('layer-row-controls').appendTo(controlLine);
    El('span').appendTo(colorCell).text(label);
    control.chit = makePanelButton(colorCell, '', function() {
      control.picker.toggle();
    }).addClass('label-color-chit');
    control.input = El('input').attr('type', 'text').appendTo(colorCell).on('change', function() {
      var color = control.input.node().value.trim();
      if (!color) return;
      if (isHexColor(color)) {
        control.picker.setColor(color);
      }
      applyColorControlStyle(control, color);
    });
    control.picker = new ColorPicker(row, {
      presetRows: layerColorPresetRows,
      onPreview: function(hex) {
        setColorControlValue(control, hex);
      },
      onChange: function(hex) {
        applyColorControlStyle(control, hex);
      }
    });
    return control;
  }

  function addStrokeWidthControl(parent) {
    var row = El('div').addClass('label-style-row layer-stroke-width-row').appendTo(parent);
    var control = El('div').addClass('layer-number-control layer-stroke-width-control').appendTo(row);
    var buttonRow;
    El('span').appendTo(control).text('Stroke width');
    buttonRow = El('div').addClass('layer-stepper-control').appendTo(control);
    makePanelButton(buttonRow, '−', function() {
      nudgeStrokeWidth(-1);
    });
    var text = El('span').addClass('layer-stroke-width-value').appendTo(buttonRow);
    strokeWidthClickText = new ClickText2(text);
    strokeWidthClickText.on('change', function() {
      var value = parsePositiveNumber(strokeWidthClickText.value());
      if (value === null) {
        updateStrokeWidthControl();
        return;
      }
      applyStrokeWidthStyle(value);
    });
    makePanelButton(buttonRow, '+', function() {
      nudgeStrokeWidth(1);
    });
    return text;
  }

  function addStyleNumberControl(colorControl, label, field, opts) {
    var control = El('label').addClass('layer-number-control').appendTo(colorControl.controls);
    El('span').appendTo(control).text(label);
    return El('input')
      .attr('type', 'text')
      .appendTo(control)
      .on('change', function() {
        var value = opts.parser(this.value);
        if (value === null) return;
        applyLayerStyle(field, value);
      });
  }

  function makePanelButton(parent, label, action) {
    return El('div')
      .addClass('label-panel-btn')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .appendTo(parent)
      .text(label)
      .on('click', function(e) {
        action(e);
      })
      .on('keydown', function(e) {
        if (e.key == 'Enter' || e.key == ' ') {
          e.preventDefault();
          action(e);
        }
      });
  }

  function updateControls() {
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
    updateNumberControl(strokeOpacityInput, 'stroke-opacity', 1, formatOpacityPct);
    updateNumberControl(fillOpacityInput, 'fill-opacity', 1, formatOpacityPct);
    randomFillBtn.classed('hidden', geom != 'polygon');
    renderSavedStyles();
    updateSavedStyleControls();
  }

  function updateColorControl(control) {
    var value = getCommonStyleValue(control.field);
    setColorControlValue(control, value);
    if (isHexColor(value)) {
      control.picker.setColor(value);
    } else {
      control.picker.hide();
    }
  }

  function setColorControlValue(control, value) {
    control.input.node().value = value || '';
    control.chit.css('background-color', isHexColor(value) ? value : 'transparent');
  }

  function updateNumberControl(input, field, defaultValue, formatter) {
    var value = getCommonStyleValue(field);
    input.node().value = formatter(value === '' || value === undefined || value === null ? defaultValue : value);
  }

  function updateStrokeWidthControl() {
    var value = getCommonStyleValue('stroke-width');
    strokeWidthClickText.value(formatNumberValue(value === '' || value === undefined || value === null ? getDefaultStrokeWidth() : value));
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
    applyLayerStyles([[field, value]]);
  }

  function applyColorControlStyle(control, color) {
    var styles = [[control.field, color]];
    if (control.field == 'stroke' && strokeWidthIsUnsetForTargets()) {
      styles.push(['stroke-width', 1]);
    }
    applyLayerStyles(styles);
  }

  function applyStrokeWidthStyle(value) {
    var styles = [['stroke-width', value]];
    if (value > 0 && styleFieldIsUnsetForTargets('stroke')) {
      styles.push(['stroke', strokeControl.defaultColor]);
    }
    applyLayerStyles(styles);
  }

  function applyLayerStyles(styles) {
    if (!targetLayer) return;
    var table = getLayerDataTable(targetLayer);
    var fields = styles.map(function(style) {return style[0];});
    var records = table.getRecords();
    var ids = getTargetIds();
    var hasNewFields = fields.some(function(field) {
      return !table.fieldExists(field);
    });
    if (ids.length === 0) return;
    gui.dispatchEvent('data_preupdate', {ids: ids});
    if (hasNewFields) {
      table.captureSchemaBefore({operation: 'layer-style', fields: fields});
    } else {
      table.captureFieldsBefore(fields, {operation: 'layer-style'});
    }
    if (hasNewFields) {
      setUndefinedFields(records, fields);
    }
    ids.forEach(function(id) {
      var rec = records[id];
      if (!rec) rec = {};
      styles.forEach(function(style) {
        rec[style[0]] = style[1];
      });
      records[id] = rec;
    });
    if (hasNewFields) {
      table.markSchemaChanged({operation: 'layer-style'});
    } else {
      table.markFieldsChanged(fields, {operation: 'layer-style'});
    }
    gui.dispatchEvent('data_postupdate', {ids: ids});
    gui.model.updated({style: true, same_table: true});
    recordStyleCommand(fields);
    updateControls();
  }

  function setUndefinedFields(records, fields) {
    records.forEach(function(rec, i) {
      if (!rec) rec = records[i] = {};
      fields.forEach(function(field) {
        if (field in rec === false) {
          rec[field] = undefined;
        }
      });
    });
  }

  function applyDefaultLineStyle() {
    var styles = [];
    if (!targetLayer || targetLayer.geometry_type != 'polyline') return;
    if (styleFieldIsUnsetForTargets('stroke-width')) {
      styles.push(['stroke-width', 1]);
    }
    if (styles.length > 0) {
      applyLayerStyles(styles);
    }
  }

  function applyRandomFillColors() {
    var cmd = '-classify colors=random non-adjacent';
    if (!gui.console || !targetLayer || targetLayer.geometry_type != 'polygon') return;
    if (getActiveLayer() != targetLayer) {
      cmd += ' target=' + internal.formatOptionValue(internal.getLayerTargetId(gui.model, targetLayer));
    }
    gui.console.runMapshaperCommands(cmd, function(err) {
      if (!err) updateControls();
    });
  }

  function saveCurrentStyle() {
    openSaveStylePopup();
  }

  function openSaveStylePopup() {
    var popup = showPopupAlert('', 'Save layer style');
    var el = popup.container();
    el.addClass('option-menu');
    el.html(`<div><input type="text" class="style-name text-input" placeholder="style name"></div>
      <div tabindex="0" class="btn dialog-btn">Save</div>`);
    var input = el.findChild('.style-name');
    var btn = el.findChild('.btn');
    input.node().focus();
    btn.on('click', function() {
      var name = input.node().value.trim();
      if (!name) return;
      saveStyleWithName(name);
      popup.close();
    });
    input.on('keydown', function(e) {
      if (e.key == 'Enter') {
        btn.node().click();
      }
    });
  }

  function saveStyleWithName(name) {
    var styles = getSavedStyles();
    var id = makeStylePresetId(styles, getStyleType(), name);
    var i;
    styles.push({
      id: id,
      type: getStyleType(),
      name: name,
      style: getCurrentStyle()
    });
    styles.sort(function(a, b) {
      return getSortKey(a) < getSortKey(b) ? -1 :
        getSortKey(a) > getSortKey(b) ? 1 : 0;
    });
    GUI.setSavedValue(savedStylesKey, styles);
    renderSavedStyles();
    for (i=0; i<styleSelect.node().options.length; i++) {
      if (styleSelect.node().options[i].value == id) {
        styleSelect.node().selectedIndex = i;
        break;
      }
    }
    updateSavedStyleControls();
  }

  async function deleteSelectedStyle() {
    var id = styleSelect.node().value;
    var item = findSavedStyle(id);
    var styles;
    if (!item) return;
    if (!await showPrompt('Delete layer style "' + item.name + '"?', 'Delete preset')) return;
    styles = getSavedStyles().filter(function(item) {
      return item.id != id;
    });
    GUI.setSavedValue(savedStylesKey, styles);
    renderSavedStyles();
    updateSavedStyleControls();
  }

  function applySavedStyle(id) {
    var item = findSavedStyle(id);
    if (!item) return;
    applyStyleObject(item.style);
  }

  function applyStyleObject(style) {
    var styles = [];
    styleFields.forEach(function(field) {
      if (field in style) {
        styles.push([field, style[field]]);
      }
    });
    if (styles.length > 0) {
      applyLayerStyles(styles);
    }
  }

  function getCurrentStyle() {
    var style = {};
    addStyleValue(style, 'stroke', getControlValue(strokeControl.input));
    addStyleValue(style, 'stroke-width', parsePositiveNumber(strokeWidthClickText.value()));
    addStyleValue(style, 'stroke-opacity', parseOpacityValue(strokeOpacityInput.node().value));
    if (targetLayer && targetLayer.geometry_type == 'polygon') {
      addStyleValue(style, 'fill', getControlValue(fillControl.input));
      addStyleValue(style, 'fill-opacity', parseOpacityValue(fillOpacityInput.node().value));
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

  function getSavedStyles() {
    var styles = GUI.getSavedValue(savedStylesKey);
    return Array.isArray(styles) ? styles : [];
  }

  function getSavedStylesForType() {
    var type = getStyleType();
    return getSavedStyles().filter(function(item) {
      return item.type == type;
    });
  }

  function renderSavedStyles() {
    var value = styleSelect && styleSelect.node().value;
    if (!styleSelect) return;
    styleSelect.empty();
    El('option').attr('value', '').appendTo(styleSelect).text('Apply preset...');
    getSavedStylesForType().forEach(function(item) {
      El('option').attr('value', item.id).appendTo(styleSelect).text(item.name);
    });
    styleSelect.node().value = value || '';
  }

  function updateSavedStyleControls() {
    var buttons = panel.findChildren('.label-saved-style-row button');
    buttons.forEach(function(btn, i) {
      btn.node().disabled = i == 1 && !styleSelect.node().value;
    });
  }

  function findSavedStyle(id) {
    return getSavedStyles().find(function(item) {
      return item.id == id;
    });
  }

  function getStyleType() {
    return targetLayer && targetLayer.geometry_type == 'polygon' ? 'polygon' : 'line';
  }

  function getSortKey(item) {
    return (item.type || '') + '\t' + String(item.name || '').toLowerCase() + '\t' + (item.id || '');
  }

  function clearLayerStyle() {
    var table = targetLayer && targetLayer.data;
    var fields;
    if (!table) return;
    fields = table.getFields().filter(isSupportedSvgStyleProperty);
    if (fields.length === 0) return;
    fields.forEach(function(field) {
      table.deleteField(field);
    });
    gui.model.updated({style: true, same_table: true});
    recordClearCommand();
    updateControls();
  }

  function recordStyleCommand(fields) {
    var parts = ['-style'];
    var ids = getTargetIds();
    if (!gui.session || !targetLayer) return;
    fields.forEach(function(field) {
      var value = getCommonStyleValue(field, ids);
      if (value !== undefined && value !== null && value !== '') {
        parts.push(field + '=' + quoteCommandValue(value));
      }
    });
    addTargetOption(parts);
    if (ids.length < getFeatureCount(targetLayer)) {
      parts.push('where=' + quoteCommandValue(getIdsWhereExpression(ids)));
    }
    gui.session.consoleCommands(parts.join(' '));
  }

  function recordClearCommand() {
    var parts = ['-style clear'];
    if (!gui.session || !targetLayer) return;
    addTargetOption(parts);
    gui.session.consoleCommands(parts.join(' '));
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
    for (var i=0, n=getFeatureCount(lyr); i<n; i++) {
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

  function getIdsWhereExpression(ids) {
    return '[' + ids.join(',') + '].indexOf($.id)>-1';
  }

  function getActiveLayer() {
    var active = gui.model.getActiveLayer();
    return active && active.layer;
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

  function parseOpacityValue(str) {
    var pct = Number(String(str).replace('%', '').trim());
    if (!isFinite(pct)) return null;
    return Math.max(0, Math.min(100, pct)) / 100;
  }

  function parsePositiveNumber(str) {
    var val = Number(String(str).trim());
    return isFinite(val) && val >= 0 ? val : null;
  }

  function formatOpacityPct(val) {
    val = val === '' || val === undefined || val === null ? 1 : Number(val);
    return isFinite(val) ? Math.round(Math.max(0, Math.min(1, val)) * 100) + '%' : '';
  }

  function formatNumberValue(val) {
    val = Number(val);
    return isFinite(val) ? String(val) : '';
  }

  function quoteCommandValue(str) {
    return "'" + String(str).replace(/'/g, "\\'") + "'";
  }
}
