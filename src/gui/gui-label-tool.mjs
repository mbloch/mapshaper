import { getFontStyleVariants, getInstalledFonts } from './gui-label-fonts';
import { El } from './gui-el';
import { internal } from './gui-core';
import { GUI } from './gui-lib';
import { showPopupAlert } from './gui-alert';
import { labelPositionFields, setLabelPositionStyle } from '../svg/svg-properties';

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
  name: '',
  label: '×'
}, {
  name: 'circle',
  label: '●'
}, {
  name: 'square',
  label: '■'
}, {
  name: 'ring',
  label: '○'
}, {
  name: 'star',
  label: '★'
}];

export function LabelTool(gui) {
  // button is only visible when label editing is available
  // clicking the button opens a panel for applying styles to labels
  var textBtn = gui.buttons.addButton('#text-tool-icon').addClass('menu-btn pointer-btn');
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel rollover').appendTo(parent).hide();
  var styleSelect, fontSelect, fontStyleSelect, fontSizeText, colorChit, colorInput, colorPicker, sbCanvas, hueCanvas, sbMarker, hueMarker, pickerHexInput, pickerHsbInputs, cssInput, posBtns, iconBtns, iconSizeText, hit;
  var fontOptionsRendered = false;
  var pickerColor = {h: 0, s: 0, b: 0};
  var pickerStartColor = null;

  initPanel();
  gui.addMode(labelStylePanelMode, turnOn, turnOff, textBtn);
  gui.model.on('update', updateVisibility);
  gui.model.on('update', function() {
    setTimeout(updateSelectionDisplay, 0);
  });
  gui.on('interaction_mode_change', function(e) {
    if (e.mode != labelStyleMode && gui.getMode() == labelStylePanelMode) {
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

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel).text('Label styles');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
      gui.clearMode();
    });

    var selectRow = El('div').addClass('label-style-row label-style-selection-row').appendTo(panel);
    El('button').appendTo(selectRow).text('Select all').on('click', selectAllLabels);
    El('button').appendTo(selectRow).text('Clear').on('click', clearSelection);

    var savedRow = El('div').addClass('label-style-row label-saved-style-row').appendTo(panel);
    El('span').appendTo(savedRow).text('Saved style');
    styleSelect = El('select').appendTo(savedRow).on('change', function() {
      if (styleSelect.node().value) {
        applySavedStyle(styleSelect.node().value);
      }
    });
    El('button').appendTo(savedRow).text('Save').on('click', saveCurrentStyle);
    El('button').appendTo(savedRow).text('Delete').on('click', deleteSelectedStyle);
    renderSavedStyles();

    var fontRow = El('label').addClass('label-style-row').appendTo(panel);
    El('span').appendTo(fontRow).text('Font');
    fontSelect = El('select').appendTo(fontRow).on('change', function() {
      if (fontSelect.node().value) {
        applyFont(fontSelect.node().value);
      }
    });

    var fontStyleRow = El('label').addClass('label-style-row').appendTo(panel);
    El('span').appendTo(fontStyleRow).text('Style');
    fontStyleSelect = El('select').appendTo(fontStyleRow).on('change', function() {
      if (fontStyleSelect.node().value) {
        applyFontStyleVariant(fontStyleSelect.node().value);
      }
    });

    var fontSizeRow = El('div').addClass('label-style-row label-size-row').appendTo(panel);
    El('span').appendTo(fontSizeRow).text('Font size');
    El('button').appendTo(fontSizeRow).text('−').on('click', function() {
      nudgeFontSize(-1);
    });
    fontSizeText = El('span').addClass('label-size-value').appendTo(fontSizeRow);
    El('button').appendTo(fontSizeRow).text('+').on('click', function() {
      nudgeFontSize(1);
    });

    var colorRow = El('div').addClass('label-style-row label-color-row').appendTo(panel);
    El('span').appendTo(colorRow).text('Color');
    colorChit = El('button').addClass('label-color-chit').appendTo(colorRow).on('click', function() {
      if (!colorChit.node().disabled) toggleColorPicker();
    });
    colorInput = El('input').attr('type', 'text').appendTo(colorRow).on('change', function() {
      var color = colorInput.node().value.trim();
      if (color) {
        if (isHexColor(color)) {
          setPickerColor(hexToHsb(color));
        }
        applyLabelColor(color);
      }
    });
    initColorPicker(colorRow);

    var cssRow = El('label').addClass('label-style-row label-css-row').appendTo(panel);
    El('span').appendTo(cssRow).text('Inline CSS');
    cssInput = El('input').attr('type', 'text').appendTo(cssRow).on('change', function() {
      applyInlineCss(cssInput.node().value.trim());
    });

    var posRow = El('div').addClass('label-style-row').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(posRow).text('Position');
    var grid = El('div').addClass('label-position-grid').appendTo(posRow);
    posBtns = {};
    labelPositions.forEach(function(pos) {
      posBtns[pos] = El('button')
        .attr('data-position', pos)
        .attr('title', pos)
        .appendTo(grid)
        .on('click', function() {
          applyLabelPosition(pos);
        });
    });

    var iconRow = El('div').addClass('label-style-row').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(iconRow).text('Icon');
    var iconGroup = El('div').addClass('label-icon-buttons').appendTo(iconRow);
    iconBtns = {};
    iconTypes.forEach(function(icon) {
      iconBtns[icon.name] = El('button')
        .attr('data-icon', icon.name || 'none')
        .attr('title', icon.name || 'no icon')
        .appendTo(iconGroup)
        .text(icon.label)
        .on('click', function() {
          applyIcon(icon.name);
        });
    });

    var sizeRow = El('div').addClass('label-style-row label-icon-size-row').appendTo(panel);
    El('span').appendTo(sizeRow).text('Icon size');
    El('button').appendTo(sizeRow).text('−').on('click', function() {
      nudgeIconSize(-1);
    });
    iconSizeText = El('span').addClass('label-icon-size-value').appendTo(sizeRow);
    El('button').appendTo(sizeRow).text('+').on('click', function() {
      nudgeIconSize(1);
    });
  }

  function turnOn() {
    if (!activeLayerHasLabels()) {
      gui.clearMode();
      return;
    }
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

  function selectAllLabels() {
    var lyr = getActiveLayer();
    var ids = [];
    if (!hit || !lyr) return;
    for (var i=0, n=internal.getFeatureCount(lyr); i<n; i++) {
      ids.push(i);
    }
    hit.clearSelection();
    if (ids.length > 0) {
      hit.addSelectionIds(ids);
    }
    updateSelectionDisplay();
    updateControls();
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

  function updateControls() {
    var ids = getSelectionIds();
    var fontVal = getCommonValue(ids, fontField);
    var fontSizeVal = getCommonValue(ids, fontSizeField, {useDefault: true, defaultValue: defaultFontSize});
    var fontStyleVal = getCommonValue(ids, fontStyleField, {useDefault: true, defaultValue: defaultFontStyle});
    var fontWeightVal = getCommonValue(ids, fontWeightField, {useDefault: true, defaultValue: defaultFontWeight});
    var fillVal = getCommonValue(ids, fillField, {useDefault: true, defaultValue: defaultLabelColor});
    var cssVal = getCommonValue(ids, cssField);
    var posVal = getCommonValue(ids, 'label-pos');
    var iconVal = getCommonValue(ids, iconField);
    var iconSizeVal = getCommonValue(ids, iconSizeField, {useDefault: true, defaultValue: defaultIconSize});
    styleSelect.node().disabled = ids.length === 0;
    panel.findChildren('.label-saved-style-row button').forEach(function(btn) {
      btn.node().disabled = ids.length === 0;
    });
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
    var disabled = getSelectionIds().length === 0;
    labelPositions.forEach(function(name) {
      posBtns[name].classed('selected', name == pos);
      posBtns[name].node().disabled = disabled;
    });
  }

  function updateFontSizeControls(fontSizeVal) {
    var disabled = getSelectionIds().length === 0;
    fontSizeText.text(fontSizeVal || '');
    panel.findChildren('.label-size-row button').forEach(function(btn) {
      btn.node().disabled = disabled;
    });
  }

  function updateFontStyleControls(fontName, fontStyleVal, fontWeightVal) {
    var disabled = getSelectionIds().length === 0 || !fontName;
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
    var disabled = getSelectionIds().length === 0;
    colorInput.node().disabled = disabled;
    colorInput.node().value = colorVal || '';
    colorChit.node().disabled = disabled || !isHexColor(colorVal);
    colorChit.css('background-color', isHexColor(colorVal) ? colorVal : 'transparent');
    if (isHexColor(colorVal)) {
      setPickerColor(hexToHsb(colorVal));
    } else {
      hideColorPicker();
    }
  }

  function updateCssControl(cssVal) {
    cssInput.node().disabled = getSelectionIds().length === 0;
    cssInput.node().value = cssVal || '';
  }

  function updateIconButtons(iconVal) {
    var disabled = getSelectionIds().length === 0;
    iconTypes.forEach(function(icon) {
      iconBtns[icon.name].classed('selected', icon.name == iconVal);
      iconBtns[icon.name].node().disabled = disabled;
    });
  }

  function updateIconSizeControls(iconSizeVal) {
    var disabled = getSelectionIds().length === 0;
    iconSizeText.text(iconSizeVal || '');
    panel.findChildren('.label-icon-size-row button').forEach(function(btn) {
      btn.node().disabled = disabled;
    });
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
    applyStyleFields([fontField], function(rec) {
      rec[fontField] = fontName;
    });
  }

  function nudgeFontSize(delta) {
    var ids = getSelectionIds();
    var size = getNumericSize(ids, fontSizeField, defaultFontSize);
    if (ids.length === 0) return;
    size = Math.max(1, size + delta);
    applyStyleFields([fontSizeField], function(rec) {
      rec[fontSizeField] = size;
    });
  }

  function applyFontStyleVariant(value) {
    var variant = parseFontStyleVariant(value);
    if (!variant) return;
    applyStyleFields([fontStyleField, fontWeightField], function(rec) {
      rec[fontStyleField] = variant.style;
      rec[fontWeightField] = variant.weight;
    });
  }

  function applyLabelColor(color) {
    applyStyleFields([fillField], function(rec) {
      rec[fillField] = color;
    });
  }

  function applyInlineCss(css) {
    applyStyleFields([cssField], function(rec) {
      rec[cssField] = css || undefined;
    });
  }

  function saveCurrentStyle() {
    openSaveStylePopup();
  }

  function openSaveStylePopup() {
    var popup = showPopupAlert('', 'Save label style');
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
    var styles = getSavedStyles().filter(function(item) {
      return item.name != name;
    });
    var i;
    styles.push({
      name: name,
      style: getCurrentStyle()
    });
    styles.sort(function(a, b) {
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 :
        a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;
    });
    GUI.setSavedValue(savedStylesKey, styles);
    renderSavedStyles();
    for (i=0; i<styleSelect.node().options.length; i++) {
      if (styleSelect.node().options[i].value == name) {
        styleSelect.node().selectedIndex = i;
        break;
      }
    }
  }

  function deleteSelectedStyle() {
    var name = styleSelect.node().value;
    var styles;
    if (!name) return;
    if (!window.confirm('Delete label style "' + name + '"?')) return;
    styles = getSavedStyles().filter(function(item) {
      return item.name != name;
    });
    GUI.setSavedValue(savedStylesKey, styles);
    renderSavedStyles();
  }

  function applySavedStyle(name) {
    var item = getSavedStyles().find(function(item) {
      return item.name == name;
    });
    if (!item) return;
    applyStyleObject(item.style);
  }

  function getSavedStyles() {
    var styles = GUI.getSavedValue(savedStylesKey);
    return Array.isArray(styles) ? styles : [];
  }

  function renderSavedStyles() {
    var value = styleSelect && styleSelect.node().value;
    if (!styleSelect) return;
    styleSelect.empty();
    El('option').attr('value', '').appendTo(styleSelect).text('');
    getSavedStyles().forEach(function(item) {
      El('option').attr('value', item.name).appendTo(styleSelect).text(item.name);
    });
    styleSelect.node().value = value || '';
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
    var fields = Object.keys(style || {}).reduce(function(memo, field) {
      if (field == 'label-pos') {
        labelPositionFields.forEach(function(field) {
          if (memo.indexOf(field) == -1) memo.push(field);
        });
      } else if (field != 'dx' && field != 'dy') {
        memo.push(field);
      }
      return memo;
    }, []);
    applyStyleFields(fields, function(rec) {
      savedStyleFields.forEach(function(field) {
        if (field in style && field != 'label-pos') {
          rec[field] = style[field];
        }
      });
      if (style['label-pos']) {
        setLabelPositionStyle(rec, style['label-pos']);
      }
    });
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
    applyStyleFields(labelPositionFields, function(rec) {
      setLabelPositionStyle(rec, pos);
    });
  }

  function applyIcon(iconName) {
    applyStyleFields([iconField, iconSizeField], function(rec) {
      if (iconName) {
        rec[iconField] = iconName;
        if (!(rec[iconSizeField] > 0)) {
          rec[iconSizeField] = defaultIconSize;
        }
      } else {
        rec[iconField] = undefined;
        rec[iconSizeField] = undefined;
      }
    });
  }

  function nudgeIconSize(delta) {
    var ids = getSelectionIds();
    var size = getNumericSize(ids, iconSizeField, defaultIconSize);
    if (ids.length === 0) return;
    size = Math.max(1, size + delta);
    applyStyleFields([iconField, iconSizeField], function(rec) {
      if (!rec[iconField]) {
        rec[iconField] = 'circle';
      }
      rec[iconSizeField] = size;
    });
  }

  function getNumericSize(ids, field, defaultValue) {
    var val = getCommonValue(ids, field);
    val = val ? Number(val) : defaultValue;
    return isFinite(val) && val > 0 ? val : defaultValue;
  }

  function isHexColor(str) {
    return /^#[0-9a-f]{6}$/i.test(str);
  }

  function initColorPicker(colorRow) {
    colorPicker = El('div').addClass('label-color-picker').appendTo(colorRow).hide();
    var sbWrap = El('div').addClass('label-color-canvas-wrap').appendTo(colorPicker);
    sbCanvas = El('canvas').attr('width', '256').attr('height', '256').appendTo(sbWrap);
    sbMarker = makePickerMarker().appendTo(sbWrap);
    var hueWrap = El('div').addClass('label-color-canvas-wrap').appendTo(colorPicker);
    hueCanvas = El('canvas').attr('width', '256').attr('height', '18').appendTo(hueWrap);
    hueMarker = makePickerMarker().appendTo(hueWrap);
    pickerHsbInputs = {};
    var hsbRow = El('div').addClass('label-color-picker-fields').appendTo(colorPicker);
    addPickerNumberInput(hsbRow, 'h', 'H');
    addPickerNumberInput(hsbRow, 's', 'S');
    addPickerNumberInput(hsbRow, 'b', 'B');
    var hexRow = El('label').addClass('label-color-picker-hex').appendTo(colorPicker);
    El('span').appendTo(hexRow).text('RGB');
    pickerHexInput = El('input').attr('type', 'text').appendTo(hexRow).on('change', function() {
      var hex = pickerHexInput.node().value.trim();
      if (isHexColor(hex)) {
        setPickerColor(hexToHsb(hex));
      }
    });
    var btnRow = El('div').addClass('label-color-picker-buttons').appendTo(colorPicker);
    El('button').appendTo(btnRow).text('Apply').on('click', applyPickerColor);
    El('button').appendTo(btnRow).text('Close').on('click', closePickerColor);
    sbCanvas.on('mousedown', function(e) {
      startCanvasDrag(e, updateSbFromEvent);
    });
    hueCanvas.on('mousedown', function(e) {
      startCanvasDrag(e, updateHueFromEvent);
    });
    setPickerColor(pickerColor);
  }

  function addPickerNumberInput(row, name, label) {
    var wrapper = El('label').appendTo(row);
    El('span').appendTo(wrapper).text(label);
    pickerHsbInputs[name] = El('input')
      .attr('type', 'text')
      .appendTo(wrapper)
      .on('change', function() {
        setPickerColor({
          h: degreesToByte(parseNumberField(pickerHsbInputs.h.node().value)),
          s: pctToByte(parseNumberField(pickerHsbInputs.s.node().value)),
          b: pctToByte(parseNumberField(pickerHsbInputs.b.node().value))
        });
      });
  }

  function toggleColorPicker() {
    if (colorPicker.visible()) {
      hideColorPicker();
    } else {
      pickerStartColor = Object.assign({}, pickerColor);
      colorPicker.show();
      drawColorPicker();
    }
  }

  function hideColorPicker() {
    colorPicker.hide();
    pickerStartColor = null;
  }

  function startCanvasDrag(e, update) {
    var evt = e.originalEvent || e;
    colorPicker.addClass('dragging-color');
    El('body').addClass('dragging-color-picker');
    update(evt);
    document.addEventListener('mousemove', onmove);
    document.addEventListener('mouseup', onup);
    evt.preventDefault();
    function onmove(evt) {
      update(evt);
    }
    function onup() {
      document.removeEventListener('mousemove', onmove);
      document.removeEventListener('mouseup', onup);
      colorPicker.removeClass('dragging-color');
      El('body').removeClass('dragging-color-picker');
    }
  }

  function updateSbFromEvent(evt) {
    var p = getCanvasPoint(sbCanvas.node(), evt);
    setPickerColor({
      h: pickerColor.h,
      s: p.x,
      b: 255 - p.y
    });
  }

  function updateHueFromEvent(evt) {
    var p = getCanvasPoint(hueCanvas.node(), evt);
    setPickerColor({
      h: p.x,
      s: pickerColor.s,
      b: pickerColor.b
    });
  }

  function getCanvasPoint(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.round((evt.clientX - rect.left) / rect.width * (canvas.width - 1)), 0, canvas.width - 1),
      y: clamp(Math.round((evt.clientY - rect.top) / rect.height * (canvas.height - 1)), 0, canvas.height - 1)
    };
  }

  function setPickerColor(hsb) {
    pickerColor = {
      h: clamp(Math.round(hsb.h), 0, 255),
      s: clamp(Math.round(hsb.s), 0, 255),
      b: clamp(Math.round(hsb.b), 0, 255)
    };
    drawColorPicker();
    updatePickerFields();
  }

  function updatePickerFields() {
    var hex = hsbToHex(pickerColor);
    pickerHsbInputs.h.node().value = byteToDegrees(pickerColor.h) + '°';
    pickerHsbInputs.s.node().value = byteToPct(pickerColor.s) + '%';
    pickerHsbInputs.b.node().value = byteToPct(pickerColor.b) + '%';
    pickerHexInput.node().value = hex;
    colorInput.node().value = hex;
    colorChit.css('background-color', hex);
  }

  function drawColorPicker() {
    if (!sbCanvas) return;
    drawSaturationBrightnessCanvas();
    drawHueCanvas();
  }

  function drawSaturationBrightnessCanvas() {
    var ctx = sbCanvas.node().getContext('2d');
    var image = ctx.createImageData(256, 256);
    var data = image.data;
    var i = 0;
    for (var y=0; y<256; y++) {
      for (var x=0; x<256; x++) {
        var rgb = hsbToRgb({
          h: pickerColor.h,
          s: x,
          b: 255 - y
        });
        data[i++] = rgb.r;
        data[i++] = rgb.g;
        data[i++] = rgb.b;
        data[i++] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    positionMarker(sbMarker, pickerColor.s, 255 - pickerColor.b, pickerColor);
  }

  function drawHueCanvas() {
    var ctx = hueCanvas.node().getContext('2d');
    var image = ctx.createImageData(256, 18);
    var data = image.data;
    var i = 0;
    for (var y=0; y<18; y++) {
      for (var x=0; x<256; x++) {
        var rgb = hsbToRgb({h: x, s: 255, b: 255});
        data[i++] = rgb.r;
        data[i++] = rgb.g;
        data[i++] = rgb.b;
        data[i++] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    positionMarker(hueMarker, pickerColor.h, 9, {h: pickerColor.h, s: 255, b: 255});
  }

  function applyPickerColor() {
    applyLabelColor(hsbToHex(pickerColor));
    hideColorPicker();
  }

  function closePickerColor() {
    if (pickerStartColor) {
      setPickerColor(pickerStartColor);
    }
    hideColorPicker();
  }

  function getMarkerColor(rgb) {
    var luminance = rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
    return luminance < 128 ? '#fff' : '#000';
  }

  function makePickerMarker() {
    return El('<svg class="label-color-marker" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"></circle></svg>');
  }

  function positionMarker(marker, x, y, hsb) {
    var rgb = hsbToRgb(hsb);
    marker.css({
      left: x - 8,
      top: y - 8
    });
    marker.findChild('circle').attr('stroke', getMarkerColor(rgb));
  }

  function hexToHsb(hex) {
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d) {
      if (max == r) h = ((g - b) / d) % 6;
      else if (max == g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return {
      h: Math.round(h / 360 * 255),
      s: Math.round(max === 0 ? 0 : d / max * 255),
      b: max
    };
  }

  function hsbToHex(hsb) {
    var rgb = hsbToRgb(hsb);
    return '#' + [rgb.r, rgb.g, rgb.b].map(function(val) {
      return val.toString(16).padStart(2, '0');
    }).join('');
  }

  function hsbToRgb(hsb) {
    var h = hsb.h / 255 * 360;
    var s = hsb.s / 255;
    var v = hsb.b / 255;
    var c = v * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = v - c;
    var rgb = h < 60 ? [c, x, 0] :
      h < 120 ? [x, c, 0] :
      h < 180 ? [0, c, x] :
      h < 240 ? [0, x, c] :
      h < 300 ? [x, 0, c] : [c, 0, x];
    return {
      r: Math.round((rgb[0] + m) * 255),
      g: Math.round((rgb[1] + m) * 255),
      b: Math.round((rgb[2] + m) * 255)
    };
  }

  function byteToPct(val) {
    return Math.round(val / 255 * 100);
  }

  function pctToByte(val) {
    return Math.round(clamp(val, 0, 100) / 100 * 255);
  }

  function byteToDegrees(val) {
    return Math.round(val / 255 * 360);
  }

  function degreesToByte(val) {
    return Math.round(clamp(val, 0, 360) / 360 * 255);
  }

  function parseNumberField(str) {
    return Number(String(str).replace(/[°%]/g, '').trim());
  }

  function clamp(val, min, max) {
    return isFinite(val) ? Math.max(min, Math.min(max, val)) : min;
  }

  function applyStyleFields(fields, updateRecord) {
    var table = getActiveTable();
    var ids = getSelectionIds();
    var hasNewFields;
    if (!table || ids.length === 0) return;
    hasNewFields = fields.some(function(field) {
      return !table.fieldExists(field);
    });
    gui.dispatchEvent('data_preupdate', {ids: ids});
    if (hasNewFields) {
      table.captureSchemaBefore({operation: 'label-style', fields: fields});
    } else {
      table.captureFieldsBefore(fields, {operation: 'label-style'});
    }
    updateRecords(ids, table, updateRecord);
    if (hasNewFields) {
      table.markSchemaChanged({operation: 'label-style'});
    } else {
      table.markFieldsChanged(fields, {operation: 'label-style'});
    }
    gui.dispatchEvent('data_postupdate', {ids: ids});
    gui.model.updated({style: true, same_table: true});
    setTimeout(updateSelectionDisplay, 0);
    updateControls();
    updateSelectionDisplay();
  }

  function updateRecords(ids, table, updateRecord) {
    var records = table.getRecords();
    ids.forEach(function(id) {
      var rec = records[id] || {};
      updateRecord(rec);
      records[id] = rec;
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