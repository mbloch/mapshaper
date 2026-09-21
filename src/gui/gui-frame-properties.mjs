import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import { showPopupAlert } from './gui-alert';
import { makeColorRow, makePanelSection } from './gui-panel-controls';
import {
  getFrameAspectPreset,
  makeFrameAspectSelect,
  parseFrameAspectRatio
} from './gui-frame-aspect';

export function FrameProperties(gui) {
  var target, form, nameInput, widthInput, heightInput, unitsSelect;
  var aspectSelect, customAspectRow, customAspectInput;
  var backgroundControl, neatlineControl, neatlineWidthInput;
  var boundsValue, crsValue, resolutionValue;

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
    nameInput = makeTextInput(makeFieldRow(form, 'Name'))
      .on('change', renameFrame);

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

    var aspectRow = makeFieldRow(form, 'Aspect');
    aspectSelect = makeFrameAspectSelect(aspectRow).on('change', updateAspect);
    customAspectRow = makeFieldRow(form, 'Custom ratio').addClass('hidden');
    customAspectInput = makeTextInput(customAspectRow)
      .attr('placeholder', 'e.g. 5:4')
      .on('change', updateCustomAspect);

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
    neatlineWidthInput = makeTextInput(makeFieldRow(appearance, 'Line width'))
      .addClass('frame-neatline-width')
      .on('change', updateNeatlineWidth);
    var clearRow = El('div')
      .addClass('label-style-row label-panel-button-row')
      .appendTo(appearance);
    makeActionButton(clearRow, 'Clear appearance', clearFrameStyle);

    var details = makePanelSection(form, 'Details');
    boundsValue = makeReadOnlyRow(details, 'Bounds');
    crsValue = makeReadOnlyRow(details, 'CRS');
    resolutionValue = makeReadOnlyRow(details, 'Ground resolution');
  }

  function updateControls() {
    if (!target || !internal.isFrameLayer(target.layer, target.dataset.arcs)) return;
    var frame = internal.getFrameLayerData(target.layer, target.dataset.arcs);
    var rec = target.layer.data.getReadOnlyRecordAt(0);
    var units = frame.units || 'px';
    var factor = getUnitFactor(units);
    var preset = getFrameAspectPreset(frame.aspect_ratio);
    var info = internal.getLayerInfo(target.layer, target.dataset);
    nameInput.node().value = target.layer.name || '';
    widthInput.node().value = formatNumber(frame.width / factor);
    heightInput.node().value = formatNumber(frame.height / factor);
    unitsSelect.node().value = units;
    aspectSelect.node().value = preset;
    customAspectRow.classed('hidden', preset != 'custom');
    customAspectInput.node().value =
      preset == 'custom' ? formatNumber(frame.aspect_ratio) : '';
    backgroundControl.setColor(rec.fill || '');
    backgroundControl.opacity.node().value = formatOpacity(rec['fill-opacity']);
    neatlineControl.setColor(rec.stroke || '');
    neatlineControl.opacity.node().value = formatOpacity(rec['stroke-opacity']);
    neatlineWidthInput.node().value =
      rec['stroke-width'] === undefined ? '' : rec['stroke-width'];
    boundsValue.text(frame.bbox.map(formatCoordinate).join(', '));
    crsValue.text(info.proj4 || '[unknown]');
    resolutionValue.text(getResolutionText(frame, target.dataset));
  }

  function renameFrame() {
    var name = nameInput.node().value.trim();
    if (!name || name == target.layer.name) {
      updateControls();
      return;
    }
    runCommand(
      '-rename-layers ' + quoteCommandValue(name) + ' ' + getTargetOption(),
      'Rename frame'
    );
  }

  function updateWidth() {
    updateDimension('width', widthInput);
  }

  function updateHeight() {
    updateDimension('height', heightInput);
  }

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

  function updateAspect() {
    var value = aspectSelect.node().value;
    if (value == 'custom') {
      customAspectRow.removeClass('hidden');
      customAspectInput.node().focus();
      return;
    }
    customAspectRow.addClass('hidden');
    runCommand(
      '-update-frame ' +
      (value == 'auto' ? 'auto-aspect' : 'aspect-ratio=' + value) +
      ' ' + getTargetOption(),
      'Update frame aspect ratio'
    );
  }

  function updateCustomAspect() {
    var value = parseFrameAspectRatio(customAspectInput.node().value);
    if (!(value > 0)) {
      updateControls();
      return;
    }
    runCommand(
      '-update-frame aspect-ratio=' + value + ' ' + getTargetOption(),
      'Update frame aspect ratio'
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

function makeFieldRow(parent, label) {
  var row = El('label').addClass('label-style-row frame-field-row').appendTo(parent);
  El('span').appendTo(row).text(label);
  return row;
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

function getResolutionText(frame, dataset) {
  var crs = internal.getDatasetCRS(dataset);
  var value;
  if (!crs) return 'unavailable';
  try {
    value = internal.getMapFrameMetersPerPixel(
      Object.assign({}, frame, {crs: crs})
    );
  } catch (e) {
    value = NaN;
  }
  if (!(value > 0) || !Number.isFinite(value)) return 'unavailable';
  if (value >= 1000) return formatNumber(value / 1000) + ' km/px';
  if (value >= 1) return formatNumber(value) + ' m/px';
  return formatNumber(value * 100) + ' cm/px';
}
