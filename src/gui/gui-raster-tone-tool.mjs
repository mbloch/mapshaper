import { El } from './gui-el';
import { internal } from './gui-core';
import { releasePanelFocus } from './gui-panel-focus';
import { makePanelActionButton } from './gui-panel-controls';
import { runGuiEditCommand } from './gui-edit-command';
import { clearRasterTonePreview, setRasterTonePreview } from './gui-raster-tone-preview';
import {
  TONE_SLIDERS, getDefaultToneSettings, getToneCommand, getToneSliderRange,
  sliderPosToToneValue, toneSettingsAreDefault, toneValueToSliderPos
} from './gui-tone-settings';

// The 'tone' mode: sliders that preview -tone settings on an RGB image. The
// map shows a toned copy of the raster's preview, and the raster itself is
// not changed until Apply runs -tone, which is what goes into the session
// history and the undo stack. Leaving the mode any other way -- Cancel, the
// panel's ×, another tool, another layer -- drops the preview.
export function RasterToneTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel raster-tone-panel').appendTo(parent).hide();
  var controls = {}; // slider name -> {input, readout}
  var settings = getDefaultToneSettings();
  var targetLayer = null;
  var pivots; // the image's lightness pivots, once contrast or gamma needs them
  var applyBtn;
  var pendingFrame = null;
  var pendingExact = false;
  var keepPreview = false;

  initPanel();

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'tone' && activeLayerCanBeToned()) {
      turnOn();
    } else {
      turnOff();
    }
  });

  gui.model.on('update', function() {
    if (!targetLayer) return;
    if (!activeLayerCanBeToned()) {
      gui.interaction.turnOff();
    } else if (getActiveLayer() != targetLayer) {
      // another image was selected, which starts over on that one
      turnOff();
      turnOn();
    }
  });

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    var section, btnRow;
    El('span').appendTo(header).text('Image colors');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', cancel);
    section = El('div').addClass('label-style-section').appendTo(panel);
    TONE_SLIDERS.forEach(function(slider) {
      controls[slider.name] = addSliderRow(section, slider);
    });
    btnRow = El('div').addClass('label-style-row label-panel-button-row raster-tone-buttons').appendTo(panel);
    makePanelActionButton(btnRow, 'Cancel', cancel);
    applyBtn = makePanelActionButton(btnRow, 'Apply', apply);
  }

  function addSliderRow(parentEl, slider) {
    var range = getToneSliderRange(slider);
    var row = El('div').addClass('label-style-row raster-tone-slider-row').appendTo(parentEl);
    var readout;
    El('span').addClass('raster-tone-slider-label').appendTo(row).text(slider.label);
    var input = El('input').attr('type', 'range').attr('min', range[0]).attr('max', range[1])
      .attr('step', 0.01).attr('aria-label', slider.label).appendTo(row)
      .on('input', function() {
        settings[slider.name] = sliderPosToToneValue(slider, +input.node().value);
        showSliderValue(slider);
        schedulePreview(false);
      })
      .on('change', function() {
        schedulePreview(true);
        releaseFocus();
      });
    // A double-click puts the slider back in the middle, which is hard to
    // find by dragging on the log sliders
    input.on('dblclick', function() {
      settings[slider.name] = 1;
      updateSlider(slider);
      schedulePreview(true);
    });
    readout = El('span').addClass('raster-tone-slider-value').appendTo(row);
    return {input: input, readout: readout};
  }

  function updateSlider(slider) {
    var input = controls[slider.name].input.node();
    input.value = toneValueToSliderPos(slider, settings[slider.name]);
    showSliderValue(slider);
  }

  function showSliderValue(slider) {
    var input = controls[slider.name].input.node();
    var min = +input.min, max = +input.max;
    var fill = max > min ? (input.value - min) / (max - min) : 0;
    input.style.setProperty('--fill', 'calc(6px + (100% - 12px) * ' + Math.round(fill * 1000) / 1000 + ')');
    controls[slider.name].readout.text(settings[slider.name].toFixed(2));
    applyBtn.classed('disabled', toneSettingsAreDefault(settings));
  }

  function turnOn() {
    targetLayer = getActiveLayer();
    settings = getDefaultToneSettings();
    pivots = undefined;
    TONE_SLIDERS.forEach(updateSlider);
    panel.show();
  }

  function turnOff() {
    if (!targetLayer) return;
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    pendingExact = false;
    if (!keepPreview) {
      clearRasterTonePreview(targetLayer);
      gui.dispatchEvent('map-needs-refresh');
    }
    targetLayer = null;
    releaseFocus();
    panel.hide();
  }

  function exitMode() {
    if (gui.interaction.getMode() == 'tone') {
      gui.interaction.turnOff();
    } else {
      turnOff();
    }
  }

  function cancel() {
    exitMode();
  }

  // The preview stays on the map while -tone runs, which replaces the layer
  // with a toned one, so that the original does not flash up in between
  function apply() {
    var cmd = getToneCommand(settings);
    var lyr = targetLayer;
    if (!cmd) return cancel();
    updatePreviewNow();
    keepPreview = true;
    exitMode();
    keepPreview = false;
    runGuiEditCommand(gui, cmd, {
      title: 'Tone error',
      onDone: function() {
        clearRasterTonePreview(lyr);
        gui.dispatchEvent('map-needs-refresh');
      }
    });
  }

  // Slider events come faster than the map can be redrawn on a large image.
  // @exact the slider was let go of (see setRasterTonePreview())
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
    pendingExact = false;
    if (!targetLayer) return;
    if (toneSettingsAreDefault(settings)) {
      clearRasterTonePreview(targetLayer);
    } else {
      setRasterTonePreview(targetLayer, {
        lightness: settings.lightness,
        saturation: settings.saturation,
        contrast: settings.contrast,
        gamma: settings.gamma,
        pivots: getPivots()
      }, exact);
    }
    gui.dispatchEvent('map-needs-refresh');
  }

  // Computed from the whole raster, as -tone does, rather than from the
  // preview, so that the preview matches what Apply makes
  function getPivots() {
    if (settings.contrast == 1 && settings.gamma == 1) return null;
    if (pivots === undefined) {
      pivots = internal.getTonePivots(internal.getRasterGrid(targetLayer.raster));
    }
    return pivots;
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  function getActiveLayer() {
    var o = gui.model.getActiveLayer();
    return o && o.layer || null;
  }

  function activeLayerCanBeToned() {
    var lyr = getActiveLayer();
    return !!(lyr && internal.layerHasRaster(lyr) && internal.rasterCanBeToned(lyr.raster));
  }
}
