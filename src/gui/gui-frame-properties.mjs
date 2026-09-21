import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import { showPopupAlert } from './gui-alert';
import { makeColorRow, makePanelSection } from './gui-panel-controls';
import { formatFrameAspectRatio } from './gui-frame-aspect';

export function FrameProperties(gui) {
  var target, form, widthInput, heightInput, unitsSelect, aspectValue;
  var backgroundControl, neatlineControl, neatlineWidthInput;
  var boundsValue, crsValue;

  gui.frameProperties = this;

  this.open = function(targetArg) {
    target = targetArg || internal.getActiveFrame(gui.model);
    if (!target) return;
    var popup = showPopupAlert('', 'Frame properties');
    popup.container().addClass('frame-properties-popup');
    form = El('div')
      .addClass('label-style-panel frame-properties-form')
      .appendTo(popup.container());
    initForm();
    updateControls();
  };

  function initForm() {
    // Width and height are two ways of writing one thing: either one rescales
    // the frame and the other follows, because the frame's extent is not what
    // this panel changes. Shown side by side so that they read as a pair.
    var sizeRow = El('div').addClass('label-style-row frame-size-row').appendTo(form);
    widthInput = makeLabeledInput(sizeRow, 'Width')
      .addClass('frame-width-input').on('change', updateWidth);
    heightInput = makeLabeledInput(sizeRow, 'Height')
      .addClass('frame-height-input').on('change', updateHeight);
    unitsSelect = El('select').addClass('frame-units-select').appendTo(sizeRow)
      .on('change', updateUnits);
    ['px', 'pt', 'in', 'cm'].forEach(function(unit) {
      El('option').attr('value', unit).appendTo(unitsSelect).text(unit);
    });

    // Read-only: setting a ratio reshapes the frame's extent, which is what the
    // resize tool is for. What is worth saying here is whether the ratio is
    // fixed or follows the extent, since that is what decides how the pair
    // above behaves.
    aspectValue = makeReadOnlyRow(form, 'Aspect ratio');

    var appearance = makePanelSection(form, 'Appearance');
    backgroundControl = makeColorRow(appearance, {
      label: 'Background',
      onColor: function(color) {
        if (color) applyFrameStyle([['fill', color]]);
      },
      onOpacity: function(value) {
        applyFrameStyle([['fill-opacity', value]]);
      },
      revert: updateControls
    });
    neatlineControl = makeColorRow(appearance, {
      label: 'Neatline',
      onColor: function(color) {
        if (!color) return;
        var styles = [['stroke', color]];
        if (!getStyleValue('stroke-width')) styles.push(['stroke-width', 1]);
        applyFrameStyle(styles);
      },
      onOpacity: function(value) {
        applyFrameStyle([['stroke-opacity', value]]);
      },
      revert: updateControls
    });
    neatlineWidthInput = makeSplitRowField(appearance, 'Line width')
      .addClass('frame-neatline-width')
      .on('change', updateNeatlineWidth);
    var clearRow = El('div')
      .addClass('label-style-row label-panel-button-row')
      .appendTo(appearance);
    makeActionButton(clearRow, 'Clear appearance', clearFrameStyle);

    var details = makePanelSection(form, 'Details');
    boundsValue = makeReadOnlyRow(details, 'Bounds');
    crsValue = makeReadOnlyRow(details, 'CRS');
  }

  function updateControls() {
    if (!target || !internal.isFrameLayer(target.layer, target.dataset.arcs)) return;
    var frame = internal.getFrameLayerData(target.layer, target.dataset.arcs);
    var rec = target.layer.data.getReadOnlyRecordAt(0);
    var units = frame.units || 'px';
    var factor = getUnitFactor(units);
    var info = internal.getLayerInfo(target.layer, target.dataset);
    widthInput.node().value = formatNumber(frame.width / factor);
    heightInput.node().value = formatNumber(frame.height / factor);
    unitsSelect.node().value = units;
    aspectValue.text(getAspectText(frame));
    backgroundControl.setColor(rec.fill || '');
    backgroundControl.opacity.node().value = formatOpacity(rec['fill-opacity']);
    neatlineControl.setColor(rec.stroke || '');
    neatlineControl.opacity.node().value = formatOpacity(rec['stroke-opacity']);
    neatlineWidthInput.node().value =
      rec['stroke-width'] === undefined ? '' : rec['stroke-width'];
    boundsValue.text(frame.bbox.map(formatCoordinate).join(', '));
    crsValue.text(info.proj4 || '[unknown]');
  }

  function updateWidth() {
    updateDimension('width', widthInput);
  }

  function updateHeight() {
    updateDimension('height', heightInput);
  }

  // One dimension per command, never both: -update-frame takes a lone width= or
  // height= as a rescale and derives the other from the extent, but takes the
  // two together as a new page shape and stretches the extent to fit it.
  function updateDimension(name, input) {
    var value = Number(input.node().value);
    if (!(value > 0)) {
      updateControls();
      return;
    }
    runCommand(
      '-update-frame ' + name + '=' +
      quoteCommandValue(value + unitsSelect.node().value) + ' ' +
      getTargetOption(),
      'Update frame size'
    );
  }

  function updateUnits() {
    var frame = internal.getFrameLayerData(target.layer, target.dataset.arcs);
    var value = frame.width / getUnitFactor(unitsSelect.node().value);
    runCommand(
      '-update-frame width=' +
      quoteCommandValue(formatNumber(value) + unitsSelect.node().value) + ' ' +
      getTargetOption(),
      'Update frame units'
    );
  }

  function updateNeatlineWidth() {
    var value = Number(neatlineWidthInput.node().value);
    if (!(value >= 0)) {
      updateControls();
      return;
    }
    var styles = [['stroke-width', value]];
    if (value > 0 && !getStyleValue('stroke')) {
      styles.push(['stroke', '#000000']);
    }
    applyFrameStyle(styles);
  }

  function getStyleValue(field) {
    var rec = target.layer.data.getReadOnlyRecordAt(0);
    return rec && rec[field];
  }

  function applyFrameStyle(styles) {
    var parts = ['-style'];
    styles.forEach(function(item) {
      parts.push(item[0] + '=' + quoteCommandValue(item[1]));
    });
    parts.push(getTargetOption());
    runCommand(parts.join(' '), 'Style map frame');
  }

  function clearFrameStyle() {
    runCommand('-style clear ' + getTargetOption(), 'Clear frame appearance');
  }

  function getTargetOption() {
    return 'target=' +
      internal.formatOptionValue(internal.getLayerTargetId(gui.model, target.layer));
  }

  function runCommand(cmd, title) {
    runGuiEditCommand(gui, cmd, {
      title: title,
      onDone: updateControls
    });
  }
}

// A field in the narrow right-hand column of a split row, so that it lines up
// with, and is the same width as, the Opacity above it. The left cell is left
// empty: the control belongs to the colour row above, and the column is what
// says so.
function makeSplitRowField(parent, label) {
  var row = El('div').addClass('label-style-row label-split-row').appendTo(parent);
  El('div').addClass('label-split-cell').appendTo(row);
  var cell = El('div').addClass('label-split-cell').appendTo(row);
  El('span').appendTo(cell).text(label);
  return makeTextInput(cell);
}

function makeTextInput(parent) {
  return El('input').attr('type', 'text').appendTo(parent);
}

function makeLabeledInput(parent, label) {
  var cell = El('label').addClass('frame-input-cell').appendTo(parent);
  El('span').appendTo(cell).text(label);
  return makeTextInput(cell);
}

function makeActionButton(parent, label, action) {
  return El('div').addClass('label-panel-action-btn')
    .attr('role', 'button').appendTo(parent).text(label).on('click', action);
}

function makeReadOnlyRow(parent, label) {
  var row = El('div').addClass('frame-property-detail-row').appendTo(parent);
  El('span').appendTo(row).text(label);
  return El('span').addClass('frame-property-detail-value').appendTo(row);
}

function getUnitFactor(units) {
  return units == 'in' ? 72 : units == 'cm' ? 28.3465 : 1;
}

function formatNumber(value) {
  return String(Math.round(value * 100) / 100);
}

function formatCoordinate(value) {
  return String(Number(value.toPrecision(12)));
}

function formatOpacity(value) {
  return value === undefined ? '' :
    String(Math.round(Number(value) * 100)) + '%';
}

// A fixed ratio holds when the frame is rescaled; one taken from the extent
// changes whenever the extent does. That difference is the reason to show the
// ratio at all, so it is said rather than implied.
function getAspectText(frame) {
  if (frame.aspect_ratio > 0) {
    return formatFrameAspectRatio(frame.aspect_ratio) + ' (fixed)';
  }
  var bbox = frame.bbox;
  var ratio = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 'unavailable';
  return formatFrameAspectRatio(ratio) + ' (from extent)';
}
