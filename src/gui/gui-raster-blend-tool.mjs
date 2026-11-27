import { El } from './gui-el';
import { GUI } from './gui-lib';
import { internal } from './gui-core';
import { releasePanelFocus } from './gui-panel-focus';
import { makeColorField, makePanelActionButton, makePanelButton, makePanelSection } from './gui-panel-controls';
import { ColorPicker, layerColorPresetRows, toSixDigitHex } from './gui-color-picker';
import { runGuiEditCommand } from './gui-edit-command';
import {
  clearDrawnBlendPreview, clearRasterBlendPreview, drawBlendTarget, setDrawnBlendPreview,
  setRasterBlendPreview
} from './gui-raster-blend-preview';
import { blendIsAvailable, blendTargetIsDrawn, getBlendSourceLayers } from './gui-blend-sources';
import { formatLayerNameForDisplay } from './gui-layer-utils';
import {
  BLEND_OUTPUTS, BLEND_SECTIONS, BLEND_SLIDERS, BLEND_TEST_SLIDERS, getBlendColorSetting,
  getBlendCommand, getBlendOptionValues, getDefaultBlendSettings, hexToRgb, rgbToHex,
  roundBlendValue
} from './gui-blend-settings';

// The 'blend' mode: a menu of hillshade layers, and sliders and colors that
// preview -blend on a raster layer. The map shows a blended copy of the raster's
// preview in place of the raster and the hillshade, and neither layer is
// changed until Apply runs -blend, which is what goes into the session
// history and the undo stack (and which, as on the command line, replaces
// the raster and removes the hillshade, unless "Keep hillshade" is checked).
// Leaving the mode any other way --
// Cancel, the panel's ×, another tool, another layer -- drops the preview.
//
// On a polygon layer, the panel also has an Output setting: an overlay, which
// keeps the polygons, or an image, which replaces them (see BLEND_OUTPUTS),
// and a checkbox that clips the shading to the polygons.
// The polygons are drawn on a grid over the hillshade once per hillshade,
// and the map shows the overlay or the image above them.
export function RasterBlendTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel raster-tone-panel raster-blend-panel').appendTo(parent).hide();
  var controls = {}; // slider name -> {input, readout}
  var colorControls = {}; // settings key of a section's color -> {input, chit, picker}
  var settingPicker = false; // the picker echoes the colors it is given to onPreview
  var settings = getDefaultBlendSettings();
  var targetLayer = null;
  var targetDataset = null;
  var drawnTarget = false; // a polygon layer (see blendTargetIsDrawn())
  var sources = []; // [{layer, dataset}], as offered by the menu
  var source = null; // the selected one
  var shadings = new WeakMap(); // hillshade layer -> shading amounts, or null if unreadable
  // hillshade layer -> {drawing, failed}, the polygon target drawn over it;
  // drawing is null until drawBlendTarget() is done
  var drawings = new WeakMap();
  // the output and the checkboxes are left as they were from one blend to the next
  var output = BLEND_OUTPUTS[0].value;
  var outputRow, outputButtons = {};
  var clipRow, clipLabel, clipCheckbox;
  var sourceSelect, noteEl, slidersEl, keepLabel, keepCheckbox, applyBtn;
  var pendingFrame = null;
  var pendingExact = false;
  var keepPreview = false;

  initPanel();

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'blend' && blendIsAvailable(gui.model, getActiveLayer())) {
      turnOn();
    } else {
      turnOff();
    }
  });

  gui.model.on('update', function() {
    if (!targetLayer) return;
    if (!blendIsAvailable(gui.model, getActiveLayer())) {
      gui.interaction.turnOff();
    } else if (getActiveLayer() != targetLayer) {
      // another raster was selected, which starts over on that one
      turnOff();
      turnOn();
    } else {
      // a layer may have been added, removed or renamed
      updateSources();
    }
  });

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    var sourceRow, outputGroup, btnRow, testSection;
    El('span').appendTo(header).text('Blend hillshade');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', cancel);
    sourceRow = El('div').addClass('label-style-row raster-blend-source-row').appendTo(panel);
    El('span').addClass('raster-tone-slider-label').appendTo(sourceRow).text('Hillshade');
    sourceSelect = El('select').attr('aria-label', 'Hillshade layer').appendTo(sourceRow)
      .on('change', function() {
        selectSource(sources[+sourceSelect.node().value] || null);
        releaseFocus();
      });
    outputRow = El('div').addClass('label-style-row raster-tone-slider-row raster-blend-output-row').appendTo(panel);
    El('span').addClass('raster-tone-slider-label').appendTo(outputRow).text('Output');
    outputGroup = El('div').addClass('label-btn-group').appendTo(outputRow);
    BLEND_OUTPUTS.forEach(function(choice) {
      outputButtons[choice.value] = makePanelButton(outputGroup, choice.label, function() {
        if (output == choice.value) return;
        output = choice.value;
        showOutput();
        schedulePreview(true);
      });
    });
    clipRow = El('div').addClass('label-style-row raster-blend-clip-row').appendTo(panel);
    clipLabel = El('label').addClass('raster-blend-keep-label').appendTo(clipRow);
    clipCheckbox = El('input').attr('type', 'checkbox').appendTo(clipLabel)
      .on('change', function() {
        schedulePreview(true);
        releaseFocus();
      });
    El('span').appendTo(clipLabel).text('Clip to polygons');
    noteEl = El('div').addClass('raster-blend-note').appendTo(panel);
    slidersEl = El('div').addClass('raster-blend-sliders').appendTo(panel);
    BLEND_SECTIONS.forEach(function(section) {
      var el = makePanelSection(slidersEl, section.title);
      BLEND_SLIDERS.filter(function(slider) {
        return slider.side == section.side;
      }).forEach(function(slider) {
        controls[slider.name] = addSliderRow(el, slider, section);
      });
      colorControls[section.color] = addColorRow(el, section);
    });
    testSection = makePanelSection(slidersEl, 'Testing');
    if (!blendTestingIsOn()) testSection.node().style.display = 'none';
    BLEND_TEST_SLIDERS.forEach(function(slider) {
      controls[slider.name] = addSliderRow(testSection, slider, {title: 'Testing'});
    });
    btnRow = El('div').addClass('label-style-row label-panel-button-row raster-tone-buttons').appendTo(panel);
    keepLabel = El('label').addClass('raster-blend-keep-label').appendTo(btnRow);
    keepCheckbox = El('input').attr('type', 'checkbox').appendTo(keepLabel)
      .on('change', releaseFocus);
    El('span').appendTo(keepLabel).text('Keep hillshade');
    makePanelActionButton(btnRow, 'Cancel', cancel);
    applyBtn = makePanelActionButton(btnRow, 'Apply', apply);
  }

  function addSliderRow(parentEl, slider, section) {
    var row = El('div').addClass('label-style-row raster-tone-slider-row').appendTo(parentEl);
    var readout;
    El('span').addClass('raster-tone-slider-label').appendTo(row).text(slider.label);
    var input = El('input').attr('type', 'range').attr('min', slider.min).attr('max', slider.max)
      .attr('step', 0.01).attr('aria-label', section.title + ' ' + slider.label.toLowerCase()).appendTo(row)
      .on('input', function() {
        settings[slider.name] = roundBlendValue(+input.node().value);
        showSliderValue(slider);
        schedulePreview(false);
      })
      .on('change', function() {
        schedulePreview(true);
        releaseFocus();
      });
    // A double-click puts the slider back at its default
    input.on('dblclick', function() {
      settings[slider.name] = slider.value;
      updateSlider(slider);
      schedulePreview(true);
    });
    readout = El('span').addClass('raster-tone-slider-value').appendTo(row);
    return {row: row, input: input, readout: readout};
  }

  // The color stacked in place of the hillshade's own, which it starts as. A
  // drag in the picker previews on the map, as a drag of a slider does; an
  // emptied field goes back to the hillshade's color.
  function addColorRow(parentEl, section) {
    var row = El('div').addClass('label-style-row raster-tone-slider-row raster-blend-color-row').appendTo(parentEl);
    var control = {};
    El('span').addClass('raster-tone-slider-label').appendTo(row).text('Color');
    control.chit = El('div').addClass('label-color-chit').attr('role', 'button')
      .on('click', function() {
        control.picker.toggle();
      });
    control.input = El('input').attr('type', 'text')
      .attr('aria-label', section.title + ' color')
      .on('change', function() {
        var str = control.input.node().value.trim();
        var hex = toSixDigitHex(str);
        if (str && !hex) {
          showColor(section);
          return;
        }
        setColor(section, hex, true);
        showColor(section);
        releaseFocus();
      });
    makeColorField(row, control.chit, control.input);
    settingPicker = true;
    control.picker = new ColorPicker(row, {
      presetRows: layerColorPresetRows,
      onPreview: function(hex) {
        if (!settingPicker) setColor(section, hex, false);
      },
      onChange: function(hex) {
        setColor(section, hex, true);
      }
    });
    settingPicker = false;
    return control;
  }

  function setColor(section, hex, exact) {
    var control = colorControls[section.color];
    settings[section.color] = getBlendColorSetting(hex, getOwnColor(section));
    hex = settings[section.color] || getOwnColor(section);
    control.input.node().value = hex;
    control.chit.css('background-color', hex);
    schedulePreview(exact);
  }

  // Shows the section's color in the field and the picker
  function showColor(section) {
    var control = colorControls[section.color];
    var hex = settings[section.color] || getOwnColor(section);
    settingPicker = true;
    control.picker.setColor(hex);
    settingPicker = false;
    control.input.node().value = hex;
    control.chit.css('background-color', hex);
  }

  // The hillshade's own color for a section, as '#rrggbb'
  function getOwnColor(section) {
    var shading = source && getShading(source.layer);
    if (!shading) return section.side === 0 ? '#000000' : '#ffffff';
    return rgbToHex(section.side === 0 ? shading.shadow : shading.highlight);
  }

  function hidePickers() {
    BLEND_SECTIONS.forEach(function(section) {
      colorControls[section.color].picker.hide();
    });
  }

  function updateSlider(slider) {
    controls[slider.name].input.node().value = settings[slider.name];
    showSliderValue(slider);
  }

  function showSliderValue(slider) {
    var input = controls[slider.name].input.node();
    var min = +input.min, max = +input.max;
    var fill = max > min ? (input.value - min) / (max - min) : 0;
    input.style.setProperty('--fill', 'calc(6px + (100% - 12px) * ' + Math.round(fill * 1000) / 1000 + ')');
    controls[slider.name].readout.text(settings[slider.name].toFixed(2));
  }

  function turnOn() {
    var active = gui.model.getActiveLayer();
    targetLayer = active.layer;
    targetDataset = active.dataset;
    drawnTarget = blendTargetIsDrawn(targetLayer);
    // the test sliders keep their values from one blend to the next
    var prev = settings;
    settings = getDefaultBlendSettings();
    BLEND_TEST_SLIDERS.forEach(function(slider) {
      settings[slider.name] = prev[slider.name];
    });
    BLEND_SLIDERS.concat(BLEND_TEST_SLIDERS).forEach(updateSlider);
    outputRow.node().style.display = drawnTarget ? '' : 'none';
    clipRow.node().style.display = drawnTarget ? '' : 'none';
    showOutput();
    source = null;
    panel.show();
    updateSources();
  }

  function showOutput() {
    BLEND_OUTPUTS.forEach(function(choice) {
      outputButtons[choice.value].classed('selected', output == choice.value);
    });
  }

  function turnOff() {
    if (!targetLayer) return;
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    pendingExact = false;
    hidePickers();
    if (!keepPreview) {
      clearPreview(targetLayer);
      gui.dispatchEvent('map-needs-refresh');
    }
    targetLayer = null;
    targetDataset = null;
    sources = [];
    source = null;
    shadings = new WeakMap();
    drawings = new WeakMap();
    releaseFocus();
    panel.hide();
  }

  function exitMode() {
    if (gui.interaction.getMode() == 'blend') {
      gui.interaction.turnOff();
    } else {
      turnOff();
    }
  }

  function cancel() {
    exitMode();
  }

  // Keeps the selected hillshade if it is still there, or else selects the
  // first one (a layer made by -hillshade, if there is one)
  function updateSources() {
    var prev = source && source.layer;
    sources = getBlendSourceLayers(gui.model, targetLayer);
    sourceSelect.empty();
    sources.forEach(function(o, i) {
      El('option').attr('value', String(i)).text(formatLayerNameForDisplay(o.layer.name))
        .appendTo(sourceSelect);
    });
    sourceSelect.node().disabled = sources.length === 0;
    selectSource(sources.find(function(o) { return o.layer == prev; }) || sources[0] || null);
  }

  // A color that is the hillshade's own follows the hillshade; one that was
  // changed stays (unless it is the new hillshade's own)
  function selectSource(o) {
    source = o;
    if (source) sourceSelect.node().value = String(sources.indexOf(source));
    BLEND_SECTIONS.forEach(function(section) {
      if (settings[section.color]) {
        settings[section.color] = getBlendColorSetting(settings[section.color], getOwnColor(section));
      }
      showColor(section);
    });
    updatePanelState();
    schedulePreview(true);
  }

  function updatePanelState() {
    var shading = source ? getShading(source.layer) : null;
    var note = '';
    if (source && !shading) {
      note = 'This layer can\'t be read as a hillshade.';
    } else if (targetIsReprojected()) {
      note = 'The map is in a different projection from this layer, so the blend can\'t be previewed. Apply still blends it.';
    } else if (source && drawnTarget && getDrawing(source).failed) {
      note = 'This layer couldn\'t be drawn for a preview. Apply still blends it.';
    }
    noteEl.text(note);
    noteEl.node().style.display = note ? '' : 'none';
    slidersEl.classed('disabled', !shading);
    BLEND_SLIDERS.concat(BLEND_TEST_SLIDERS).forEach(function(slider) {
      controls[slider.name].input.node().disabled = !shading;
    });
    BLEND_SECTIONS.forEach(function(section) {
      colorControls[section.color].input.node().disabled = !shading;
    });
    applyBtn.classed('disabled', !shading);
    keepLabel.classed('disabled', !shading);
    clipLabel.classed('disabled', !shading);
  }

  // Read once per layer, as -blend reads it; null if -blend would stop on it
  // (stop() has already said why)
  function getShading(lyr) {
    var shading = shadings.get(lyr);
    if (shading !== undefined) return shading;
    try {
      shading = internal.getShadingAmounts(lyr.raster);
    } catch (e) {
      shading = null;
    }
    shadings.set(lyr, shading);
    return shading;
  }

  // The polygon target drawn over @src's hillshade, which is drawn once per
  // hillshade; the preview is updated when the drawing is done
  function getDrawing(src) {
    var entry = drawings.get(src.layer);
    var target = {layer: targetLayer, dataset: targetDataset};
    if (entry) return entry;
    entry = {drawing: null, failed: false};
    drawings.set(src.layer, entry);
    drawBlendTarget(gui.model, target, src.layer).then(function(drawing) {
      entry.drawing = drawing;
      if (drawings.get(src.layer) == entry) schedulePreview(true);
    }, function() {
      entry.failed = true;
      if (drawings.get(src.layer) == entry && source == src) updatePanelState();
    });
    return entry;
  }

  function targetIsReprojected() {
    return !!(targetLayer && targetLayer.gui && targetLayer.gui.dynamic_crs);
  }

  // The preview stays on the map while -blend runs, which replaces the layer
  // with a blended one, so that the original does not flash up in between
  function apply() {
    var shading = source && getShading(source.layer);
    var lyr = targetLayer;
    var cmd;
    if (!shading) return;
    cmd = getBlendCommand(settings,
      internal.formatOptionValue(internal.getLayerTargetId(gui.model, source.layer)),
      keepCheckbox.node().checked, drawnTarget ? output : null,
      drawnTarget && clipCheckbox.node().checked);
    updatePreviewNow();
    keepPreview = true;
    exitMode();
    keepPreview = false;
    runGuiEditCommand(gui, cmd, {
      title: 'Blend error',
      onDone: function() {
        clearPreview(lyr);
        gui.dispatchEvent('map-needs-refresh');
      }
    });
  }

  function clearPreview(lyr) {
    clearRasterBlendPreview(lyr);
    clearDrawnBlendPreview(lyr);
  }

  // Slider events come faster than the map can be redrawn on a large image.
  // @exact the slider was let go of (see setRasterBlendPreview())
  function schedulePreview(exact) {
    pendingExact = pendingExact || exact;
    if (pendingFrame !== null) return;
    pendingFrame = requestAnimationFrame(function() {
      pendingFrame = null;
      updatePreview();
    });
  }

  function updatePreviewNow() {
    if (pendingFrame === null) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    updatePreview();
  }

  function updatePreview() {
    var exact = pendingExact;
    var shading = source && getShading(source.layer);
    var drawing = null;
    pendingExact = false;
    if (!targetLayer) return;
    if (shading && drawnTarget && !targetIsReprojected()) {
      drawing = getDrawing(source).drawing;
    }
    if (!shading || targetIsReprojected() || drawnTarget && !drawing) {
      clearPreview(targetLayer);
    } else if (drawnTarget) {
      setDrawnBlendPreview(targetLayer, source.layer, drawing, shading, getPreviewSettings(), exact);
    } else {
      setRasterBlendPreview(targetLayer, source.layer, shading, getPreviewSettings(), exact);
    }
    gui.dispatchEvent('map-needs-refresh');
  }

  function getPreviewSettings() {
    var o = getBlendOptionValues(settings);
    o.shadow = settings.shadow_color ? hexToRgb(settings.shadow_color) : null;
    o.highlight = settings.highlight_color ? hexToRgb(settings.highlight_color) : null;
    o.output = output;
    o.clip = drawnTarget && clipCheckbox.node().checked;
    o.depthChroma = settings.depth_chroma;
    o.depthFade = settings.depth_fade;
    o.evenness = settings.evenness;
    o.evennessLightness = settings.evenness_lightness;
    return o;
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  function getActiveLayer() {
    var o = gui.model.getActiveLayer();
    return o && o.layer || null;
  }
}

function blendTestingIsOn() {
  var val = GUI.getUrlVars()['blend-testing'];
  return val === true || val == '1';
}
