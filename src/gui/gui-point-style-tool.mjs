import { El } from './gui-el';
import {
  claimFieldKeys, isTextInput, releasePanelFocus
} from './gui-panel-focus';
import {
  makeColorRow, makePanelActionButton, makePanelSection, setPanelButtonDisabled
} from './gui-panel-controls';
import { SizeField } from './gui-size-field';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import { parseOpacityValue, formatOpacityPct } from './gui-style-values';

var defaultCircleRadius = 0;
var defaultCreatedCircleRadius = 3;
var defaultCircleFill = '#000000';

export function PointStyleTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel point-style-panel rollover').appendTo(parent).hide();
  var title, noteSection, labelsSection, circlesSection, symbolsSection, labelNoteSection;
  var circleSectionTitle;
  var symbolNote;
  var createFieldSelect, createExprInput, createCopyCheckbox, createLabelsBtn;
  var editingRow, editingStatus, clearLink;
  var createCirclesRow;
  var circleControlRows = [];
  var circleRadiusField, circleStrokeWidthField;
  var circleFillControl, circleStrokeControl;
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
    // The panel's fields keep the keyboard while the caret is in them, and
    // give it up when they are finished with; see gui-panel-focus.mjs.
    claimFieldKeys(panel.node(), {
      revert: updateControls,
      release: releaseFocus
    });
    panel.node().addEventListener('click', function() {
      if (isTextInput(document.activeElement)) return;
      releaseFocus();
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    title = El('span').appendTo(header).text('Point symbols');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', closePanel);

    initNoteSections();
    initCreateLabelsSection();
    initCreateCirclesSection();
    initSymbolsSection();
  }

  function initNoteSections() {
    noteSection = El('div').addClass('label-style-section').appendTo(panel);
    El('div').addClass('point-style-note').appendTo(noteSection).text('This layer contains unstyled points.');

    labelNoteSection = El('div').addClass('label-style-section').appendTo(panel);
    El('div').addClass('point-style-note').appendTo(labelNoteSection)
      .text('This layer is rendered as labels. Use the label tool to edit them.');
  }

  function initCreateLabelsSection() {
    labelsSection = makePanelSection(panel, 'Labels');

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
    createLabelsBtn = makePanelActionButton(btnRow, 'Create', createLabels);
    var copyLabel = El('label').addClass('point-create-copy-label').appendTo(btnRow);
    createCopyCheckbox = El('input').attr('type', 'checkbox').appendTo(copyLabel);
    El('span').appendTo(copyLabel).text('as new layer');
  }

  function initCreateCirclesSection() {
    circlesSection = makePanelSection(panel, 'Circles');
    // Hidden once the points are circles: the panel's own title says so then,
    // and the section is the only thing left in the panel.
    circleSectionTitle = circlesSection.findChild('.label-style-section-title');
    El('div').addClass('point-style-note point-circle-note').appendTo(circlesSection)
      .text('Use the -style command in the console to create proportional circles.');

    createCirclesRow = El('div').addClass('label-style-row label-panel-button-row').appendTo(circlesSection);
    makePanelActionButton(createCirclesRow, 'Create simple circles', createSimpleCircles);

    editingRow = El('div').addClass('label-style-row label-style-selection-row').appendTo(circlesSection);
    editingStatus = El('span').addClass('label-editing-status').appendTo(editingRow);
    clearLink = El('span').addClass('label-editing-clear colored-text').appendTo(editingRow).text('deselect').on('click', clearSelection);

    circleFillControl = addCircleColorControl('Fill', 'fill');
    circleStrokeControl = addCircleColorControl('Stroke', 'stroke');
    circleControlRows.push(circleFillControl.row, circleStrokeControl.row);

    // The two sizes of a circle side by side, in the shape the panel uses for
    // every other pair.
    var sizeRow = El('div').addClass('label-style-row label-split-row').appendTo(circlesSection);
    var widthCell = El('div').addClass('label-split-cell').appendTo(sizeRow);
    var radiusCell = El('div').addClass('label-split-cell').appendTo(sizeRow);
    El('span').appendTo(widthCell).text('Stroke width');
    circleStrokeWidthField = new SizeField(widthCell, {
      min: 0,
      decimals: 2, // quarter-pixel hairlines, which the ladder below steps through
      title: 'Stroke width in px',
      onSet: function(value) {
        setCircleStrokeWidth(value);
        applyCircleStyles();
      },
      // Up a ladder of widths rather than by a fixed amount: the useful ones
      // are close together at the hairline end and far apart above 2px.
      onStep: function(delta) {
        setCircleStrokeWidth(getNextStrokeWidth(getCircleStrokeWidth(), delta > 0 ? 1 : -1));
        applyCircleStyles();
      },
      onDone: releaseFocus
    });
    El('span').appendTo(radiusCell).text('Radius');
    circleRadiusField = new SizeField(radiusCell, {
      min: 0,
      title: 'Circle radius in px',
      onSet: function(value) {
        setCircleRadius(value);
        applyCircleStyles();
      },
      onStep: function(delta) {
        setCircleRadius(getNextCircleRadius(getCircleRadiusForNudge(), delta > 0 ? 1 : -1));
        applyCircleStyles();
      },
      onDone: releaseFocus
    });
    circleControlRows.push(sizeRow);
  }

  function initSymbolsSection() {
    symbolsSection = makePanelSection(panel, 'Symbols');
    symbolNote = El('div').addClass('point-style-note').appendTo(symbolsSection)
      .text('Use the -symbols command in the console to create arrows and other symbols.');
  }

  function addCircleColorControl(label, field) {
    var control = makeColorRow(circlesSection, {
      label: label,
      // Every circle property is applied together, from what the controls are
      // showing: the fields are one style, not five.
      onColor: applyCircleStyles,
      onOpacity: applyCircleStyles,
      revert: updateControls
    });
    control.field = field;
    return control;
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  function turnOn() {
    targetLayer = getActiveLayer();
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

  function updateCircleSection(representation) {
    var showCreate = representation == 'unstyled';
    circleSectionTitle.classed('hidden', !showCreate);
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
    setCircleOpacity(circleFillControl, fillOpacity);
    setCircleOpacity(circleStrokeControl, strokeOpacity);
    setCircleStrokeWidth(strokeWidth === '' ? 0 : strokeWidth);
    if (representation != 'circle' && representation != 'unstyled') {
      setCircleRadius(defaultCircleRadius);
      setCircleColor(circleFillControl, '');
      setCircleColor(circleStrokeControl, '');
      setCircleOpacity(circleFillControl, '');
      setCircleOpacity(circleStrokeControl, '');
      setCircleStrokeWidth(0);
    }
  }

  function setCircleOpacity(control, value) {
    control.opacity.node().value = formatOpacityPct(value === '' ? 1 : value);
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
    setPanelButtonDisabled(createLabelsBtn, createExprInput.node().value.trim() === '');
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

  // What to do once this panel's Create button has turned a field into labels.
  // The layer is a label layer now, which this panel can only restyle, so the
  // label tool takes over -- the same tool the layer's own menu offers.
  function openLabelStyles() {
    var active = gui.model.getActiveLayer();
    if (active && active.layer && internal.layerHasLabels(active.layer)) {
      gui.interaction.setMode('label');
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
    var fillOpacity = parseOpacityValue(circleFillControl.opacity.node().value);
    var stroke = circleStrokeControl.input.node().value.trim();
    var strokeOpacity = parseOpacityValue(circleStrokeControl.opacity.node().value);
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

  // null for a field showing nothing, which is what a selection whose circles
  // do not agree on a radius shows: there is no radius to apply then, and the
  // style command leaves the property alone.
  function getCircleRadius() {
    return circleRadiusField.getValue();
  }

  function getCircleRadiusForNudge() {
    var radius = getCircleRadius();
    return radius === null ? getMostCommonNumberValue('r', defaultCircleRadius) : radius;
  }

  function setCircleRadius(value) {
    circleRadiusField.setValue(value === '' ? '' : formatNumberValue(value));
  }

  function getCircleStrokeWidth() {
    var width = circleStrokeWidthField.getValue();
    return width === null ? 0 : width;
  }

  function setCircleStrokeWidth(value) {
    circleStrokeWidthField.setValue(formatNumberValue(value));
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
    control.setColor(color);
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

}
