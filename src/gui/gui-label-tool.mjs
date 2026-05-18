import { getFontStyleVariants, getInstalledFonts } from './gui-label-fonts';
import { ColorPicker, isHexColor } from './gui-color-picker';
import { StylePresetControl } from './gui-style-preset-control';
import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';

var fontField = 'font-family';
var fontSizeField = 'font-size';
var fontStyleField = 'font-style';
var fontWeightField = 'font-weight';
var fillField = 'fill';
var cssField = 'css';
var iconField = 'icon';
var iconSizeField = 'icon-size';
var defaultFontSize = 12;
var defaultFontStyle = 'normal';
var defaultFontWeight = '400';
var defaultLabelColor = '#000000';
var defaultIconSize = 5;
var labelStyleMode = 'label_style';
var labelStylePanelMode = 'label_style_tool';
var savedStylesKey = 'label_styles';
var savedStyleFields = [
  fontField,
  fontSizeField,
  fontStyleField,
  fontWeightField,
  fillField,
  cssField,
  'label-pos',
  iconField,
  iconSizeField
];
var labelPositions = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
var iconTypes = [{
  name: ''
}, {
  name: 'circle'
}, {
  name: 'square'
}, {
  name: 'ring'
}, {
  name: 'star'
}];
var iconButtonSymbols = {
  '': '<line x1="4.25" y1="4.25" x2="11.75" y2="11.75"></line><line x1="11.75" y1="4.25" x2="4.25" y2="11.75"></line>',
  circle: '<circle cx="8" cy="8" r="4.25"></circle>',
  square: '<rect x="4" y="4" width="8" height="8"></rect>',
  ring: '<circle cx="8" cy="8" r="3.8"></circle>',
  star: '<path d="M8 3.2l1.18 2.92 3.14.22-2.42 2 .76 3.06L8 9.75 5.34 11.4l.76-3.06-2.42-2 3.14-.22L8 3.2z"></path>'
};

export function LabelTool(gui) {
  // Label styling is opened from the point styling entry point.
  var textBtn = El('div').hide();
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel rollover').appendTo(parent).hide();
  var presetControl, fontSelect, fontStyleSelect, fontSizeText, colorChit, colorInput, colorPicker, cssInput, posBtns, iconBtns, iconSizeText, editingStatus, clearLink, hit;
  var fontOptionsRendered = false;

  initPanel();
  gui.addMode(labelStylePanelMode, turnOn, turnOff);
  gui.model.on('update', updateVisibility);
  gui.model.on('update', function() {
    setTimeout(updateSelectionDisplay, 0);
  });
  gui.on('undo_redo_post', function() {
    if (panel.visible()) {
      updateControls();
      updateSelectionDisplay();
    }
  });
  gui.on('interaction_mode_change', function(e) {
    if (panel.visible() && e.mode != labelStyleMode && gui.getMode() == labelStylePanelMode) {
      gui.clearMode();
    }
  });

  hit = gui.map.getHitControl && gui.map.getHitControl();
  if (hit) {
    hit.on('change', function(e) {
      if (e.mode == labelStyleMode) {
        updateSelectionDisplay();
        updateControls();
      }
    });
  }

  updateVisibility();

  this.open = function(lyr, dataset) {
    if (!lyr || !internal.layerHasLabels(lyr)) return;
    if (!gui.map.isActiveLayer(lyr)) {
      modelSelectLayer(lyr, dataset);
    }
    if (gui.getMode() == labelStylePanelMode) {
      showStylePanel();
    } else {
      gui.enterMode(labelStylePanelMode);
    }
  };

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel).text('Label styles');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
      gui.clearMode();
    });

    var selectRow = El('div').addClass('label-style-row label-style-selection-row').appendTo(panel);
    editingStatus = El('span').addClass('label-editing-status').appendTo(selectRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(selectRow).text('deselect').on('click', clearSelection);

    var fontRow = El('label').addClass('label-style-row').appendTo(panel);
    El('span').appendTo(fontRow).text('Font');
    fontSelect = El('select').appendTo(fontRow).on('change', function() {
      if (fontSelect.node().value) {
        applyFont(fontSelect.node().value);
      }
    });

    var fontStyleRow = El('label').addClass('label-style-row').appendTo(panel);
    El('span').appendTo(fontStyleRow).text('Font style');
    fontStyleSelect = El('select').appendTo(fontStyleRow).on('change', function() {
      if (fontStyleSelect.node().value) {
        applyFontStyleVariant(fontStyleSelect.node().value);
      }
    });

    var colorSizeRow = El('div').addClass('label-style-row label-split-row').appendTo(panel);
    var colorRow = El('div').addClass('label-split-cell label-color-row').appendTo(colorSizeRow);
    El('span').appendTo(colorRow).text('Color');
    colorChit = makePanelButton(colorRow, '', toggleColorPicker).addClass('label-color-chit');
    colorInput = El('input').attr('type', 'text').appendTo(colorRow).on('change', function() {
      var color = colorInput.node().value.trim();
      if (color) {
        if (isHexColor(color)) {
          colorPicker.setColor(color);
        }
        applyLabelColor(color);
      }
    });
    initColorPicker(colorRow);

    var fontSizeRow = El('div').addClass('label-split-cell label-size-row').appendTo(colorSizeRow);
    El('span').appendTo(fontSizeRow).text('Font size');
    makePanelButton(fontSizeRow, '−', function() {
      nudgeFontSize(-1);
    });
    fontSizeText = El('span').addClass('label-size-value').appendTo(fontSizeRow);
    makePanelButton(fontSizeRow, '+', function() {
      nudgeFontSize(1);
    });

    var cssRow = El('label').addClass('label-style-row label-css-row').appendTo(panel);
    El('span').appendTo(cssRow).text('Inline CSS');
    cssInput = El('input').attr('type', 'text').appendTo(cssRow).on('change', function() {
      applyInlineCss(cssInput.node().value.trim());
    });

    var iconSizeRow = El('div').addClass('label-style-row label-split-row').appendTo(panel);
    var iconRow = El('div').addClass('label-split-cell').appendTo(iconSizeRow);
    El('div').addClass('label-style-row-label').appendTo(iconRow).text('Icon');
    var iconGroup = El('div').addClass('label-icon-buttons').appendTo(iconRow);
    iconBtns = {};
    iconTypes.forEach(function(icon) {
      var btn = makePanelButton(iconGroup, '', function() {
          applyIcon(icon.name);
        })
        .attr('data-icon', icon.name || 'none')
        .attr('title', icon.name || 'no icon');
      iconBtns[icon.name] = btn;
      appendIconButtonSymbol(btn, icon.name);
    });

    var sizeRow = El('div').addClass('label-split-cell label-icon-size-row').appendTo(iconSizeRow);
    El('span').appendTo(sizeRow).text('Icon size');
    makePanelButton(sizeRow, '−', function() {
      nudgeIconSize(-1);
    });
    iconSizeText = El('span').addClass('label-icon-size-value').appendTo(sizeRow);
    makePanelButton(sizeRow, '+', function() {
      nudgeIconSize(1);
    });

    var posRow = El('div').addClass('label-style-row').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(posRow).text('Position');
    var grid = El('div').addClass('label-position-grid').appendTo(posRow);
    posBtns = {};
    labelPositions.forEach(function(pos) {
      posBtns[pos] = makePanelButton(grid, '', function() {
          applyLabelPosition(pos);
        })
        .attr('data-position', pos)
        .attr('title', pos);
    });

    presetControl = new StylePresetControl(panel, {
      storageKey: savedStylesKey,
      type: 'label',
      useType: false,
      saveTitle: 'Save label style',
      styleLabel: 'label style',
      getStyle: getCurrentStyle,
      applyStyle: applyStyleObject,
      getItemId: getStyleId,
      disabled: function() {
        return getTargetIds().length === 0;
      }
    });
  }

  function appendIconButtonSymbol(btn, iconName) {
    var svg = '<svg class="label-icon-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
      iconButtonSymbols[iconName] + '</svg>';
    El(svg).appendTo(btn);
  }

  function makePanelButton(parent, label, action) {
    return El('div')
      .addClass('label-panel-btn')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .appendTo(parent)
      .text(label)
      .on('click', function(e) {
        if (this.classList.contains('disabled')) return;
        action(e);
      })
      .on('keydown', function(e) {
        if (e.key == 'Enter' || e.key == ' ') {
          e.preventDefault();
          if (!this.classList.contains('disabled')) action(e);
        }
      });
  }

  function setPanelButtonDisabled(el, disabled) {
    el.classed('disabled', !!disabled)
      .attr('aria-disabled', disabled ? 'true' : 'false')
      .attr('tabindex', disabled ? '-1' : '0');
  }

  function turnOn() {
    if (!activeLayerHasLabels()) {
      gui.clearMode();
      return;
    }
    showStylePanel();
  }

  function showStylePanel() {
    renderFontOptions();
    gui.interaction.setMode(labelStyleMode);
    gui.state.label_style_panel_open = true;
    panel.show();
    textBtn.addClass('selected');
    updateControls();
    updateSelectionDisplay();
  }

  function turnOff() {
    panel.hide();
    hideColorPicker();
    gui.state.label_style_panel_open = false;
    textBtn.removeClass('selected');
    clearSelectionDisplay();
    if (hit) hit.clearSelection();
    if (gui.interaction.getMode() == labelStyleMode) {
      gui.interaction.turnOff();
    }
  }

  function updateVisibility() {
    var enabled = activeLayerHasLabels();
    textBtn.classed('disabled', !enabled);
    textBtn[enabled ? 'show' : 'hide']();
    if (!enabled && gui.getMode() == labelStylePanelMode) {
      gui.clearMode();
    }
  }

  function activeLayerHasLabels() {
    var active = gui.model.getActiveLayer();
    return !!(active && internal.layerHasLabels(active.layer));
  }

  function activeLayerIsPointLayer() {
    var active = gui.model.getActiveLayer();
    return !!(active && active.layer && active.layer.geometry_type == 'point');
  }

  function modelSelectLayer(lyr, dataset) {
    if (lyr) lyr.hidden = false;
    gui.model.selectLayer(lyr, dataset);
  }

  function renderFontOptions() {
    if (fontOptionsRendered) return;
    fontOptionsRendered = true;
    fontSelect.empty();
    El('option').attr('value', '').appendTo(fontSelect).text('');
    getInstalledFonts().forEach(function(group) {
      var optgroup = El('optgroup').attr('label', group.name).appendTo(fontSelect);
      group.fonts.forEach(function(fontName) {
        El('option').attr('value', fontName).appendTo(optgroup).text(fontName);
      });
    });
  }

  function quoteCommandValue(str) {
    return "'" + String(str).replace(/'/g, "\\'") + "'";
  }

  function clearSelection() {
    if (hit) hit.clearSelection();
    updateSelectionDisplay();
    updateControls();
  }

  function getActiveLayer() {
    var active = gui.model.getActiveLayer();
    return active && active.layer;
  }

  function getActiveTable() {
    var lyr = getActiveLayer();
    return lyr && lyr.data || null;
  }

  function getSelectionIds() {
    return hit ? hit.getSelectionIds() : [];
  }

  function getTargetIds() {
    var ids = getSelectionIds();
    return ids.length > 0 ? ids : getAllLabelIds();
  }

  function getAllLabelIds() {
    var lyr = getActiveLayer();
    var ids = [];
    if (!lyr) return ids;
    for (var i=0, n=internal.getFeatureCount(lyr); i<n; i++) {
      ids.push(i);
    }
    return ids;
  }

  function updateControls() {
    var ids = getTargetIds();
    var manualIds = getSelectionIds();
    var fontVal = getCommonValue(ids, fontField);
    var fontSizeVal = getCommonValue(ids, fontSizeField, {useDefault: true, defaultValue: defaultFontSize});
    var fontStyleVal = getCommonValue(ids, fontStyleField, {useDefault: true, defaultValue: defaultFontStyle});
    var fontWeightVal = getCommonValue(ids, fontWeightField, {useDefault: true, defaultValue: defaultFontWeight});
    var fillVal = getCommonValue(ids, fillField, {useDefault: true, defaultValue: defaultLabelColor});
    var cssVal = getCommonValue(ids, cssField);
    var posVal = getCommonValue(ids, 'label-pos');
    var iconVal = getCommonValue(ids, iconField);
    var iconSizeVal = getCommonValue(ids, iconSizeField, {useDefault: true, defaultValue: defaultIconSize});
    updateEditingStatus(manualIds.length);
    updateSavedStyleControls();
    fontSelect.node().disabled = ids.length === 0;
    fontSelect.node().value = fontVal;
    updateFontStyleControls(fontVal, fontStyleVal, fontWeightVal);
    updateFontSizeControls(ids.length ? fontSizeVal : '');
    updateColorControls(ids.length ? fillVal : '');
    updateCssControl(ids.length ? cssVal : '');
    updatePositionButtons(ids.length ? posVal : '');
    updateIconButtons(ids.length ? iconVal : '');
    updateIconSizeControls(ids.length ? iconSizeVal : '');
  }

  function updatePositionButtons(pos) {
    var disabled = getTargetIds().length === 0;
    labelPositions.forEach(function(name) {
      posBtns[name].classed('selected', name == pos);
      setPanelButtonDisabled(posBtns[name], disabled);
    });
  }

  function updateEditingStatus(count) {
    editingStatus.text(count > 0 ? 'Editing: ' + count + ' selected' : 'Editing: all');
    clearLink.classed('hidden', count === 0);
  }

  function updateFontSizeControls(fontSizeVal) {
    var disabled = getTargetIds().length === 0;
    fontSizeText.text(fontSizeVal || '');
    panel.findChildren('.label-size-row .label-panel-btn').forEach(function(btn) {
      setPanelButtonDisabled(btn, disabled);
    });
  }

  function updateFontStyleControls(fontName, fontStyleVal, fontWeightVal) {
    var disabled = getTargetIds().length === 0 || !fontName;
    fontStyleSelect.empty();
    El('option').attr('value', '').appendTo(fontStyleSelect).text('');
    if (fontName) {
      getFontStyleVariants(fontName).forEach(function(variant) {
        El('option').attr('value', variant.value).appendTo(fontStyleSelect).text(variant.label);
      });
    }
    fontStyleSelect.node().disabled = disabled;
    fontStyleSelect.node().value = fontStyleVal && fontWeightVal ?
      fontStyleVal + '|' + fontWeightVal : '';
  }

  function updateColorControls(colorVal) {
    var disabled = getTargetIds().length === 0;
    colorInput.node().disabled = disabled;
    colorInput.node().value = colorVal || '';
    setPanelButtonDisabled(colorChit, disabled);
    colorChit.css('background-color', isHexColor(colorVal) ? colorVal : 'transparent');
    if (colorPicker.visible()) {
      return; // avoid HSB -> RGB -> HSB rounding jumps after picker commits
    }
    if (isHexColor(colorVal)) {
      colorPicker.setColor(colorVal);
    } else {
      hideColorPicker();
    }
  }

  function updateCssControl(cssVal) {
    cssInput.node().disabled = getTargetIds().length === 0;
    cssInput.node().value = cssVal || '';
  }

  function updateIconButtons(iconVal) {
    var disabled = getTargetIds().length === 0;
    iconTypes.forEach(function(icon) {
      iconBtns[icon.name].classed('selected', !disabled && icon.name == iconVal);
      setPanelButtonDisabled(iconBtns[icon.name], disabled);
    });
  }

  function updateIconSizeControls(iconSizeVal) {
    var disabled = getTargetIds().length === 0;
    iconSizeText.text(iconSizeVal || '');
    panel.findChildren('.label-icon-size-row .label-panel-btn').forEach(function(btn) {
      setPanelButtonDisabled(btn, disabled);
    });
  }

  function updateSavedStyleControls() {
    presetControl.update();
  }

  function getCommonValue(ids, field, opts) {
    var table = getActiveTable();
    var records = table && table.getRecords();
    var value, val, hasValue;
    if (!records || ids.length === 0) return '';
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (!val) {
        if (opts && opts.useDefault) {
          val = opts.defaultValue;
        } else {
          return '';
        }
      } else {
        hasValue = true;
      }
      if (i === 0) {
        value = val;
      } else if (val != value) {
        return '';
      }
    }
    return hasValue || opts && opts.useDefault ? value : '';
  }

  function applyFont(fontName) {
    applyStyleValues([[fontField, fontName]]);
  }

  function nudgeFontSize(delta) {
    var ids = getTargetIds();
    var size = getNumericSize(ids, fontSizeField, defaultFontSize);
    if (ids.length === 0) return;
    size = Math.max(1, size + delta);
    applyStyleValues([[fontSizeField, size]]);
  }

  function applyFontStyleVariant(value) {
    var variant = parseFontStyleVariant(value);
    if (!variant) return;
    applyStyleValues([[fontStyleField, variant.style], [fontWeightField, variant.weight]]);
  }

  function applyLabelColor(color) {
    applyStyleValues([[fillField, color]]);
  }

  function applyInlineCss(css) {
    applyStyleValues([[cssField, css || '']]);
  }

  function getStyleId(item) {
    return item.id || 'label-' + item.name;
  }

  function getCurrentStyle() {
    var style = {};
    var fontStyle = parseFontStyleVariant(fontStyleSelect.node().value);
    var icon = getSelectedIcon();
    addStyleValue(style, fontField, fontSelect.node().value);
    if (fontStyle) {
      style[fontStyleField] = fontStyle.style;
      style[fontWeightField] = fontStyle.weight;
    }
    addStyleValue(style, fontSizeField, getNumericControlValue(fontSizeText));
    addStyleValue(style, fillField, colorInput.node().value.trim());
    addStyleValue(style, cssField, cssInput.node().value.trim());
    addStyleValue(style, 'label-pos', getSelectedLabelPosition());
    addStyleValue(style, iconField, icon);
    if (icon) {
      addStyleValue(style, iconSizeField, getNumericControlValue(iconSizeText));
    }
    return style;
  }

  function addStyleValue(style, field, value) {
    if (value || value === 0) {
      style[field] = value;
    }
  }

  function getNumericControlValue(el) {
    var value = Number(el.text());
    return isFinite(value) && value > 0 ? value : null;
  }

  function getSelectedLabelPosition() {
    var out = '';
    labelPositions.forEach(function(pos) {
      if (posBtns[pos].hasClass('selected')) out = pos;
    });
    return out;
  }

  function getSelectedIcon() {
    var out = '';
    iconTypes.forEach(function(icon) {
      if (iconBtns[icon.name].hasClass('selected')) out = icon.name;
    });
    return out;
  }

  function applyStyleObject(style) {
    var styles = [];
    savedStyleFields.forEach(function(field) {
      if (field in style) {
        styles.push([field, style[field]]);
      }
    });
    applyStyleValues(styles, {preservePreset: true});
  }

  function parseFontStyleVariant(value) {
    var parts = String(value).split('|');
    if (parts.length != 2) return null;
    return {
      style: parts[0],
      weight: parts[1]
    };
  }

  function applyLabelPosition(pos) {
    applyStyleValues([['label-pos', pos]]);
  }

  function applyIcon(iconName) {
    var styles = [[iconField, iconName || '']];
    if (iconName) {
      styles.push([iconSizeField, getNumericSize(getTargetIds(), iconSizeField, defaultIconSize)]);
    } else {
      styles.push([iconSizeField, 0]);
    }
    applyStyleValues(styles);
  }

  function nudgeIconSize(delta) {
    var ids = getTargetIds();
    var size = getNumericSize(ids, iconSizeField, defaultIconSize);
    if (ids.length === 0) return;
    size = Math.max(1, size + delta);
    applyStyleValues([[iconField, getCommonValue(ids, iconField) || 'circle'], [iconSizeField, size]]);
  }

  function getNumericSize(ids, field, defaultValue) {
    var val = getCommonValue(ids, field);
    val = val ? Number(val) : defaultValue;
    return isFinite(val) && val > 0 ? val : defaultValue;
  }

  function initColorPicker(colorRow) {
    colorPicker = new ColorPicker(colorRow, {
      onPreview: function(hex) {
        colorInput.node().value = hex;
        colorChit.css('background-color', hex);
      },
      onChange: applyLabelColor
    });
  }

  function toggleColorPicker() {
    colorPicker.toggle();
  }

  function hideColorPicker() {
    colorPicker.hide();
  }

  function applyStyleValues(styles, opts) {
    var lyr = getActiveLayer();
    var ids = getTargetIds();
    var parts = ['-style'];
    if (!gui.console || !lyr || ids.length === 0 || styles.length === 0) return;
    if (!opts || !opts.preservePreset) {
      presetControl.clearSelection();
    }
    styles.forEach(function(style) {
      parts.push(style[0] + '=' + quoteCommandValue(style[1]));
    });
    if (ids.length < internal.getFeatureCount(lyr)) {
      parts.push('ids=' + ids.join(','));
    }
    runGuiEditCommand(gui, parts.join(' '), {
      title: 'Label styles',
      onDone: function() {
        setTimeout(updateSelectionDisplay, 0);
        updateControls();
        updateSelectionDisplay();
      }
    });
  }

  function updateSelectionDisplay() {
    clearSelectionDisplay();
    getSelectionIds().forEach(function(id) {
      var textNode = getTextNodeById(id);
      if (textNode) {
        textNode.classList.add('label-style-selected');
      }
    });
  }

  function clearSelectionDisplay() {
    var lyr = hit && hit.getHitTarget();
    var container = lyr && lyr.gui && lyr.gui.svg_container;
    if (!container) return;
    container.querySelectorAll('.label-style-selected').forEach(function(node) {
      node.classList.remove('label-style-selected');
    });
  }

  function getTextNodeById(id) {
    var lyr = hit && hit.getHitTarget();
    var container = lyr && lyr.gui && lyr.gui.svg_container;
    var symbol = container && container.querySelector('[data-id="' + id + '"]');
    if (!symbol) return null;
    return symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
  }

}