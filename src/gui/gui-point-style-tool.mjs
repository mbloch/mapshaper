import { ColorPicker, isHexColor } from './gui-color-picker';
import { El } from './gui-el';
import { internal } from './gui-core';
import { showPopupAlert } from './gui-alert';

var defaultCircleRadius = 3;
var defaultCircleFill = '#000000';
var defaultCircleStroke = '#000000';

export function PointStyleTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel point-style-panel rollover').appendTo(parent).hide();
  var createFieldSelect, createExprInput, createCopyCheckbox, createLabelsBtn;
  var circleSizeText, circleFillControl, circleStrokeControl, circleFillOpacityInput, circleStrokeOpacityInput, circleStrokeWidthInput;
  var targetLayer = null;

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

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel).text('Point symbols');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', closePanel);

    initCreateLabelsSection();
    initCreateCirclesSection();
  }

  function initCreateLabelsSection() {
    var section = El('div').addClass('point-style-section').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(section).text('Labels');

    var fieldRow = El('label').addClass('label-style-row').appendTo(section);
    El('span').appendTo(fieldRow).text('Label field');
    createFieldSelect = El('select').appendTo(fieldRow).on('change', function() {
      var field = createFieldSelect.node().value;
      if (field) {
        createExprInput.node().value = getFieldExpression(field);
      }
      updateCreateLabelsButton();
    });

    var exprRow = El('label').addClass('label-style-row label-create-expression-row').appendTo(section);
    El('span').appendTo(exprRow).text('or expression');
    createExprInput = El('input')
      .attr('type', 'text')
      .appendTo(exprRow)
      .on('input', updateCreateLabelsButton)
      .on('change', updateCreateLabelsButton);

    var btnRow = El('div').addClass('label-style-row point-create-labels-row').appendTo(section);
    createLabelsBtn = El('button').appendTo(btnRow).text('Create').on('click', createLabels);
    var copyLabel = El('label').addClass('point-create-copy-label').appendTo(btnRow);
    createCopyCheckbox = El('input').attr('type', 'checkbox').appendTo(copyLabel);
    El('span').appendTo(copyLabel).text('as new layer');
  }

  function initCreateCirclesSection() {
    var section = El('div').addClass('point-style-section point-circle-section').appendTo(panel);
    El('div').addClass('label-style-row-label').appendTo(section).text('Circles');

    var fillRow = El('div').addClass('label-style-row point-symbol-row').appendTo(section);
    circleFillControl = addCircleColorControl(fillRow, 'Fill', defaultCircleFill);
    circleFillOpacityInput = addCircleNumberControl(fillRow, 'Opacity', '100%');

    var strokeRow = El('div').addClass('label-style-row point-symbol-row').appendTo(section);
    circleStrokeControl = addCircleColorControl(strokeRow, 'Stroke', defaultCircleStroke);
    circleStrokeOpacityInput = addCircleNumberControl(strokeRow, 'Opacity', '100%');

    var strokeWidthRow = El('label').addClass('label-style-row point-symbol-width-row').appendTo(section);
    El('span').appendTo(strokeWidthRow).text('Stroke width');
    circleStrokeWidthInput = El('input').attr('type', 'text').appendTo(strokeWidthRow);

    var sizeRow = El('div').addClass('label-style-row label-icon-size-row').appendTo(section);
    El('span').appendTo(sizeRow).text('Radius');
    makePanelButton(sizeRow, '−', function() {
      nudgeCircleRadius(-1);
    });
    circleSizeText = El('span').addClass('label-icon-size-value').appendTo(sizeRow);
    makePanelButton(sizeRow, '+', function() {
      nudgeCircleRadius(1);
    });

    var btnRow = El('div').addClass('label-style-row').appendTo(section);
    El('button').appendTo(btnRow).text('Create circles').on('click', createCircles);
  }

  function addCircleColorControl(row, label, defaultColor) {
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
    });
    control.picker = new ColorPicker(colorCell, {
      onPreview: function(hex) {
        setCircleColor(control, hex);
      },
      onChange: function(hex) {
        setCircleColor(control, hex);
      }
    });
    setCircleColor(control, defaultColor);
    control.picker.setColor(defaultColor);
    return control;
  }

  function addCircleNumberControl(row, label, value) {
    var control = El('label').addClass('layer-number-control').appendTo(row);
    var input;
    El('span').appendTo(control).text(label);
    input = El('input').attr('type', 'text').appendTo(control);
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
    updateCreateLabelsButton();
    if (!circleSizeText.text()) {
      circleSizeText.text(defaultCircleRadius);
    }
    if (!circleFillControl.input.node().value) setCircleColor(circleFillControl, defaultCircleFill);
    if (!circleStrokeControl.input.node().value) setCircleColor(circleStrokeControl, defaultCircleStroke);
    if (!circleFillOpacityInput.node().value) circleFillOpacityInput.node().value = '100%';
    if (!circleStrokeOpacityInput.node().value) circleStrokeOpacityInput.node().value = '100%';
    if (!circleStrokeWidthInput.node().value) circleStrokeWidthInput.node().value = '0';
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
    runCommand(cmd, 'Create labels');
  }

  function createCircles() {
    var radius = getCircleRadius();
    var fill = circleFillControl.input.node().value.trim() || defaultCircleFill;
    var fillOpacity = parseOpacityValue(circleFillOpacityInput.node().value);
    var stroke = circleStrokeControl.input.node().value.trim() || defaultCircleStroke;
    var strokeOpacity = parseOpacityValue(circleStrokeOpacityInput.node().value);
    var strokeWidth = parsePositiveNumber(circleStrokeWidthInput.node().value);
    var cmd;
    if (!gui.console || !(radius >= 0) || fillOpacity === null || strokeOpacity === null || strokeWidth === null) return;
    cmd = '-style r=' + radius +
      ' fill=' + quoteCommandValue(fill) +
      ' fill-opacity=' + fillOpacity +
      ' stroke=' + quoteCommandValue(stroke) +
      ' stroke-opacity=' + strokeOpacity +
      ' stroke-width=' + strokeWidth;
    runCommand(cmd, 'Create circles');
  }

  function runCommand(cmd, title) {
    gui.console.runMapshaperCommands(cmd, function(err) {
      if (err) {
        showPopupAlert(err.message || String(err), title);
      } else {
        updateControls();
      }
    });
  }

  function nudgeCircleRadius(delta) {
    circleSizeText.text(Math.max(0.25, getCircleRadius() + delta));
  }

  function getCircleRadius() {
    var radius = Number(circleSizeText.text());
    return isFinite(radius) && radius >= 0 ? radius : defaultCircleRadius;
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
    var val = Number(String(str).trim());
    return isFinite(val) && val >= 0 ? val : null;
  }

  function getFieldExpression(field) {
    return 'd[' + JSON.stringify(field) + ']';
  }

  function getActiveLayer() {
    var active = gui.model.getActiveLayer();
    return active && active.layer;
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
