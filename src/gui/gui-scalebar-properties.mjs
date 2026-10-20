import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { showPopupAlert } from './gui-alert';
import { makePanelSection, makeColorField, makePanelActionButton } from './gui-panel-controls';
import { ColorPicker, isHexColor } from './gui-color-picker';
import { getScalebarCommand } from './gui-scalebar-command';
import { appendSizeFieldStepper, parseSizeValue, getSizeFieldKeyAction } from './gui-size-field';
import { getDefaultFontName, getFontStyleVariants, appendFontOptions,
  getNearestFontStyleVariant, variantIsRegular } from './gui-label-fonts';

var positionOptions = [
  ['top-left', 'Top left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right']
];

var labelPositionOptions = {
  a: [
    ['top-left', 'Top left'],
    ['top-center', 'Top center'],
    ['top-right', 'Top right'],
    ['bottom-left', 'Bottom left'],
    ['bottom-center', 'Bottom center'],
    ['bottom-right', 'Bottom right']
  ],
  b: [['top', 'Above'], ['bottom', 'Below']],
  c: [['top', 'Above'], ['bottom', 'Below']]
};

// The bars of a dual-unit style c scalebar have their labels on the outside,
// so the labels menu sets how the bars line up instead
var alignOptions = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];

// The labels of a dual-unit style a scalebar are above the top bar and below
// the bottom one, so only their horizontal position can be chosen
var dualBarLabelOptions = [['top-left', 'Left'], ['top-center', 'Center'],
  ['top-right', 'Right']];

// What the scalebar is drawn in when it has no color of its own
var defaultColor = '#000000';

// Settings of the frame's scalebar. Every edit sends a complete -scalebar
// command, which replaces the scalebar, so edits are undoable and replayable
// like any other command.
export function ScalebarProperties(gui) {
  var popup, form, note;
  var stopPanelDrag = null;
  var labelInput, unitsSelect, styleSelect, labelCaseSelect, positionSelect,
    labelPositionSelect, labelPositionTitle, labelPositionField, fontSizeInput, barWidthInput, marginInput,
    fontSelect, fontStyleSelect, colorChit, colorInput, colorPicker;

  gui.scalebarProperties = this;

  // The panel doesn't block the map, so anything can change the scalebar or
  // the frame while it is open: an undo, a frame edit, a console command.
  gui.model.on('update', function(e) {
    var flags = e.flags || {};
    if (!popup || flags.simplify_amount || flags.redraw_only) return;
    if (getScalebarRecord()) {
      updateControls();
    } else {
      closePanel();
    }
  });

  // Adds a scalebar to the frame if it doesn't have one
  this.open = function(frameTarget) {
    var frame = frameTarget || gui.model.getActiveFrame();
    if (!frame) return;
    if (getScalebarRecord()) {
      showPanel();
    } else {
      runCommand('-scalebar', 'Add scale bar', showPanel);
    }
  };

  this.isOpen = function() {
    return !!popup;
  };

  // Opens where the editing panels do. A drag lasts only for this opening;
  // closing discards the moved position.
  function showPanel() {
    var d = getScalebarRecord();
    if (!d) return;
    closePanel();
    popup = showPopupAlert('', 'Scale bar', {
      non_blocking: true,
      classname: 'scalebar-properties-box'
    });
    popup.onClose(function() {
      if (stopPanelDrag) stopPanelDrag();
      stopPanelDrag = null;
      popup = form = null;
    });
    popup.container().addClass('scalebar-properties-popup');
    form = El('div')
      .addClass('label-style-panel scalebar-properties-form')
      .appendTo(popup.container());
    initForm();
    updateControls();
    placePanel();
  }

  function closePanel() {
    if (popup) popup.close();
  }

  function placePanel() {
    var box = popup.container().node().parentNode;
    var mapNode = gui.container.findChild('.mshp-main-map').node();
    var map = mapNode.getBoundingClientRect();
    var style = window.getComputedStyle(mapNode);
    var top = parseFloat(style.getPropertyValue('--map-panel-top'));
    var right = parseFloat(style.getPropertyValue('--map-panel-right'));
    if (!isFinite(top)) top = 7;
    if (!isFinite(right)) right = 36;
    box.style.position = 'absolute';
    box.style.marginTop = '0';
    box.style.left = 'auto';
    box.style.right = Math.round(window.innerWidth - map.right + right) + 'px';
    box.style.top = Math.round(map.top + top) + 'px';
    stopPanelDrag = makePanelDraggable(box);
  }

  function initForm() {
    var row;
    note = El('div').addClass('scalebar-properties-note').appendTo(form).hide();

    row = makeRow(form);
    labelInput = makeDistanceField(makeCell(row, 'Distance', 'div'))
      .on('change', function() {
        update({label: labelInput.node().value.trim()});
      });
    unitsSelect = makeSelect(makeCell(row, 'Units'), 'scalebar-units-select',
      [['miles', 'Miles'], ['km', 'Kilometers'], ['dual', 'Dual']])
      .on('change', function() {
        var value = unitsSelect.node().value;
        if (value == 'dual') {
          update({dual_units: true});
        } else {
          update(getSingleUnitChanges(getScalebarRecord(), value));
        }
      });

    row = makeRow(form);
    styleSelect = makeSelect(makeCell(row, 'Style'), 'scalebar-style-select',
      [['a', 'Bar'], ['b', 'Ticks'], ['c', 'Segments']])
      .on('change', function() {
        update({style: styleSelect.node().value});
      });
    labelCaseSelect = makeSelect(makeCell(row, 'Label format'), 'scalebar-label-case-select', [])
      .on('change', function() {
        update({label_case: labelCaseSelect.node().value});
      });

    row = makeRow(form);
    positionSelect = makeSelect(makeCell(row, 'Position'), 'scalebar-position-select',
      positionOptions)
      .on('change', function() {
        update({position: positionSelect.node().value});
      });
    var labelPositionCell = makeCell(row, 'Labels');
    labelPositionTitle = labelPositionCell.findChild('span');
    labelPositionSelect = makeSelect(labelPositionCell,
      'scalebar-label-position-select', [])
      .on('change', function() {
        var changes = {};
        changes[labelPositionField] = labelPositionSelect.node().value;
        update(changes);
      });

    var appearance = makePanelSection(form, 'Appearance');

    // Font and face menus, as in the label panel
    row = makeRow(appearance);
    fontSelect = El('select').attr('aria-label', 'Font').addClass('scalebar-font-select font-menu')
      .appendTo(makeCell(row, 'Font'))
      .on('change', function() {
        if (fontSelect.node().value) applyFont(fontSelect.node().value);
      });
    renderFontOptions();
    fontStyleSelect = El('select').attr('aria-label', 'Font style')
      .addClass('scalebar-font-style-select')
      .appendTo(makeCell(row, 'Font style'))
      .on('change', function() {
        if (fontStyleSelect.node().value) applyFontStyle(fontStyleSelect.node().value);
      });

    // The picker lines up with the right edge of its parent, so the row is its
    // parent rather than the narrow color cell
    row = makeRow(appearance);
    var colorCell = El('div').addClass('frame-input-cell scalebar-color-cell').appendTo(row);
    El('span').appendTo(colorCell).text('Color');
    colorChit = El('div').addClass('label-color-chit').attr('role', 'button')
      .on('click', function() { colorPicker.toggle(); });
    colorInput = El('input').attr('type', 'text').attr('aria-label', 'Scale bar color')
      .on('change', function() {
        var color = colorInput.node().value.trim();
        var d = getScalebarRecord();
        // An emptied field unsets the colour, so the scalebar is drawn in
        // the default one.
        if (!color && !(d && d.color)) {
          updateControls();
          return;
        }
        if (isHexColor(color)) colorPicker.setColor(color);
        update({color: color});
      });
    makeColorField(colorCell, colorChit, colorInput);
    colorPicker = new ColorPicker(row, {
      onPreview: showColor,
      onChange: function(hex) {
        showColor(hex);
        update({color: hex});
      }
    });
    fontSizeInput = makeSteppedNumberInput(makeCell(row, 'Font size', 'div'), 'font_size',
      'scalebar-font-size', {step: 1, bigStep: 10})
      .attr('aria-label', 'Font size');

    row = makeRow(appearance);
    barWidthInput = makeSteppedNumberInput(makeCell(row, 'Bar width', 'div'), 'bar_width',
      'scalebar-bar-width', {step: 1, bigStep: 5})
      .attr('aria-label', 'Bar width');
    marginInput = makeNumberInput(makeCell(row, 'Inset'), 'margin',
      'scalebar-margin')
      .attr('aria-label', 'Distance from the edges of the frame, in pixels');

    row = El('div').addClass('label-style-row label-panel-button-row').appendTo(form);
    makePanelActionButton(row, 'Remove scale bar', function() {
      runCommand('-scalebar remove', 'Remove scale bar', function() {
        if (popup) popup.close();
      });
    });
  }

  function updateControls() {
    var d = getScalebarRecord();
    var problem, style, unitsValue;
    if (!d || !form) return;
    labelInput.node().value = d.label || '';
    style = internal.getScalebarStyle(d);
    unitsValue = isDualUnit(d) ? 'dual' :
      getUnitsMenuValue(d.units || internal.parseScalebarUnits(d.label || ''));
    setSelectValue(unitsSelect, unitsValue);
    setSelectValue(styleSelect, style);
    labelCaseSelect.empty();
    appendSelectOptions(labelCaseSelect, getLabelCaseOptions(unitsValue));
    setSelectValue(labelCaseSelect, internal.getScalebarLabelCase(d) || 'upper');
    setSelectValue(positionSelect, d.position || 'top-left');
    if (style == 'c' && isDualUnit(d)) {
      labelPositionField = 'align';
      labelPositionTitle.text('Align');
      labelPositionSelect.empty();
      appendSelectOptions(labelPositionSelect, alignOptions);
      setSelectValue(labelPositionSelect, d.align || 'center');
    } else if (style == 'a' && isDualUnit(d)) {
      labelPositionField = 'label_position';
      labelPositionTitle.text('Labels');
      labelPositionSelect.empty();
      appendSelectOptions(labelPositionSelect, dualBarLabelOptions);
      setSelectValue(labelPositionSelect,
        'top-' + getLabelPositionMenuValue(d.label_position, style).split('-')[1]);
    } else {
      labelPositionField = 'label_position';
      labelPositionTitle.text('Labels');
      renderLabelPositionOptions(style);
      setSelectValue(labelPositionSelect,
        getLabelPositionMenuValue(d.label_position, style));
    }
    fontSizeInput.node().value = formatValue(d.font_size);
    barWidthInput.node().value = formatValue(d.bar_width);
    marginInput.node().value = formatValue(d.margin);
    updateFontControls(d);
    showColor(d.color || defaultColor);
    if (isHexColor(d.color || defaultColor)) colorPicker.setColor(d.color || defaultColor);
    problem = getFrameProblem();
    note.text(problem ? 'The scale bar is hidden: ' + problem + '.' : '');
    if (problem) note.show(); else note.hide();
  }

  function showColor(color) {
    colorInput.node().value = color || '';
    colorChit.css('background-color', color || 'transparent');
  }

  function renderFontOptions() {
    appendFontOptions(fontSelect.node());
  }

  function renderLabelPositionOptions(style) {
    labelPositionSelect.empty();
    appendSelectOptions(labelPositionSelect, labelPositionOptions[style]);
  }

  // A scalebar with no font of its own is shown in the font it is drawn in
  function getShownFont(d) {
    return d.font_family || getDefaultFontName();
  }

  function updateFontControls(d) {
    var font = getShownFont(d);
    var shown = font ? getNearestFontStyleVariant(font, d.font_style, d.font_weight) : null;
    if (font) {
      setSelectValue(fontSelect, font);
    } else {
      fontSelect.node().selectedIndex = -1;
    }
    fontStyleSelect.empty();
    getFontStyleVariants(font).forEach(function(variant) {
      El('option').attr('value', variant.value).appendTo(fontStyleSelect).text(variant.label);
    });
    fontStyleSelect.node().disabled = !font;
    if (shown) {
      fontStyleSelect.node().value = shown.value;
    } else {
      fontStyleSelect.node().selectedIndex = -1;
    }
  }

  // Keeps the current face, or the nearest one the new font has
  function applyFont(fontName) {
    var d = getScalebarRecord();
    var changes = {font_family: fontName};
    var variant = getNearestFontStyleVariant(fontName, d.font_style, d.font_weight);
    if (variant) Object.assign(changes, getFontStyleValues(variant));
    update(changes);
  }

  // A face belongs to a font, so a scalebar given one names the font it is
  // drawn in
  function applyFontStyle(value) {
    var parts = value.split('|');
    var changes = getFontStyleValues({style: parts[0], weight: parts[1]});
    var d = getScalebarRecord();
    if (!d.font_family && getDefaultFontName()) {
      changes.font_family = getDefaultFontName();
    }
    update(changes);
  }

  // Regular is stored as no face at all
  function getFontStyleValues(variant) {
    if (variantIsRegular(variant)) {
      return {font_style: '', font_weight: ''};
    }
    return {font_style: variant.style, font_weight: variant.weight};
  }

  // Applies edits to the current settings and replaces the scalebar. The
  // units menu always applies, so it is written even when it shows the default.
  function update(changes) {
    var d = Object.assign({}, getScalebarRecord(), changes);
    if (changes.style && changes.style != 'c') d.align = '';
    // a dual-unit scalebar with no style is style b, not the style a shown
    if (changes.dual_units && !d.style) d.style = 'a';
    if (!d.units) d.units = unitsSelect.node().value == 'dual' ? 'miles' : unitsSelect.node().value;
    runCommand(getScalebarCommand(d), 'Update scale bar', updateControls);
  }

  // The arrows and the arrow keys step through the lengths that automatic
  // sizing chooses from, starting from the current length
  function makeDistanceField(cell) {
    var box = El('div').addClass('size-field scalebar-distance-field').appendTo(cell);
    var input = makeInput(box, 'size-field-input scalebar-label-input')
      .attr('placeholder', 'Automatic')
      .attr('aria-label', 'Distance');
    var buttons = appendSizeFieldStepper(box);
    input.on('keydown', function(e) {
      if (e.key != 'ArrowUp' && e.key != 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      stepDistance(e.key == 'ArrowUp' ? 1 : -1);
    });
    [[buttons.up, 1], [buttons.down, -1]].forEach(function(o) {
      o[0].on('click', function() {
        stepDistance(o[1]);
      });
    });
    return input;
  }

  function stepDistance(direction) {
    var d = getScalebarRecord();
    // the frame as the map draws it, so an automatic length starts from the
    // one on the screen
    var data = gui.map.getPreviewFrameData() || getFrameData();
    var label = d && data ? internal.getSteppedScalebarLabel(d, data, direction) : null;
    if (label) update({label: label});
  }

  // A number field with a stepper. Blank means the style's default, which a
  // step starts from. Steps don't go below one step.
  function makeSteppedNumberInput(cell, field, className, opts) {
    var box = El('div').addClass('size-field scalebar-stepper-field').appendTo(cell);
    var input = makeNumberInput(box, field, className + ' size-field-input');
    var buttons = appendSizeFieldStepper(box);
    input.on('keydown', function(e) {
      var action = getSizeFieldKeyAction(e.key, e.shiftKey, opts);
      if (!action || action.type != 'step') return;
      e.preventDefault();
      e.stopPropagation();
      step(action.delta);
    });
    buttons.up.on('click', function() { step(opts.step); });
    buttons.down.on('click', function() { step(-opts.step); });
    return input;

    function step(delta) {
      var d = getScalebarRecord();
      var val = parseSizeValue(input.node().value, NaN, NaN, 2);
      var o = {};
      if (!d) return;
      if (val === null) val = internal.getScalebarOpts(d)[field];
      o[field] = parseSizeValue(val + delta, opts.step, NaN, 2);
      update(o);
    }
  }

  function makeNumberInput(cell, field, className) {
    var input = makeInput(cell, className).attr('placeholder', 'auto');
    input.on('change', function() {
      var str = input.node().value.trim();
      var val = str === '' ? '' : parseSizeValue(str, NaN, NaN, 2);
      var o = {};
      if (val === null || val < 0) {
        updateControls();
        return;
      }
      o[field] = val;
      update(o);
    });
    return input;
  }

  function getFrameProblem() {
    var data = getFrameData();
    if (!data) return 'there is no map frame';
    return internal.getFurnitureFrameProblem(data) ||
      internal.getScalebarScaleProblem(data);
  }

  function getFrameData() {
    var frame = gui.model.getActiveFrame();
    var crs;
    if (!frame) return null;
    crs = frame.layer.gui && frame.layer.gui.dynamic_crs ||
      internal.getDatasetCRS(frame.dataset);
    return internal.getFrameLayerData(frame.layer, frame.dataset.arcs, crs);
  }

  function getScalebarRecord() {
    var frame = gui.model.getActiveFrame();
    var lyr = frame && internal.findFrameFurnitureLayer(frame.dataset, 'scalebar');
    return lyr ? lyr.data.getReadOnlyRecordAt(0) : null;
  }

  function runCommand(cmd, title, done) {
    runGuiEditCommand(gui, cmd, {
      title: title,
      onSuccess: done,
      onError: updateControls
    });
  }
}

// Makes the popup title a drag handle. Coordinates live only on @box, which is
// removed when the popup closes, so every opening starts from placePanel().
function makePanelDraggable(box) {
  var handle = box.querySelector('.alert-title');
  var dragging = false;
  var startX, startY, startLeft, startTop, width, height;
  if (!handle) return function() {};
  handle.addEventListener('pointerdown', onDown);

  function onDown(e) {
    var rect;
    if (e.button !== 0) return;
    rect = box.getBoundingClientRect();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    width = rect.width;
    height = rect.height;
    box.style.left = Math.round(startLeft) + 'px';
    box.style.right = 'auto';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    e.preventDefault();
    e.stopPropagation();
  }

  function onMove(e) {
    var left, top;
    if (!dragging) return;
    left = startLeft + e.clientX - startX;
    top = startTop + e.clientY - startY;
    left = Math.max(0, Math.min(window.innerWidth - width, left));
    top = Math.max(0, Math.min(window.innerHeight - height, top));
    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
    e.preventDefault();
  }

  function onUp() {
    dragging = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  }

  return function() {
    onUp();
    handle.removeEventListener('pointerdown', onDown);
  };
}

function makeRow(parent, className) {
  return El('div').addClass('label-style-row scalebar-row')
    .addClass(className || 'scalebar-two-col').appendTo(parent);
}

// @tagName 'label' by default; a field with buttons beside it uses a div, so
// that a click that misses a button doesn't put the caret in the field
function makeCell(row, label, tagName) {
  var cell = El(tagName || 'label').addClass('frame-input-cell').appendTo(row);
  El('span').appendTo(cell).text(label);
  return cell;
}

function makeInput(parent, className) {
  return El('input').attr('type', 'text').addClass(className).appendTo(parent);
}

function makeSelect(parent, className, options) {
  var select = El('select').addClass(className).appendTo(parent);
  appendSelectOptions(select, options);
  return select;
}

function appendSelectOptions(select, options) {
  options.forEach(function(o) {
    El('option').attr('value', o[0]).appendTo(select).text(o[1]);
  });
}

// Shows a value that came from the command line even if the menu lacks it
function setSelectValue(select, value) {
  var node = select.node();
  var found = Array.prototype.some.call(node.options, function(o) {
    return o.value == value;
  });
  if (!found) {
    El('option').attr('value', value).appendTo(select).text(value);
  }
  node.value = value;
}

// The number of a single-distance label, e.g. "100" from "100 km", so the
// units menu can apply to it
function getBareDistance(label) {
  var match = /^([\d\s.,/]*\d)\s*[^\d\s.,/]+$/.exec(String(label || '').trim());
  return match ? match[1].trim() : '';
}

// Leaving dual units keeps the distance in the chosen units, if the label has
// one, as a bare number in those units. A lower-case label stays lower case
// when its units are dropped.
function getSingleUnitChanges(d, unitsValue) {
  var changes = {units: unitsValue, dual_units: false};
  var parts = internal.splitScalebarLabel(d.label || '');
  var metric = unitsValue == 'km' || unitsValue == 'meters';
  var label = parts.find(function(str) {
    var units = internal.parseScalebarUnits(str);
    return units && (units == 'km' || units == 'm') == metric;
  }) || parts[0] || '';
  var bare = getBareDistance(label);
  if (bare || label != (d.label || '')) changes.label = bare || label;
  if (bare && !d.label_case && internal.getScalebarLabelCase(d) == 'lower') {
    changes.label_case = 'lower';
  }
  return changes;
}

// Menu items show the units in each case
function getLabelCaseOptions(unitsValue) {
  var name = unitsValue == 'dual' ? 'miles/km' : unitsValue;
  return [['upper', name.toUpperCase()], ['lower', name.toLowerCase()]];
}

function isDualUnit(d) {
  return !!d.dual_units || internal.splitScalebarLabel(d.label || '').length > 1;
}

function getUnitsMenuValue(units) {
  var parsed = internal.parseLabelUnits(units);
  return parsed == 'mile' || !parsed ? 'miles' :
    parsed == 'm' ? 'meters' :
    parsed == 'ft' ? 'feet' : 'km';
}

// Older scale bars use "top" and "bottom". For style a, these mean left
// aligned; for style b, horizontal alignment is not supported.
function getLabelPositionMenuValue(position, style) {
  var pos = String(position || 'top');
  var vertical = pos.includes('bottom') ? 'bottom' : 'top';
  var horizontal;
  if (style != 'a') return vertical;
  horizontal = pos.includes('center') ? 'center' :
    pos.includes('right') ? 'right' : 'left';
  return vertical + '-' + horizontal;
}

function formatValue(val) {
  return val === undefined || val === null ? '' : String(val);
}
