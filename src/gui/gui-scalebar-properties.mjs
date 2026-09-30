import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { showPopupAlert } from './gui-alert';
import { makePanelSection, makeColorField, makePanelActionButton } from './gui-panel-controls';
import { ColorPicker, isHexColor } from './gui-color-picker';
import { getScalebarCommand } from './gui-scalebar-command';
import { getDefaultFontName, getFontStyleVariants, getInstalledFonts,
  getNearestFontStyleVariant, variantIsRegular } from './gui-label-fonts';

var positionOptions = [
  ['top-left', 'Top left'],
  ['top-right', 'Top right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-right', 'Bottom right']
];

// What the scalebar is drawn in when it has no color of its own
var defaultColor = '#000000';

// Settings of the frame's scalebar. Every edit sends a complete -scalebar
// command, which replaces the scalebar, so edits are undoable and replayable
// like any other command.
export function ScalebarProperties(gui) {
  var popup, form, note;
  var labelInput, unitsSelect, styleSelect, dualUnitsBox, positionSelect,
    labelPositionSelect, fontSizeInput, barWidthInput, marginInput,
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
    var frame = frameTarget || internal.getActiveFrame(gui.model);
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

  // The map stays live, so the panel is placed where it is least likely to
  // hide the scalebar: at the top of the map, on the side away from it
  function showPanel() {
    var d = getScalebarRecord();
    if (!d) return;
    closePanel();
    popup = showPopupAlert('', 'Scale bar', {
      non_blocking: true,
      classname: 'scalebar-properties-box'
    });
    popup.onClose(function() {
      popup = form = null;
    });
    popup.container().addClass('scalebar-properties-popup');
    form = El('div')
      .addClass('label-style-panel scalebar-properties-form')
      .appendTo(popup.container());
    initForm();
    updateControls();
    placePanel(/right/.test(d.position || '') ? 'left' : 'right');
  }

  function closePanel() {
    if (popup) popup.close();
  }

  function placePanel(side) {
    var box = popup.container().node().parentNode;
    var map = gui.container.findChild('.map-layers').node().getBoundingClientRect();
    // clears the zoom buttons on the right edge of the map
    var rightInset = 58;
    var leftInset = 16;
    box.style.position = 'absolute';
    box.style.marginTop = '0';
    box.style.top = Math.round(map.top + 12) + 'px';
    if (side == 'left') {
      box.style.left = Math.round(map.left + leftInset) + 'px';
    } else {
      box.style.right = Math.round(window.innerWidth - map.right + rightInset) + 'px';
    }
  }

  function initForm() {
    var row;
    note = El('div').addClass('scalebar-properties-note').appendTo(form).hide();

    row = makeRow(form);
    labelInput = makeInput(makeCell(row, 'Distance'), 'scalebar-label-input')
      .attr('placeholder', 'Automatic')
      .on('change', function() {
        update({label: labelInput.node().value.trim()});
      });
    unitsSelect = makeSelect(makeCell(row, 'Units'), 'scalebar-units-select',
      [['miles', 'Miles'], ['km', 'Kilometers']])
      .on('change', function() {
        var changes = {units: unitsSelect.node().value};
        var bare = getBareDistance(getScalebarRecord().label);
        if (bare) changes.label = bare;
        update(changes);
      });

    row = makeRow(form);
    styleSelect = makeSelect(makeCell(row, 'Style'), 'scalebar-style-select',
      [['a', 'Bar'], ['b', 'Ticks']])
      .on('change', function() {
        update({style: styleSelect.node().value});
      });
    dualUnitsBox = makeCheckbox(row, 'Metric + imperial', 'scalebar-dual-units')
      .on('change', function() {
        update({dual_units: dualUnitsBox.node().checked});
      });

    row = makeRow(form);
    positionSelect = makeSelect(makeCell(row, 'Position'), 'scalebar-position-select',
      positionOptions)
      .on('change', function() {
        update({position: positionSelect.node().value});
      });
    labelPositionSelect = makeSelect(makeCell(row, 'Labels'),
      'scalebar-label-position-select', [['top', 'Above'], ['bottom', 'Below']])
      .on('change', function() {
        update({label_position: labelPositionSelect.node().value});
      });

    var appearance = makePanelSection(form, 'Appearance');

    // Font and face menus, as in the label panel
    row = makeRow(appearance);
    fontSelect = El('select').attr('aria-label', 'Font').addClass('scalebar-font-select')
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
        if (!color) {
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
    fontSizeInput = makeNumberInput(makeCell(row, 'Font size'), 'font_size',
      'scalebar-font-size');

    row = makeRow(appearance);
    barWidthInput = makeNumberInput(makeCell(row, 'Bar width'), 'bar_width',
      'scalebar-bar-width');
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
    var problem;
    if (!d || !form) return;
    labelInput.node().value = d.label || '';
    setSelectValue(unitsSelect, getUnitsMenuValue(d.units ||
      internal.parseScalebarUnits(d.label || '')));
    setSelectValue(styleSelect, d.style == 'b' || d.style == 'B' ||
      !d.style && d.dual_units ? 'b' : 'a');
    dualUnitsBox.node().checked = !!d.dual_units;
    setSelectValue(positionSelect, d.position || 'top-left');
    setSelectValue(labelPositionSelect, d.label_position || 'top');
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
    getInstalledFonts().forEach(function(group) {
      var optgroup = El('optgroup').attr('label', group.name).appendTo(fontSelect);
      group.fonts.forEach(function(fontName) {
        El('option').attr('value', fontName).appendTo(optgroup).text(fontName);
      });
    });
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
    if (changes.style == 'a') d.dual_units = false;
    if (changes.dual_units) d.style = 'b';
    if (!d.units) d.units = unitsSelect.node().value;
    runCommand(getScalebarCommand(d), 'Update scale bar', updateControls);
  }

  function makeNumberInput(cell, field, className) {
    var input = makeInput(cell, className).attr('placeholder', 'auto');
    input.on('change', function() {
      var str = input.node().value.trim();
      var o = {};
      if (str !== '' && !(Number(str) >= 0)) {
        updateControls();
        return;
      }
      o[field] = str === '' ? '' : Number(str);
      update(o);
    });
    return input;
  }

  function getFrameProblem() {
    var frame = internal.getActiveFrame(gui.model);
    var crs, data;
    if (!frame) return 'there is no map frame';
    crs = frame.layer.gui && frame.layer.gui.dynamic_crs ||
      internal.getDatasetCRS(frame.dataset);
    data = internal.getFrameLayerData(frame.layer, frame.dataset.arcs, crs);
    return internal.getFurnitureFrameProblem(data);
  }

  function getScalebarRecord() {
    var frame = internal.getActiveFrame(gui.model);
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

function makeRow(parent, className) {
  return El('div').addClass('label-style-row scalebar-row')
    .addClass(className || 'scalebar-two-col').appendTo(parent);
}

function makeCell(row, label) {
  var cell = El('label').addClass('frame-input-cell').appendTo(row);
  El('span').appendTo(cell).text(label);
  return cell;
}

function makeInput(parent, className) {
  return El('input').attr('type', 'text').addClass(className).appendTo(parent);
}

function makeSelect(parent, className, options) {
  var select = El('select').addClass(className).appendTo(parent);
  options.forEach(function(o) {
    El('option').attr('value', o[0]).appendTo(select).text(o[1]);
  });
  return select;
}

function makeCheckbox(parent, label, className) {
  var box = El('input').attr('type', 'checkbox').addClass(className);
  var wrapper = El('label').addClass('scalebar-checkbox').appendTo(parent);
  box.appendTo(wrapper);
  El('span').appendTo(wrapper).text(label);
  return box;
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

function getUnitsMenuValue(units) {
  var parsed = internal.parseLabelUnits(units);
  return parsed == 'mile' || !parsed ? 'miles' :
    parsed == 'm' ? 'meters' :
    parsed == 'ft' ? 'feet' : 'km';
}

function formatValue(val) {
  return val === undefined || val === null ? '' : String(val);
}
