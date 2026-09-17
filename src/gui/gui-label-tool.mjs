import { getFontStyleVariants, getInstalledFonts } from './gui-label-fonts';
import { ColorPicker, isHexColor } from './gui-color-picker';
import { StylePresetControl } from './gui-style-preset-control';
import { SizeField } from './gui-size-field';
import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import {
  getNewLabelStyle, updateNewLabelStyle, getLabelTextSession
} from './gui-label-style-state';

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
var labelMode = 'label';
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
  // label-style-panel carries the styling the point and layer panels share; the
  // second class is this panel's own, as theirs are
  var panel = El('div').addClass('label-style-panel text-style-panel rollover').appendTo(parent).hide();
  var presetControl, fontSelect, fontStyleSelect, fontSizeInput, colorChit, colorInput, colorPicker, cssInput, posBtns, iconBtns, iconSizeInput, editingStatus, clearLink, closeBtn, hit;
  var fontOptionsRendered = false;

  initPanel();
  gui.addMode(labelStylePanelMode, turnOn, turnOff);
  // Panel visibility is derived rather than toggled, because two modes can ask
  // for it -- the label_style entry point through its own GUI mode, and the
  // label tool, which owns the GUI mode itself -- and either can end while the
  // other is still on. Registering after addMode() means turnOff() has already
  // run by the time this recomputes.
  gui.on('mode', updatePanelVisibility);
  gui.model.on('update', updateVisibility);
  gui.model.on('update', function() {
    if (panel.visible()) updateControls();
    setTimeout(updateSelectionDisplay, 0);
  });
  gui.on('undo_redo_post', function() {
    if (panel.visible()) {
      updateControls();
      updateSelectionDisplay();
    }
  });
  gui.on('label_text_session_change', function() {
    // a label opened for typing becomes what the controls act on
    if (panel.visible()) updateControls();
  });
  gui.on('interaction_mode_change', function(e) {
    if (gui.getMode() == labelStylePanelMode && e.mode != labelStyleMode) {
      gui.clearMode(); // runs turnOff(), which recomputes visibility
    } else {
      updatePanelVisibility();
    }
  });

  hit = gui.map.getHitControl && gui.map.getHitControl();
  if (hit) {
    hit.on('change', function(e) {
      if (e.mode == labelStyleMode || e.mode == labelMode) {
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
      showPanel();
    } else {
      gui.enterMode(labelStylePanelMode);
    }
  };

  function initPanel() {
    // A label being typed into keeps the caret while the panel is used. Most of
    // these controls are divs and spans, which take focus from the textarea on
    // mousedown without wanting it, and the editing session ends when the
    // textarea is blurred. Refusing the focus change is what lets the user set
    // a font and carry on typing; the real form elements below are allowed to
    // take focus and hand it back (see restoreTextFocus).
    panel.node().addEventListener('mousedown', function(e) {
      if (!isFormElement(e.target) && getLabelTextSession(gui)) {
        e.preventDefault();
      }
    });

    // The catch-all for the controls that do take focus and then do not set a
    // style -- the colour picker's Close button is the one that exists. Runs
    // after the control's own handler, and leaves focus alone if it is in
    // something the user is typing into, such as the CSS field.
    //
    // A click on a <select> is left alone too. That click has just opened the
    // menu, and a native menu closes as soon as its element loses focus, so
    // taking the caret back here made the font menu flash open and shut. The
    // menu hands focus back by its own change handler, through
    // applyStyleValues(). Only the click on the menu itself is skipped, so
    // every other way out of a menu still returns the caret: any other control
    // either sets a style or reaches this handler with itself as the target.
    panel.node().addEventListener('click', function(e) {
      if (isTextInput(document.activeElement) || opensAMenu(e.target)) return;
      restoreTextFocus();
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel).text('Label styles');
    closeBtn = El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
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
    fontSizeInput = new SizeField(fontSizeRow, {
      title: 'Font size in px',
      onSet: function(value) {
        applyStyleValues([[fontSizeField, value]]);
      },
      onStep: nudgeFontSize
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
    iconSizeInput = new SizeField(sizeRow, {
      title: 'Symbol size in px',
      onSet: function(value) {
        // Typing a size for a label with no symbol is asking for one, the way
        // stepping from nothing is.
        applyStyleValues([[iconField, getTargetIcon()], [iconSizeField, value]]);
      },
      onStep: nudgeIconSize
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
        return !controlsEnabled();
      }
    });
  }

  function appendIconButtonSymbol(btn, iconName) {
    var svg = '<svg class="label-icon-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
      iconButtonSymbols[iconName] + '</svg>';
    El(svg).appendTo(btn);
  }

  // Deliberately not focusable: the GUI is pointer-only, so a tab stop here
  // would lead into a control the keyboard cannot then operate. See the focus
  // note in page.css.
  function makePanelButton(parent, label, action) {
    return El('div')
      .addClass('label-panel-btn')
      .attr('role', 'button')
      .appendTo(parent)
      .text(label)
      .on('click', function(e) {
        if (this.classList.contains('disabled')) return;
        action(e);
      });
  }

  function setPanelButtonDisabled(el, disabled) {
    el.classed('disabled', !!disabled)
      .attr('aria-disabled', disabled ? 'true' : 'false');
  }

  function turnOn() {
    if (!activeLayerHasLabels()) {
      gui.clearMode();
      return;
    }
    gui.interaction.setMode(labelStyleMode);
    showPanel();
  }

  function turnOff() {
    updatePanelVisibility(); // the label tool may still want the panel up
    if (hit) hit.clearSelection();
    if (gui.interaction.getMode() == labelStyleMode) {
      gui.interaction.turnOff();
    }
  }

  function updatePanelVisibility() {
    if (panelShouldBeVisible()) {
      showPanel();
    } else if (panel.visible()) {
      hidePanel();
    }
  }

  function panelShouldBeVisible() {
    // The label tool keeps the panel up whether or not the layer has labels, so
    // that a style can be chosen before there is a label to apply it to.
    return labelModeIsOn() || gui.getMode() == labelStylePanelMode;
  }

  function showPanel() {
    renderFontOptions();
    gui.state.label_style_panel_open = true;
    panel.show();
    // In label mode the panel belongs to the mode rather than being a thing the
    // user opened, and closing it would leave the tool half on.
    closeBtn[labelModeIsOn() ? 'hide' : 'show']();
    textBtn.addClass('selected');
    updateControls();
    updateSelectionDisplay();
  }

  function hidePanel() {
    panel.hide();
    hideColorPicker();
    gui.state.label_style_panel_open = false;
    textBtn.removeClass('selected');
    clearSelectionDisplay();
  }

  function labelModeIsOn() {
    return !!(gui.interaction && gui.interaction.getMode() == labelMode);
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

  // The labels a control acts on: whatever is selected for styling.
  //
  // With the label tool on, an empty selection means the label about to be made
  // rather than every label on the layer -- restyling a whole layer is not what
  // a click on a font control means while labels are being placed. Outside
  // label mode an empty selection still means the whole layer, which is right
  // for a styling mode entered deliberately.
  //
  // A label open for text editing is the target on its own, ahead of the
  // styling selection, which text editing empties anyway. Setting a style
  // while typing is ordinary use rather than a corner case: a label is placed
  // empty, and its font, colour and position are usually chosen before, or
  // instead of, any of its text.
  function getTargetIds() {
    var session = getLabelTextSession(gui);
    var ids;
    // A pending label has no feature to style yet, so a control set while one
    // is open writes the style for the next label -- which is the label being
    // typed into, and which renders it immediately.
    if (session && session.id > -1) return [session.id];
    if (session) return [];
    ids = getSelectionIds();
    if (ids.length > 0) return ids;
    return labelModeIsOn() ? [] : getAllLabelIds();
  }

  // With nothing selected the controls edit the style that new labels are given,
  // so they stay live even when there is no label, and no layer, yet.
  function controlsEnabled() {
    return getTargetIds().length > 0 || labelModeIsOn();
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
    var showValues = controlsEnabled();
    var fontVal = getCommonValue(ids, fontField);
    var fontSizeVal = getCommonValue(ids, fontSizeField, {useDefault: true, defaultValue: defaultFontSize});
    var fontStyleVal = getCommonValue(ids, fontStyleField, {useDefault: true, defaultValue: defaultFontStyle});
    var fontWeightVal = getCommonValue(ids, fontWeightField, {useDefault: true, defaultValue: defaultFontWeight});
    var fillVal = getCommonValue(ids, fillField, {useDefault: true, defaultValue: defaultLabelColor});
    var cssVal = getCommonValue(ids, cssField);
    var posVal = getCommonValue(ids, 'label-pos');
    var iconVal = getCommonValue(ids, iconField);
    var iconSizeVal = getCommonValue(ids, iconSizeField, {useDefault: true, defaultValue: defaultIconSize});
    updateEditingStatus(manualIds.length, !!getLabelTextSession(gui));
    updateSavedStyleControls();
    fontSelect.node().disabled = !showValues;
    fontSelect.node().value = fontVal;
    updateFontStyleControls(fontVal, fontStyleVal, fontWeightVal);
    updateFontSizeControls(showValues ? fontSizeVal : '');
    updateColorControls(showValues ? fillVal : '');
    updateCssControl(showValues ? cssVal : '');
    updatePositionButtons(showValues ? posVal : '', ids);
    updateIconButtons(showValues ? iconVal : '');
    updateIconSizeControls(showValues ? iconSizeVal : '');
  }

  function updatePositionButtons(pos, ids) {
    // Disabled for a selection of nothing but path labels, whose text runs
    // along a curve from a start offset and so has no position around an anchor
    // to take. The commands ignore a position given for one, and a disabled
    // button says so where a console warning would not.
    var disabled = !controlsEnabled() || everyLabelIsOnAPath(ids);
    labelPositions.forEach(function(name) {
      posBtns[name].classed('selected', name == pos);
      setPanelButtonDisabled(posBtns[name], disabled);
    });
  }

  function everyLabelIsOnAPath(ids) {
    var lyr = getActiveLayer();
    var table = lyr && lyr.data;
    if (!ids || ids.length === 0 || !lyr || !lyr.shapes) return false;
    return ids.every(function(id) {
      return internal.svg.shapeIsPathLabel(lyr.shapes[id],
        table ? table.getRecordAt(id) : null);
    });
  }

  function updateEditingStatus(count, editingText) {
    editingStatus.text('Editing: ' + describeTarget(count, editingText));
    // "deselect" is for a selection the user made; a label being typed into is
    // left by clicking away or pressing Escape, not from here.
    clearLink.classed('hidden', count === 0 || editingText);
  }

  // What the controls will act on. In label mode an empty selection is the next
  // label rather than the whole layer, and saying "all" there is what would
  // make the panel untrustworthy.
  function describeTarget(count, editingText) {
    if (editingText) return 'this label';
    if (count > 0) return count + ' selected';
    return labelModeIsOn() ? 'new labels' : 'all';
  }

  function updateFontSizeControls(fontSizeVal) {
    fontSizeInput.setValue(fontSizeVal || '');
    fontSizeInput.setDisabled(!controlsEnabled());
  }

  function updateFontStyleControls(fontName, fontStyleVal, fontWeightVal) {
    var disabled = !controlsEnabled() || !fontName;
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
    var disabled = !controlsEnabled();
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
    cssInput.node().disabled = !controlsEnabled();
    cssInput.node().value = cssVal || '';
  }

  function updateIconButtons(iconVal) {
    var disabled = !controlsEnabled();
    iconTypes.forEach(function(icon) {
      iconBtns[icon.name].classed('selected', !disabled && icon.name == iconVal);
      setPanelButtonDisabled(iconBtns[icon.name], disabled);
    });
  }

  function updateIconSizeControls(iconSizeVal) {
    iconSizeInput.setValue(iconSizeVal || '');
    iconSizeInput.setDisabled(!controlsEnabled());
  }

  function updateSavedStyleControls() {
    presetControl.update();
  }

  function getCommonValue(ids, field, opts) {
    var table = getActiveTable();
    var records = table && table.getRecords();
    var value, val, hasValue;
    if (ids.length === 0) return getNewLabelValue(field, opts);
    if (!records) return '';
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

  // What a control shows when there is nothing to style: the value the next
  // label will be created with, falling back to the same default an existing
  // label would show.
  function getNewLabelValue(field, opts) {
    var style = labelModeIsOn() ? getNewLabelStyle(gui) : null;
    var val = style ? style[field] : '';
    if (val || val === 0) return val;
    return opts && opts.useDefault ? opts.defaultValue : '';
  }

  function applyFont(fontName) {
    applyStyleValues([[fontField, fontName]]);
  }

  function nudgeFontSize(delta) {
    var ids = getTargetIds();
    var size = getNumericSize(ids, fontSizeField, defaultFontSize);
    if (!controlsEnabled()) return;
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
    addStyleValue(style, fontSizeField, fontSizeInput.getValue());
    addStyleValue(style, fillField, colorInput.node().value.trim());
    addStyleValue(style, cssField, cssInput.node().value.trim());
    addStyleValue(style, 'label-pos', getSelectedLabelPosition());
    addStyleValue(style, iconField, icon);
    if (icon) {
      addStyleValue(style, iconSizeField, iconSizeInput.getValue());
    }
    return style;
  }

  function addStyleValue(style, field, value) {
    if (value || value === 0) {
      style[field] = value;
    }
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
    if (!controlsEnabled()) return;
    size = Math.max(1, size + delta);
    applyStyleValues([[iconField, getTargetIcon()], [iconSizeField, size]]);
  }

  // Sizing the symbol of a label that has none means giving it one, so the
  // shape has to be sent with the size -- an icon-size on its own draws
  // nothing.
  function getTargetIcon() {
    return getCommonValue(getTargetIds(), iconField) || 'circle';
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

  function isFormElement(node) {
    return !!node && /^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION)$/.test(node.nodeName);
  }

  function isTextInput(node) {
    if (!node) return false;
    if (node.nodeName == 'TEXTAREA') return true;
    return node.nodeName == 'INPUT' &&
      !/^(button|checkbox|radio|submit)$/.test(node.type);
  }

  // Whether clicking this node puts a native menu on screen, which must then be
  // left holding the focus. OPTION counts because a browser that reports the
  // chosen option as the click target is reporting a menu interaction either
  // way, and a choice restores the caret through its change handler.
  function opensAMenu(node) {
    return !!node && /^(SELECT|OPTION)$/.test(node.nodeName);
  }

  // Returns the caret to a label being typed into, after a control that took
  // focus to do its job. Only pulls focus out of this panel, so that clicking
  // somewhere else while a menu is open still means what it says.
  function restoreTextFocus() {
    var session = getLabelTextSession(gui);
    if (!session) return;
    if (!panel.node().contains(document.activeElement)) return;
    session.refocus();
  }

  function applyStyleValues(styles, opts) {
    if (styles.length === 0) return;
    restoreTextFocus();
    // What the panel is set to is always what the next label gets, whether or
    // not these values also went to a label that already exists. -add-label
    // writes them when that label is created, which is why this needs no
    // command and no undo step of its own.
    if (labelModeIsOn()) {
      updateNewLabelStyle(gui, styles);
      // A label being typed into that has no feature yet is drawn from that
      // style, so it has to be redrawn to show the change -- it is the preview.
      refreshPendingLabel();
    }
    if (getTargetIds().length > 0) {
      applyStyleCommand(styles, opts);
      return;
    }
    if (!labelModeIsOn()) return;
    if (!opts || !opts.preservePreset) {
      presetControl.clearSelection();
    }
    updateControls();
  }

  function refreshPendingLabel() {
    var session = getLabelTextSession(gui);
    if (session && session.id == -1 && session.refresh) session.refresh();
  }

  function applyStyleCommand(styles, opts) {
    var lyr = getActiveLayer();
    var ids = getTargetIds();
    var parts = ['-style'];
    if (!gui.console || !lyr) return;
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

  // The yellow halo, which belongs to the older label_style mode. The label
  // tool draws its selection as an outline instead (gui-label-selection.mjs),
  // because a halo says "this text is marked" where an outline says "this is
  // an object you can act on" -- and the tool needs the second reading now that
  // one click selects and another reaches into the text.
  function updateSelectionDisplay() {
    clearSelectionDisplay();
    if (labelModeIsOn()) return;
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