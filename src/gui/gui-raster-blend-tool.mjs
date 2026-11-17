import { El } from './gui-el';
import { internal } from './gui-core';
import { releasePanelFocus } from './gui-panel-focus';
import { makePanelActionButton, makePanelSection } from './gui-panel-controls';
import { runGuiEditCommand } from './gui-edit-command';
import { clearRasterBlendPreview, setRasterBlendPreview } from './gui-raster-blend-preview';
import { blendIsAvailable, getBlendSourceLayers } from './gui-blend-sources';
import { formatLayerNameForDisplay } from './gui-layer-utils';
import {
  BLEND_SECTIONS, BLEND_SLIDERS, getBlendCommand, getBlendOptionValues, getDefaultBlendSettings,
  roundBlendValue
} from './gui-blend-settings';

// The 'blend' mode: a menu of hillshade layers and sliders that preview
// -blend on a raster layer. The map shows a blended copy of the raster's
// preview in place of the raster and the hillshade, and neither layer is
// changed until Apply runs -blend, which is what goes into the session
// history and the undo stack (and which, as on the command line, replaces
// the raster and removes the hillshade, unless "Keep hillshade" is checked).
// Leaving the mode any other way --
// Cancel, the panel's ×, another tool, another layer -- drops the preview.
export function RasterBlendTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel raster-tone-panel raster-blend-panel').appendTo(parent).hide();
  var controls = {}; // slider name -> {input, readout}
  var settings = getDefaultBlendSettings();
  var targetLayer = null;
  var sources = []; // [{layer, dataset}], as offered by the menu
  var source = null; // the selected one
  var shadings = new WeakMap(); // hillshade layer -> shading amounts, or null if unreadable
  // the checkbox is left as it was from one blend to the next
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
    var sourceRow, btnRow;
    El('span').appendTo(header).text('Blend hillshade');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', cancel);
    sourceRow = El('div').addClass('label-style-row raster-blend-source-row').appendTo(panel);
    El('span').addClass('raster-tone-slider-label').appendTo(sourceRow).text('Hillshade');
    sourceSelect = El('select').attr('aria-label', 'Hillshade layer').appendTo(sourceRow)
      .on('change', function() {
        selectSource(sources[+sourceSelect.node().value] || null);
        releaseFocus();
      });
    noteEl = El('div').addClass('raster-blend-note').appendTo(panel);
    slidersEl = El('div').addClass('raster-blend-sliders').appendTo(panel);
    BLEND_SECTIONS.forEach(function(section) {
      var el = makePanelSection(slidersEl, section.title);
      BLEND_SLIDERS.filter(function(slider) {
        return slider.option == section.option;
      }).forEach(function(slider) {
        controls[slider.name] = addSliderRow(el, slider);
      });
    });
    btnRow = El('div').addClass('label-style-row label-panel-button-row raster-tone-buttons').appendTo(panel);
    keepLabel = El('label').addClass('raster-blend-keep-label').appendTo(btnRow);
    keepCheckbox = El('input').attr('type', 'checkbox').appendTo(keepLabel)
      .on('change', releaseFocus);
    El('span').appendTo(keepLabel).text('Keep hillshade');
    makePanelActionButton(btnRow, 'Cancel', cancel);
    applyBtn = makePanelActionButton(btnRow, 'Apply', apply);
  }

  function addSliderRow(parentEl, slider) {
    var row = El('div').addClass('label-style-row raster-tone-slider-row').appendTo(parentEl);
    var readout;
    El('span').addClass('raster-tone-slider-label').appendTo(row).text(slider.label);
    var input = El('input').attr('type', 'range').attr('min', slider.min).attr('max', slider.max)
      .attr('step', 0.01).attr('aria-label', slider.label + ' ' + slider.option).appendTo(row)
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
    targetLayer = getActiveLayer();
    settings = getDefaultBlendSettings();
    BLEND_SLIDERS.forEach(updateSlider);
    source = null;
    panel.show();
    updateSources();
  }

  function turnOff() {
    if (!targetLayer) return;
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    pendingExact = false;
    if (!keepPreview) {
      clearRasterBlendPreview(targetLayer);
      gui.dispatchEvent('map-needs-refresh');
    }
    targetLayer = null;
    sources = [];
    source = null;
    shadings = new WeakMap();
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

  function selectSource(o) {
    source = o;
    if (source) sourceSelect.node().value = String(sources.indexOf(source));
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
    }
    noteEl.text(note);
    noteEl.node().style.display = note ? '' : 'none';
    slidersEl.classed('disabled', !shading);
    BLEND_SLIDERS.forEach(function(slider) {
      controls[slider.name].input.node().disabled = !shading;
    });
    applyBtn.classed('disabled', !shading);
    keepLabel.classed('disabled', !shading);
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
      keepCheckbox.node().checked);
    updatePreviewNow();
    keepPreview = true;
    exitMode();
    keepPreview = false;
    runGuiEditCommand(gui, cmd, {
      title: 'Blend error',
      onDone: function() {
        clearRasterBlendPreview(lyr);
        gui.dispatchEvent('map-needs-refresh');
      }
    });
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
    pendingExact = false;
    if (!targetLayer) return;
    if (!shading || targetIsReprojected()) {
      clearRasterBlendPreview(targetLayer);
    } else {
      setRasterBlendPreview(targetLayer, source.layer, shading, getBlendOptionValues(settings), exact);
    }
    gui.dispatchEvent('map-needs-refresh');
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  function getActiveLayer() {
    var o = gui.model.getActiveLayer();
    return o && o.layer || null;
  }
}
