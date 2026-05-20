import { ColorPicker, isHexColor, layerColorPresetRows } from './gui-color-picker';
import { El } from './gui-el';
import { ClickText2 } from './gui-elements';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';

var defaultCircleRadius = 0;
var defaultCreatedCircleRadius = 3;
var defaultCircleFill = '#000000';

export function PointStyleTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel point-style-panel rollover').appendTo(parent).hide();
  var title, noteSection, labelsSection, circlesSection, symbolsSection, labelNoteSection;
  var circleSectionLabel;
  var symbolNote;
  var createFieldSelect, createExprInput, createCopyCheckbox, createLabelsBtn;
  var editingRow, editingStatus, clearLink;
  var createCirclesRow;
  var circleControlRows = [];
  var circleRadiusClickText, circleFillControl, circleStrokeControl;
  var circleFillOpacityInput, circleStrokeOpacityInput, circleStrokeWidthClickText;
  var targetLayer = null;
  var hit = null;

  initPanel();

  this.open = function(lyr, dataset) {
    if (!layerCanBeStyled(lyr)) return;
    if (!gui.map.isActiveLayer(lyr)) {
      modelSelectLayer(lyr, dataset);
    }
    gui.interaction.setMode('point_style');
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

  hit = gui.map.getHitControl && gui.map.getHitControl();
  if (hit) {
    hit.on('change', function(e) {
      if (e.mode == 'point_style') {
        updateControls();
      }
    });
  }

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    title = El('span').appendTo(header).text('Point symbols');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', closePanel);

    initNoteSections();
    initCreateLabelsSection();
    initCreateCirclesSection();
    initSymbolsSection();
  }

  function initNoteSections() {
    noteSection = El('div').addClass('point-style-section point-style-note-section').appendTo(panel);
    El('div').addClass('point-style-note').appendTo(noteSection).text('This layer contains unstyled points.');

    labelNoteSection = El('div').addClass('point-style-section point-label-note-section').appendTo(panel);
    El('div').addClass('point-style-note').appendTo(labelNoteSection)
      .text('This layer is rendered as labels. Use the label style tool to edit label styles.');
  }

  function initCreateLabelsSection() {
    labelsSection = El('div').addClass('point-style-section').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(labelsSection).text('Labels');

    var fieldRow = El('label').addClass('label-style-row').appendTo(labelsSection);
    El('span').appendTo(fieldRow).text('Label field');
    createFieldSelect = El('select').appendTo(fieldRow).on('change', function() {
      var field = createFieldSelect.node().value;
      if (field) {
        createExprInput.node().value = getFieldExpression(field);
      }
      updateCreateLabelsButton();
    });

    var exprRow = El('label').addClass('label-style-row label-create-expression-row').appendTo(labelsSection);
    El('span').appendTo(exprRow).text('or expression');
    createExprInput = El('input')
      .attr('type', 'text')
      .appendTo(exprRow)
      .on('input', updateCreateLabelsButton)
      .on('change', updateCreateLabelsButton);

    var btnRow = El('div').addClass('label-style-row point-create-labels-row').appendTo(labelsSection);
    createLabelsBtn = El('button').appendTo(btnRow).text('Create').on('click', createLabels);
    var copyLabel = El('label').addClass('point-create-copy-label').appendTo(btnRow);
    createCopyCheckbox = El('input').attr('type', 'checkbox').appendTo(copyLabel);
    El('span').appendTo(copyLabel).text('as new layer');
  }

  function initCreateCirclesSection() {
    circlesSection = El('div').addClass('point-style-section point-circle-section').appendTo(panel);
    circleSectionLabel = El('div').addClass('label-style-row-label').appendTo(circlesSection).text('Circles');
    El('div').addClass('point-style-note point-circle-note').appendTo(circlesSection)
      .text('Use the -style command in the console to create proportional circles.');

    createCirclesRow = El('div').addClass('label-style-row point-create-circles-row').appendTo(circlesSection);
    El('button').appendTo(createCirclesRow).text('Create').on('click', createSimpleCircles);
    El('span').appendTo(createCirclesRow).text('simple circles');

    editingRow = El('div').addClass('label-style-row label-style-selection-row point-style-selection-row').appendTo(circlesSection);
    editingStatus = El('span').addClass('label-editing-status').appendTo(editingRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(editingRow).text('deselect').on('click', clearSelection);

    var fillRow = El('div').addClass('label-style-row point-symbol-row').appendTo(circlesSection);
    circleFillControl = addCircleColorControl(fillRow, 'Fill');
    circleFillOpacityInput = addCircleNumberControl(fillRow, 'Opacity', '100%');
    circleControlRows.push(fillRow);

    var strokeRow = El('div').addClass('label-style-row point-symbol-row').appendTo(circlesSection);
    circleStrokeControl = addCircleColorControl(strokeRow, 'Stroke');
    circleStrokeOpacityInput = addCircleNumberControl(strokeRow, 'Opacity', '100%');
    circleControlRows.push(strokeRow);

    var sizeRow = El('div').addClass('label-style-row point-symbol-size-row').appendTo(circlesSection);
    addCircleStepperControl(sizeRow, 'Stroke width', function() {
      return getCircleStrokeWidth();
    }, function(direction) {
      setCircleStrokeWidth(getNextStrokeWidth(getCircleStrokeWidth(), direction));
      applyCircleStyles();
    }, function(value) {
      setCircleStrokeWidth(value);
      applyCircleStyles();
    }, function(clickText) {
      circleStrokeWidthClickText = clickText;
    });

    addCircleStepperControl(sizeRow, 'Radius', function() {
      return getCircleRadiusForNudge();
    }, function(direction) {
      setCircleRadius(getNextCircleRadius(getCircleRadiusForNudge(), direction));
      applyCircleStyles();
    }, function(value) {
      setCircleRadius(value);
      applyCircleStyles();
    }, function(clickText, text) {
      circleRadiusClickText = clickText;
      text.addClass('label-icon-size-value');
    });
    circleControlRows.push(sizeRow);
  }

  function initSymbolsSection() {
    symbolsSection = El('div').addClass('point-style-section point-symbol-info-section').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(symbolsSection).text('Symbols');
    symbolNote = El('div').addClass('point-style-note').appendTo(symbolsSection)
      .text('Use the -symbols command in the console to create arrows and other symbols.');
  }

  function addCircleColorControl(row, label) {
    var colorCell = El('div').addClass('point-symbol-color-cell label-color-row').appendTo(row);
    var control = {};
    El('span').appendTo(colorCell).text(label);
    control.chit = makePanelButton(colorCell, '', function() {
      control.picker.toggle();
    }).addClass('label-color-chit');
    control.input = El('input').attr('type', 'text').appendTo(colorCell).on('change', function() {
      var color = control.input.node().value.trim();
      if (isHexColor(color)) {
        control.picker.setColor(color);
      }
      applyCircleStyles();
    });
    control.picker = new ColorPicker(colorCell, {
      presetRows: layerColorPresetRows,
      onPreview: function(hex) {
        setCircleColor(control, hex);
      },
      onChange: function(hex) {
        setCircleColor(control, hex);
        applyCircleStyles();
      }
    });
    setCircleColor(control, '');
    return control;
  }

  function addCircleStepperControl(row, label, getValue, nudgeValue, setValue, capture) {
    var control;
    var buttonRow;
    var text;
    var clickText;
    control = El('div').addClass('point-symbol-stepper-control').appendTo(row);
    El('span').appendTo(control).text(label);
    buttonRow = El('div').addClass('layer-stepper-control').appendTo(control);
    makePanelButton(buttonRow, '−', function() {
      nudgeValue(-1);
    });
    text = El('span').addClass('layer-stroke-width-value').appendTo(buttonRow);
    clickText = new ClickText2(text);
    clickText.on('change', function() {
      var value = parsePositiveNumber(clickText.value());
      if (value === null) {
        clickText.value(formatNumberValue(getValue()));
        return;
      }
      setValue(value);
    });
    makePanelButton(buttonRow, '+', function() {
      nudgeValue(1);
    });
    capture(clickText, text);
  }

  function addCircleNumberControl(row, label, value) {
    var control = El('label').addClass('layer-number-control').appendTo(row);
    var input;
    El('span').appendTo(control).text(label);
    input = El('input').attr('type', 'text').appendTo(control).on('change', applyCircleStyles);
    input.node().value = value;
    return input;
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

  function turnOn() {
    targetLayer = getActiveLayer();
    if (getPointRepresentation() == 'label' && gui.labelTool && gui.labelTool.open) {
      gui.labelTool.open(targetLayer);
      targetLayer = null;
      return;
    }
    renderCreateFields();
    updateControls();
    panel.show();
  }

  function turnOff() {
    panel.hide();
    circleFillControl.picker.hide();
    circleStrokeControl.picker.hide();
    targetLayer = null;
  }

  function closePanel() {
    turnOff();
    if (gui.interaction.getMode() == 'point_style') {
      gui.interaction.turnOff();
    }
  }

  function updateControls() {
    syncTargetLayer();
    var representation = getPointRepresentation();
    updateCreateLabelsButton();
    title.text(representation == 'circle' ? 'Circle styles' : 'Point symbols');
    updateEditingStatus(getSelectionIds().length);
    toggleSection(noteSection, representation == 'unstyled');
    toggleSection(labelsSection, representation == 'unstyled');
    toggleSection(circlesSection, representation == 'unstyled' || representation == 'circle');
    toggleSection(symbolsSection, representation == 'unstyled' || representation == 'svg-symbol');
    toggleSection(labelNoteSection, representation == 'label');
    updateSectionBorders([noteSection, labelNoteSection, labelsSection, circlesSection, symbolsSection]);
    symbolNote.text(representation == 'svg-symbol' ?
      'This layer uses SVG symbols. Use the -symbols command in the console to create arrows and other symbols.' :
      'Use the -symbols command in the console to create arrows and other symbols.');
    updateCircleSection(representation);
    updateCircleControls(representation);
  }

  function toggleSection(section, visible) {
    if (visible) {
      section.show();
    } else {
      section.hide();
    }
  }

  function updateSectionBorders(sections) {
    var foundFirst = false;
    sections.forEach(function(section) {
      var visible = section.visible();
      section.classed('point-style-first-visible', visible && !foundFirst);
      if (visible) foundFirst = true;
    });
  }

  function updateCircleSection(representation) {
    var showCreate = representation == 'unstyled';
    circleSectionLabel.classed('hidden', !showCreate);
    createCirclesRow.classed('hidden', !showCreate);
    editingRow.classed('hidden', representation != 'circle');
    circlesSection.findChild('.point-circle-note').classed('hidden', !showCreate);
    circleControlRows.forEach(function(row) {
      row.classed('hidden', showCreate);
    });
  }

  function updateCircleControls(representation) {
    var radius = getCommonValue('r');
    var fill = getCommonValue('fill');
    var stroke = getCommonValue('stroke');
    var fillOpacity = getCommonValue('fill-opacity');
    var strokeOpacity = getCommonValue('stroke-opacity');
    var strokeWidth = getCommonValue('stroke-width');
    setCircleRadius(radius);
    setCircleColor(circleFillControl, fill);
    setCircleColor(circleStrokeControl, stroke);
    circleFillOpacityInput.node().value = formatOpacityPct(fillOpacity === '' ? 1 : fillOpacity);
    circleStrokeOpacityInput.node().value = formatOpacityPct(strokeOpacity === '' ? 1 : strokeOpacity);
    setCircleStrokeWidth(strokeWidth === '' ? 0 : strokeWidth);
    if (representation != 'circle' && representation != 'unstyled') {
      setCircleRadius(defaultCircleRadius);
      setCircleColor(circleFillControl, '');
      setCircleColor(circleStrokeControl, '');
      circleFillOpacityInput.node().value = '100%';
      circleStrokeOpacityInput.node().value = '100%';
      setCircleStrokeWidth(0);
    }
  }

  function renderCreateFields() {
    var lyr = getActiveLayer();
    var records = lyr && lyr.data ? lyr.data.getRecords() : [];
    var fields = lyr && lyr.data ? lyr.data.getFields().filter(function(field) {
      return internal.getColumnType(field, records) == 'string';
    }) : [];
    var value = createFieldSelect.node().value;
    createFieldSelect.empty();
    El('option').attr('value', '').appendTo(createFieldSelect).text('');
    fields.forEach(function(field) {
      El('option').attr('value', field).appendTo(createFieldSelect).text(field);
    });
    createFieldSelect.node().disabled = fields.length === 0;
    createFieldSelect.node().value = fields.indexOf(value) > -1 ? value : '';
  }

  function updateCreateLabelsButton() {
    createLabelsBtn.node().disabled = createExprInput.node().value.trim() === '';
  }

  function createLabels() {
    var expr = createExprInput.node().value.trim();
    var cmd;
    if (!expr || !gui.console) return;
    cmd = createCopyCheckbox.node().checked ?
      '-filter true + name=labels -style label-text=' + quoteCommandValue(expr) :
      '-style label-text=' + quoteCommandValue(expr);
    runGuiEditCommand(gui, cmd, {
      title: 'Create labels',
      onSuccess: openLabelStyles
    });
  }

  function openLabelStyles() {
    var active = gui.model.getActiveLayer();
    if (active && active.layer && internal.layerHasLabels(active.layer) &&
      gui.labelTool && gui.labelTool.open) {
      gui.labelTool.open(active.layer, active.dataset);
    } else {
      updateControls();
    }
  }

  function createSimpleCircles() {
    runCommand('-style r=' + defaultCreatedCircleRadius +
      ' fill=' + quoteCommandValue(defaultCircleFill) +
      ' fill-opacity=1 stroke-opacity=1 stroke-width=0', 'Create circles');
  }

  function applyCircleStyles() {
    var representation = getPointRepresentation();
    var radius = getCircleRadius();
    var fill = circleFillControl.input.node().value.trim();
    var fillOpacity = parseOpacityValue(circleFillOpacityInput.node().value);
    var stroke = circleStrokeControl.input.node().value.trim();
    var strokeOpacity = parseOpacityValue(circleStrokeOpacityInput.node().value);
    var strokeWidth = getCircleStrokeWidth();
    var args;
    if (!gui.console || !(representation == 'unstyled' || representation == 'circle') ||
      (radius !== null && !(radius >= 0)) || fillOpacity === null || strokeOpacity === null || strokeWidth === null) return;
    if (radius !== null && radius > 0 && !fill && !stroke && styleFieldIsUnset('fill') && styleFieldIsUnset('stroke')) {
      fill = defaultCircleFill;
      setCircleColor(circleFillControl, fill);
    }
    args = [
      'fill-opacity=' + fillOpacity,
      'stroke-opacity=' + strokeOpacity,
      'stroke-width=' + strokeWidth
    ];
    if (radius !== null) args.unshift('r=' + radius);
    if (fill) args.push('fill=' + quoteCommandValue(fill));
    if (stroke) args.push('stroke=' + quoteCommandValue(stroke));
    runStyleCommand(args, 'Create circles');
  }

  function runStyleCommand(args, title) {
    syncTargetLayer();
    var ids = getTargetIds();
    var parts = ['-style'].concat(args);
    if (!targetLayer || ids.length === 0) return;
    addTargetOption(parts);
    if (ids.length < internal.getFeatureCount(targetLayer)) {
      parts.push('ids=' + ids.join(','));
    }
    runCommand(parts.join(' '), title);
  }

  function runCommand(cmd, title) {
    runGuiEditCommand(gui, cmd, {
      title: title,
      onSuccess: updateControls
    });
  }

  function getCircleRadius() {
    var str = String(circleRadiusClickText.value()).trim();
    var radius = Number(str);
    if (str === '') return null;
    return isFinite(radius) && radius >= 0 ? radius : defaultCircleRadius;
  }

  function getCircleRadiusForNudge() {
    var radius = getCircleRadius();
    return radius === null ? getMostCommonNumberValue('r', defaultCircleRadius) : radius;
  }

  function setCircleRadius(value) {
    circleRadiusClickText.value(value === '' ? '' : formatNumberValue(value));
  }

  function getCircleStrokeWidth() {
    var width = Number(circleStrokeWidthClickText.value());
    return isFinite(width) && width >= 0 ? width : 0;
  }

  function setCircleStrokeWidth(value) {
    circleStrokeWidthClickText.value(formatNumberValue(value));
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

  function getNextCircleRadius(value, direction) {
    var baseSteps = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
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

  function getPointRepresentation() {
    var lyr = targetLayer || getActiveLayer();
    var table = lyr && lyr.data;
    if (table && table.fieldExists('svg-symbol')) return 'svg-symbol';
    if (table && table.fieldExists('label-text')) return 'label';
    if (table && table.fieldExists('r')) return 'circle';
    return 'unstyled';
  }

  function getCommonValue(field) {
    var table = targetLayer && targetLayer.data;
    var records = table && table.getRecords();
    var ids = getTargetIds();
    var value, val;
    if (!records || ids.length === 0) return '';
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (i === 0) {
        value = val;
      } else if (val != value) {
        return '';
      }
    }
    return value === undefined || value === null ? '' : value;
  }

  function getMostCommonNumberValue(field, defaultValue) {
    var table = targetLayer && targetLayer.data;
    var records = table && table.getRecords();
    var ids = getTargetIds();
    var counts = {};
    var bestValue = null;
    var bestCount = 0;
    var val, key;
    if (!records || ids.length === 0) return defaultValue;
    for (var i=0; i<ids.length; i++) {
      val = Number(records[ids[i]] && records[ids[i]][field]);
      if (!isFinite(val)) continue;
      key = String(val);
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > bestCount) {
        bestCount = counts[key];
        bestValue = val;
      }
    }
    return bestValue === null ? defaultValue : bestValue;
  }

  function styleFieldIsUnset(field) {
    var table = targetLayer && targetLayer.data;
    var records = table && table.getRecords();
    var ids = getTargetIds();
    var val;
    if (!records || ids.length === 0) return true;
    for (var i=0; i<ids.length; i++) {
      val = records[ids[i]] && records[ids[i]][field];
      if (val !== undefined && val !== null && val !== '') return false;
    }
    return true;
  }

  function addTargetOption(parts) {
    if (getActiveLayer() != targetLayer) {
      parts.push('target=' + internal.formatOptionValue(internal.getLayerTargetId(gui.model, targetLayer)));
    }
  }

  function getSelectionIds() {
    return hit ? hit.getSelectionIds() : [];
  }

  function getTargetIds() {
    var ids = getSelectionIds();
    if (!targetLayer) return [];
    return ids.length > 0 ? ids : getAllFeatureIds(targetLayer);
  }

  function getAllFeatureIds(lyr) {
    var ids = [];
    for (var i=0, n=internal.getFeatureCount(lyr); i<n; i++) {
      ids.push(i);
    }
    return ids;
  }

  function clearSelection() {
    if (hit) hit.clearSelection();
    updateControls();
  }

  function updateEditingStatus(count) {
    editingStatus.text(count > 0 ? 'Editing: ' + count + ' selected' : 'Editing: all');
    clearLink.classed('hidden', count === 0);
  }

  function setCircleColor(control, color) {
    control.input.node().value = color;
    control.chit.css('background-color', isHexColor(color) ? color : 'transparent');
  }

  function parseOpacityValue(str) {
    var pct = Number(String(str).replace('%', '').trim());
    if (!isFinite(pct)) return null;
    return Math.max(0, Math.min(100, pct)) / 100;
  }

  function parsePositiveNumber(str) {
    if (String(str).trim() === '') return null;
    var val = Number(String(str).trim());
    return isFinite(val) && val >= 0 ? val : null;
  }

  function formatOpacityPct(val) {
    val = Number(val);
    return isFinite(val) ? Math.round(Math.max(0, Math.min(1, val)) * 100) + '%' : '';
  }

  function formatNumberValue(val) {
    val = Number(val);
    return isFinite(val) ? String(val) : '';
  }

  function getFieldExpression(field) {
    return 'd[' + JSON.stringify(field) + ']';
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

  function modelSelectLayer(lyr, dataset) {
    if (lyr) lyr.hidden = false;
    gui.model.selectLayer(lyr, dataset);
  }

  function modeMatchesActiveLayer(mode) {
    var lyr = getActiveLayer();
    return mode == 'point_style' && layerCanBeStyled(lyr);
  }

  function layerCanBeStyled(lyr) {
    return !!(lyr && lyr.geometry_type == 'point');
  }

  function quoteCommandValue(str) {
    return "'" + String(str).replace(/'/g, "\\'") + "'";
  }
}
