import { El } from './gui-el';
import { internal } from './gui-core';
import { releasePanelFocus } from './gui-panel-focus';
import { makeColorField, makePanelActionButton, makePanelButton, makePanelSection } from './gui-panel-controls';
import { ColorPicker, layerColorPresetRows, toSixDigitHex } from './gui-color-picker';
import { runGuiEditCommand } from './gui-edit-command';
import { getShrinkFactor } from './gui-raster-shrink';
import { clearRasterHillshadePreview, setRasterHillshadePreview } from './gui-hillshade-preview';
import {
  HILLSHADE_COLOR_ROWS, HILLSHADE_LIGHTINGS, HILLSHADE_SLIDERS, HILLSHADE_SMOOTHING_LEVELS,
  HILLSHADE_STYLES, formatHillshadeSliderValue, getDefaultHillshadeSettings, getHillshadeCommand,
  getHillshadeOptions, getHillshadeSliderValue
} from './gui-hillshade-settings';

// While a slider is dragged, the preview is shaded at a reduced size if the
// raster is larger than this
var DRAFT_MAX_PIXELS = 1e6;
// work that takes longer than this shows a spinner
var BUSY_DELAY = 250;

var colorFns = {
  shadow: function(hex, strength) {
    return internal.formatColor(internal.getHillshadeShadowColor(internal.parseColor(hex), strength));
  },
  highlight: function(hex, strength) {
    return internal.formatColor(internal.getHillshadeHighlightColor(internal.parseColor(hex), strength));
  }
};

// The 'hillshade' mode: controls that preview -hillshade on an elevation
// raster. The map shows the hillshade in place of the elevation layer, which
// is not changed until Apply runs -hillshade, which is what goes into the
// session history and the undo stack. Leaving the mode any other way --
// Cancel, the panel's ×, another tool, another layer -- drops the preview.
//
// The panel reads the elevations once, and keeps what takes time to compute:
// the smoothed terrain for each smoothing level, and the fields of shading
// (see computeShadingFields()), which depend only on the light, the
// exaggeration and the smoothing. Other settings recombine the fields, which
// is fast enough to follow a slider. While a slider is dragged, the preview
// is made from copies of the terrain and the fields reduced to
// DRAFT_MAX_PIXELS (see renderDraft()). When it is let go of, the preview is
// made at full size, with the fields recomputed for the new settings (see
// renderExact()), which gives the same image as -hillshade.
export function HillshadeTool(gui) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel raster-tone-panel raster-hillshade-panel')
    .appendTo(parent).hide();
  var sliderControls = {}; // slider name -> {row, input, readout}
  var colorControls = {}; // color setting -> {row, input, chit, picker}
  var buttonGroups = {}; // setting -> {value -> button}
  var settingPicker = false; // the picker echoes the colors it is given to onPreview
  var settings = getDefaultHillshadeSettings();
  var targetLayer = null;
  // What the panel has computed for the target layer, replaced when the panel
  // opens on a layer, so that work still running for an earlier one is
  // dropped when it finishes. See turnOn().
  var state = null;
  var noteEl, titleSpinner, keepCheckbox, applyBtn;
  // the button whose setting is being computed, which shows the spinner in
  // place of its label; otherwise the spinner is next to the title
  var busyButton = null;
  var pendingFrame = null;
  var pendingExact = false;
  var keepPreview = false;

  initPanel();

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'hillshade' && activeLayerCanBeHillshaded()) {
      turnOn();
    } else {
      turnOff();
    }
  });

  gui.model.on('update', function() {
    if (!targetLayer) return;
    if (!activeLayerCanBeHillshaded()) {
      gui.interaction.turnOff();
    } else if (getActiveLayer() != targetLayer) {
      // another raster was selected, which starts over on that one
      turnOff();
      turnOn();
    }
  });

  function initPanel() {
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    var section, btnRow, keepLabel, title;
    title = El('span').appendTo(header).text('Hillshade');
    titleSpinner = El('span').addClass('raster-hillshade-spinner').appendTo(title);
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', cancel);
    noteEl = El('div').addClass('raster-blend-note').appendTo(panel);

    section = makePanelSection(panel, 'Shading');
    addButtonRow(section, 'Style', 'style', HILLSHADE_STYLES);
    HILLSHADE_COLOR_ROWS.forEach(function(o) {
      colorControls[o.name] = addColorRow(section, o);
    });
    addSliderRows(section, 'shading');

    section = makePanelSection(panel, 'Light');
    addSliderRows(section, 'light');
    addButtonRow(section, 'Lighting', 'lighting', HILLSHADE_LIGHTINGS);

    section = makePanelSection(panel, 'Terrain');
    addSliderRows(section, 'terrain');
    addButtonRow(section, 'Smoothing', 'smoothing', HILLSHADE_SMOOTHING_LEVELS);

    section = makePanelSection(panel, 'Effects');
    addSliderRows(section, 'effects');

    btnRow = El('div').addClass('label-style-row label-panel-button-row raster-tone-buttons').appendTo(panel);
    keepLabel = El('label').addClass('raster-blend-keep-label').appendTo(btnRow);
    keepCheckbox = El('input').attr('type', 'checkbox').appendTo(keepLabel)
      .on('change', releaseFocus);
    keepCheckbox.node().checked = true;
    El('span').appendTo(keepLabel).text('Keep elevation');
    makePanelActionButton(btnRow, 'Cancel', cancel);
    applyBtn = makePanelActionButton(btnRow, 'Apply', apply);
  }

  function addSliderRows(section, name) {
    HILLSHADE_SLIDERS.filter(function(slider) {
      return slider.section == name;
    }).forEach(function(slider) {
      sliderControls[slider.name] = addSliderRow(section, slider);
    });
  }

  function addSliderRow(parentEl, slider) {
    var row = El('div').addClass('label-style-row raster-tone-slider-row').appendTo(parentEl);
    var input, readout;
    El('span').addClass('raster-tone-slider-label').appendTo(row).text(slider.label);
    input = El('input').attr('type', 'range').attr('min', slider.min).attr('max', slider.max)
      .attr('step', slider.step).attr('aria-label', slider.label).appendTo(row)
      .on('input', function() {
        setSetting(slider.name, getHillshadeSliderValue(slider, +input.node().value), false);
      })
      .on('change', function() {
        busyButton = null;
        updateControls();
        schedulePreview(true);
        releaseFocus();
      });
    // A double-click puts the slider back at its default
    input.on('dblclick', function() {
      setSetting(slider.name, slider.value, true);
    });
    readout = El('span').addClass('raster-tone-slider-value').appendTo(row);
    return {row: row, input: input, readout: readout};
  }

  function addButtonRow(parentEl, label, key, choices) {
    var row = El('div').addClass('label-style-row raster-tone-slider-row raster-hillshade-button-row').appendTo(parentEl);
    var group;
    El('span').addClass('raster-tone-slider-label').appendTo(row).text(label);
    group = El('div').addClass('label-btn-group').appendTo(row);
    buttonGroups[key] = {};
    choices.forEach(function(choice) {
      var btn = buttonGroups[key][choice.value] = makePanelButton(group, choice.label, function() {
        if (settings[key] !== choice.value) setSetting(key, choice.value, true, btn);
      });
    });
  }

  // A drag in the picker previews on the map, as a drag of a slider does
  function addColorRow(parentEl, o) {
    var row = El('div').addClass('label-style-row raster-tone-slider-row raster-blend-color-row').appendTo(parentEl);
    var control = {row: row};
    El('span').addClass('raster-tone-slider-label').appendTo(row).text(o.label);
    control.chit = El('div').addClass('label-color-chit').attr('role', 'button')
      .on('click', function() {
        control.picker.toggle();
      });
    control.input = El('input').attr('type', 'text')
      .attr('aria-label', o.label + ' color')
      .on('change', function() {
        var hex = toSixDigitHex(control.input.node().value.trim());
        if (hex) setSetting(o.name, hex.toLowerCase(), true);
        showColor(o.name);
        releaseFocus();
      });
    makeColorField(row, control.chit, control.input);
    settingPicker = true;
    control.picker = new ColorPicker(row, {
      presetRows: layerColorPresetRows,
      onPreview: function(hex) {
        if (!settingPicker) setSetting(o.name, hex.toLowerCase(), false);
      },
      onChange: function(hex) {
        setSetting(o.name, hex.toLowerCase(), true);
      }
    });
    settingPicker = false;
    return control;
  }

  // @exact the change is complete (a slider was let go of, a button clicked),
  //   rather than part of a drag
  // @btn the button that made the change, if any
  function setSetting(key, val, exact, btn) {
    settings[key] = val;
    busyButton = btn || null;
    if (state) state.version++;
    updateControls();
    schedulePreview(exact);
  }

  function updateControls() {
    var opaque = settings.style == 'opaque';
    HILLSHADE_SLIDERS.forEach(function(slider) {
      var control = sliderControls[slider.name];
      control.row.classed('hidden', !!slider.style && slider.style != settings.style);
      control.input.node().value = settings[slider.name];
      showSliderValue(slider);
    });
    HILLSHADE_COLOR_ROWS.forEach(function(o) {
      colorControls[o.name].row.node().style.display = (o.style == 'opaque') == opaque ? '' : 'none';
      showColor(o.name);
    });
    Object.keys(buttonGroups).forEach(function(key) {
      Object.keys(buttonGroups[key]).forEach(function(val) {
        buttonGroups[key][val].classed('selected', String(settings[key]) == val);
      });
    });
  }

  function showSliderValue(slider) {
    var control = sliderControls[slider.name];
    var input = control.input.node();
    var min = +input.min, max = +input.max;
    var fill = max > min ? (input.value - min) / (max - min) : 0;
    input.style.setProperty('--fill', 'calc(6px + (100% - 12px) * ' + Math.round(fill * 1000) / 1000 + ')');
    control.readout.text(formatHillshadeSliderValue(slider, settings[slider.name],
      state ? state.autoExaggeration : 1));
  }

  function showColor(name) {
    var control = colorControls[name];
    var hex = settings[name];
    settingPicker = true;
    control.picker.setColor(hex);
    settingPicker = false;
    control.input.node().value = hex;
    control.chit.css('background-color', hex);
  }

  function hidePickers() {
    HILLSHADE_COLOR_ROWS.forEach(function(o) {
      colorControls[o.name].picker.hide();
    });
  }

  function turnOn() {
    var o = gui.model.getActiveLayer();
    var terrain = null;
    targetLayer = o.layer;
    settings = getDefaultHillshadeSettings();
    try {
      terrain = internal.readHillshadeTerrain(o.layer, o.dataset, {});
    } catch (e) {
      // stop() has already said why
    }
    state = terrain ? {
      terrain: terrain,
      autoExaggeration: internal.getAutoExaggeration(terrain.cells.median),
      draftFactor: getShrinkFactor(terrain.grid.width, terrain.grid.height, DRAFT_MAX_PIXELS),
      smoothed: {0: terrain.grid}, // smoothing level -> grid, or a promise of one
      reduced: {}, // smoothing level -> reduced copy of the smoothed grid
      fields: {}, // field name -> {key, data}, at full size
      draftFields: {}, // field name -> {key or source, data}, reduced
      version: 0, // incremented with each change of the settings
      exactRunning: false,
      exactAgain: false,
      busyTimer: null
    } : null;
    updateControls();
    showNote(state ? '' : 'This layer can\'t be shaded.');
    applyBtn.classed('disabled', !state);
    panel.show();
    schedulePreview(true);
  }

  function turnOff() {
    if (!targetLayer) return;
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    pendingExact = false;
    hidePickers();
    if (state) clearTimeout(state.busyTimer);
    showBusy(false);
    if (!keepPreview) {
      clearRasterHillshadePreview(targetLayer);
      gui.dispatchEvent('map-needs-refresh');
    }
    targetLayer = null;
    state = null;
    releaseFocus();
    panel.hide();
  }

  function exitMode() {
    if (gui.interaction.getMode() == 'hillshade') {
      gui.interaction.turnOff();
    } else {
      turnOff();
    }
  }

  function cancel() {
    exitMode();
  }

  // The preview stays on the map while -hillshade runs, which replaces the
  // layer (unless the elevation layer is kept), so that the elevations don't
  // flash up in between
  function apply() {
    var lyr = targetLayer;
    var cmd;
    if (!state) return;
    cmd = getHillshadeCommand(settings, state.autoExaggeration, colorFns, keepCheckbox.node().checked);
    keepPreview = true;
    exitMode();
    keepPreview = false;
    runGuiEditCommand(gui, cmd, {
      title: 'Hillshade error',
      onDone: function() {
        clearRasterHillshadePreview(lyr);
        gui.dispatchEvent('map-needs-refresh');
      }
    });
  }

  // Slider events come faster than the map can be redrawn on a large raster
  function schedulePreview(exact) {
    pendingExact = pendingExact || exact;
    if (pendingFrame !== null) return;
    pendingFrame = requestAnimationFrame(function() {
      var exactNow = pendingExact;
      pendingFrame = null;
      pendingExact = false;
      if (!state) return;
      if (exactNow) {
        requestExact(state);
      } else {
        renderDraft(state);
      }
    });
  }

  // Options as the command will have them, and the settings of shading they
  // give (see getHillshadeShading())
  function getShading(st) {
    return internal.getHillshadeShading(getHillshadeOptions(settings, st.autoExaggeration, colorFns),
      st.terrain);
  }

  // Keys of the settings each field depends on (see computeShadingFields()),
  // or null for a field the settings don't use
  function getFieldKeys(shading) {
    var s = shading.settings;
    return {
      shade: [shading.smoothing, s.azimuth, settings.altitude, settings.lighting, s.exaggeration].join(','),
      openness: s.ambient > 0 ? [shading.smoothing, s.exaggeration].join(',') : null,
      texture: s.texture > 0 ? [shading.smoothing, s.exaggeration].join(',') : null
    };
  }

  // One full-size image is made at a time; a request while one is being made
  // makes another when it is done, with the settings of then. The spinner
  // stays until the last one is done.
  function requestExact(st) {
    if (st.exactRunning) {
      st.exactAgain = true;
      return;
    }
    st.exactRunning = true;
    clearTimeout(st.busyTimer);
    st.busyTimer = setTimeout(function() {
      if (st == state) showBusy(true);
    }, BUSY_DELAY);
    renderExact(st).catch(function(e) {
      if (st == state) showNote(e.message || String(e));
      return 'failed';
    }).then(function(result) {
      st.exactRunning = false;
      clearTimeout(st.busyTimer);
      if (st != state) return;
      if (result != 'failed') showNote('');
      if (st.exactAgain) {
        st.exactAgain = false;
        requestExact(st);
      } else {
        showBusy(false);
      }
    });
  }

  // The spinner takes the place of the label of the button that started the
  // work, or the space kept for it next to the title, so the panel's layout
  // doesn't change
  function showBusy(busy) {
    var onButton = busy && !!busyButton && busyButton.hasClass('selected');
    Object.keys(buttonGroups).forEach(function(key) {
      Object.keys(buttonGroups[key]).forEach(function(val) {
        var btn = buttonGroups[key][val];
        btn.classed('busy', onButton && btn == busyButton);
      });
    });
    titleSpinner.classed('active', busy && !onButton);
  }

  // The full-size image, recomputing whatever the settings need. If the
  // settings change in the meantime (in a drag), what was computed is kept,
  // and the draft is made again, in case it was missing a field.
  async function renderExact(st) {
    var version = st.version;
    var shading = getShading(st);
    var grid = await getSmoothedGrid(st, shading.smoothing);
    var current = await getFields(st, grid, shading, getFieldKeys(shading));
    if (st != state) return;
    if (version != st.version) {
      schedulePreview(false);
      return;
    }
    showPreview(st, internal.writeHillshadeRgba(internal.combineShadingFields(current, grid, shading.settings),
      grid.valid, shading.style, shading.colors), 1);
  }

  async function getSmoothedGrid(st, level) {
    var terrain = st.terrain;
    var grid = st.smoothed[level];
    if (!grid) {
      grid = st.smoothed[level] = internal.runSmoothingStage(terrain.grid,
        internal.getSmoothingSettings(level, {}, terrain.cells.median, terrain.minElevation), {}
      ).then(function(result) {
        return (st.smoothed[level] = Object.assign({}, terrain.grid, {elev: result.elev}));
      });
    }
    return grid;
  }

  // Computes the fields that aren't kept for these settings, in one pass
  async function getFields(st, grid, shading, keys) {
    var s = shading.settings;
    var needs = Object.keys(keys).filter(function(name) {
      return keys[name] && !(st.fields[name] && st.fields[name].key == keys[name]);
    });
    var result;
    if (needs.length > 0) {
      result = await internal.runShadingFieldsStage(grid, Object.assign({}, s, {
        ambient: needs.includes('openness') ? s.ambient : 0,
        texture: needs.includes('texture') ? s.texture : 0
      }), {});
      needs.forEach(function(name) {
        st.fields[name] = {key: keys[name], data: result[name]};
      });
    }
    return {
      shade: st.fields.shade.data,
      openness: keys.openness ? st.fields.openness.data : null,
      texture: keys.texture ? st.fields.texture.data : null
    };
  }

  // An image made from reduced copies of the smoothed terrain and the fields,
  // while a slider is dragged. A slider that changes the light or the
  // exaggeration reshades the reduced terrain; the other fields are reduced
  // copies of the latest ones, even if they were computed for another
  // exaggeration. A field that hasn't been computed is left out until
  // renderExact() has computed it.
  function renderDraft(st) {
    var shading = getShading(st);
    var keys = getFieldKeys(shading);
    var full = st.smoothed[shading.smoothing];
    var s = shading.settings;
    var grid, current, missing = false;
    if (!full || full.then) {
      requestExact(st);
      return;
    }
    grid = st.draftFactor > 1 ?
      st.reduced[shading.smoothing] || (st.reduced[shading.smoothing] = reduceGrid(full, st.draftFactor)) : full;
    current = {shade: getDraftShade(st, grid, shading, keys.shade)};
    ['openness', 'texture'].forEach(function(name) {
      var o = st.fields[name];
      if (!keys[name]) return;
      if (o && o.key != keys[name]) missing = true;
      if (!o || o.key.split(',')[0] != String(shading.smoothing)) {
        missing = true;
        return;
      }
      current[name] = getDraftField(st, name, o.data);
    });
    s = Object.assign({}, s, {
      ambient: current.openness ? s.ambient : 0,
      texture: current.texture ? s.texture : 0
    });
    showPreview(st, internal.writeHillshadeRgba(internal.combineShadingFields(current, grid, s),
      grid.valid, shading.style, shading.colors), st.draftFactor);
    if (missing) requestExact(st);
  }

  function getDraftShade(st, grid, shading, key) {
    var s = shading.settings;
    var o = st.draftFields.shade;
    if (st.draftFactor == 1 && st.fields.shade && st.fields.shade.key == key) {
      return st.fields.shade.data;
    }
    if (!o || o.key != key) {
      o = st.draftFields.shade = {key: key, data: internal.computeHillshade(grid.elev, grid.valid,
        grid.width, grid.height, grid.cellWidths, grid.cellHeights, s.lights, s.exaggeration)};
    }
    return o.data;
  }

  function getDraftField(st, name, data) {
    var o = st.draftFields[name];
    var k = st.draftFactor;
    if (k == 1) return data;
    if (!o || o.source != data) {
      o = st.draftFields[name] = {source: data,
        data: reduceArray(data, st.terrain.grid.width, st.terrain.grid.height, k)};
    }
    return o.data;
  }

  // @k 1 for the full image, or the reduction factor of a draft
  function showPreview(st, rgba, k) {
    if (st != state) return;
    setRasterHillshadePreview(targetLayer, makePreviewRaster(st.terrain.source, rgba, k));
    gui.dispatchEvent('map-needs-refresh');
  }

  function showNote(note) {
    noteEl.text(note);
    noteEl.node().style.display = note ? '' : 'none';
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }

  function activeLayerCanBeHillshaded() {
    var lyr = getActiveLayer();
    return !!(lyr && internal.layerHasRaster(lyr) && internal.rasterCanBeHillshaded(lyr.raster));
  }

  function getActiveLayer() {
    var o = gui.model.getActiveLayer();
    return o && o.layer || null;
  }
}

// Every @k-th pixel of every @k-th row of a grid of the stages of
// mapshaper-hillshade-stages.mjs, with the ground size of a pixel scaled to
// match
function reduceGrid(grid, k) {
  var w = Math.ceil(grid.width / k), h = Math.ceil(grid.height / k);
  var cellWidths = new Float64Array(h), cellHeights = new Float64Array(h);
  for (var y = 0; y < h; y++) {
    cellWidths[y] = grid.cellWidths[y * k] * k;
    cellHeights[y] = grid.cellHeights[y * k] * k;
  }
  return {
    elev: reduceArray(grid.elev, grid.width, grid.height, k),
    valid: grid.valid ? reduceArray(grid.valid, grid.width, grid.height, k) : null,
    width: w,
    height: h,
    cellWidths: cellWidths,
    cellHeights: cellHeights
  };
}

function reduceArray(arr, width, height, k) {
  var w = Math.ceil(width / k), h = Math.ceil(height / k);
  var out = new arr.constructor(w * h);
  var x, y, i = 0, row;
  for (y = 0; y < h; y++) {
    row = y * k * width;
    for (x = 0; x < w; x++) {
      out[i++] = arr[row + x * k];
    }
  }
  return out;
}

// A hillshade raster for the preview, covering the elevation raster @source.
// A reduced image covers a little more than the raster at its right and
// bottom edges, if the raster's size isn't a multiple of @k.
function makePreviewRaster(source, rgba, k) {
  var w = Math.ceil(source.width / k), h = Math.ceil(source.height / k);
  var b = source.bbox;
  var dx = (b[2] - b[0]) / source.width * k;
  var dy = (b[3] - b[1]) / source.height * k;
  var bbox = k == 1 ? b.concat() : [b[0], b[3] - h * dy, b[0] + w * dx, b[3]];
  var raster = {
    sourceId: 'hillshade-preview',
    interpretation: 'image',
    grid: {
      width: w,
      height: h,
      bands: 4,
      pixelType: 'uint8',
      samples: rgba,
      sampleBands: [0, 1, 2, 3],
      nodata: null,
      bbox: bbox,
      transform: [dx, 0, bbox[0], 0, -dy, bbox[3]]
    },
    view: {recipe: {type: 'rgb', bands: [0, 1, 2, 3], scaling: 'none'}}
  };
  raster.view.preview = internal.createRasterPreview(raster, {});
  return raster;
}
