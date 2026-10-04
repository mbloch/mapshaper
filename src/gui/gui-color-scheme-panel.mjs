import { El } from './gui-el';
import { ColorPicker } from './gui-color-picker';
import { claimFieldKeys, isTextInput, opensAMenu, releasePanelFocus } from './gui-panel-focus';
import { SizeField } from './gui-size-field';
import { runGuiEditCommand } from './gui-edit-command';
import { internal } from './gui-core';
import {
  classifyMethods, minSchemeColors, maxSchemeColors,
  getSequentialPresetNames, getDefaultScheme, getSchemeColors, getPresetColors,
  choosePreset, makeSchemeCustom, setTileColor, clearTileColor, setTileCount, reverseScheme,
  getSchemeVibrance, setSchemeVibrance, setSchemeLongHue, getSchemeTiles, getTileEditColor, maxVibrance,
  formatSchemeCommand, getNumericFields, getLayerScheme, setLayerScheme
} from './gui-color-scheme-model';

// A popup beside the polygon style panel for coloring a layer's fills by a
// data field, with -classify. Edits are applied as they are made, in a command
// session, so that the whole time the panel is open on a layer is one undo
// state and one command in the session history.
// See docs/development/color-scheme-panel-design.md
//
// opts.getExtraCommands()  commands to run after -classify, in the same step
//                          (the style panel's pattern backgrounds follow the
//                          fills)
// opts.getSelectionCount() features selected in the style panel
// opts.onUpdate()          the scheme or the fills changed
// opts.onClose()           the panel was closed
var reverseIcon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M2 4.5h9.5M9 2l2.5 2.5L9 7"/><path d="M12 9.5H2.5M5 7L2.5 9.5 5 12"/></svg>';
var longHueIcon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M11.5 4.6A5 5 0 1 0 12 7"/><path d="M12 1.8v3h-3"/></svg>';

export function ColorSchemePanel(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel color-scheme-panel').appendTo(parent).hide();
  var session = null; // made on first use: the console is made after the panel
  var targetLayer = null;
  var scheme = null;
  var sessionLayer = null; // the layer the session's edits are to
  var baseScheme = null; // its scheme when they began
  var selectedTile = -1;
  var paletteBtn, paletteMenu, countField, tileRow, tilesEl, picker, fieldSelect, methodSelect,
      noFieldsNote, selectionNote, controlsEl, vibranceRow, vibranceInput,
      longHueBtn;

  initPanel();

  gui.on('undo_redo_post', function() {
    var restored;
    if (!targetLayer) return;
    restored = getLayerScheme(targetLayer);
    if (restored) {
      scheme = restored;
      render();
    } else {
      close();
    }
  });

  this.open = function(lyr) {
    var fields;
    if (targetLayer && targetLayer != lyr) close();
    targetLayer = lyr;
    selectedTile = -1;
    scheme = getLayerScheme(lyr);
    panel.show();
    if (!scheme) {
      fields = getNumericFields(lyr);
      scheme = getDefaultScheme(fields[0]);
      if (scheme.field) apply();
    }
    render();
  };

  this.close = close;

  this.isOpen = function() {
    return !!targetLayer;
  };

  function close() {
    var wasOpen = !!targetLayer;
    picker.hide();
    hidePaletteMenu();
    panel.hide();
    targetLayer = null;
    scheme = null;
    if (session) session.finish();
    if (wasOpen && opts.onClose) opts.onClose();
  }

  function getSession() {
    if (!session && gui.console && gui.console.createCommandSession) {
      session = gui.console.createCommandSession({label: 'Color scheme', onCommit: onCommit});
    }
    return session;
  }

  function initPanel() {
    claimFieldKeys(panel.node(), {
      revert: render,
      release: releaseFocus
    });
    panel.node().addEventListener('click', function(e) {
      if (isTextInput(document.activeElement) || opensAMenu(e.target)) return;
      releaseFocus();
    });

    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    El('span').appendTo(header).text('Color by data');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
      close();
      opts.onUpdate();
    });

    noFieldsNote = El('div').addClass('label-style-row color-scheme-note').appendTo(panel)
      .text('This layer has no numeric fields to classify.');
    controlsEl = El('div').appendTo(panel);

    var fieldRow = El('div').addClass('label-style-row color-scheme-select-row').appendTo(controlsEl);
    El('span').appendTo(fieldRow).text('Field');
    fieldSelect = El('select').attr('aria-label', 'Data field').appendTo(fieldRow).on('change', function() {
      updateScheme({field: fieldSelect.node().value});
    });

    var methodRow = El('div').addClass('label-style-row color-scheme-select-row').appendTo(controlsEl);
    El('span').appendTo(methodRow).text('Method');
    methodSelect = El('select').attr('aria-label', 'Classification method').appendTo(methodRow).on('change', function() {
      updateScheme({method: methodSelect.node().value});
    });
    classifyMethods.forEach(function(item) {
      El('option').attr('value', item.name).text(item.label).appendTo(methodSelect);
    });

    var paletteRow = El('div').addClass('label-style-row label-split-row').appendTo(controlsEl);
    var paletteCell = El('div').addClass('label-split-cell color-scheme-palette-cell').appendTo(paletteRow);
    var countCell = El('div').addClass('label-split-cell').appendTo(paletteRow);
    El('span').appendTo(paletteCell).text('Palette');
    paletteBtn = El('div').addClass('color-scheme-palette-btn').attr('role', 'button')
      .attr('aria-label', 'Palette').appendTo(paletteCell).on('click', togglePaletteMenu);
    paletteMenu = El('div').addClass('color-scheme-palette-menu').appendTo(paletteCell).hide();
    El('span').appendTo(countCell).text('Colors');
    countField = new SizeField(countCell, {
      min: minSchemeColors,
      max: maxSchemeColors,
      step: 1,
      bigStep: 2,
      decimals: 0,
      title: 'Number of classes',
      onSet: function(n) {
        changeScheme(setTileCount(scheme, n));
      },
      onStep: function(delta) {
        changeScheme(setTileCount(scheme, scheme.n + (delta > 0 ? 1 : -1)));
      },
      onDone: releaseFocus
    });

    tileRow = El('div').addClass('color-scheme-tile-row').appendTo(controlsEl);
    tilesEl = El('div').addClass('color-scheme-tiles').appendTo(tileRow);
    picker = new ColorPicker(tileRow, {
      presetRows: [],
      onPreview: function(hex) {
        var tile = tilesEl.node().children[selectedTile];
        if (tile) tile.querySelector('.color-scheme-tile').style.backgroundColor = hex;
      },
      onChange: function(hex) {
        if (selectedTile > -1) changeScheme(setTileColor(scheme, selectedTile, hex));
      },
      // the highlight says which tile the picker is editing
      onHide: function() {
        selectedTile = -1;
        render();
      }
    });

    // the slider works in thousandths of OKLCH chroma
    vibranceRow = addSliderRow('Vibrance', 'Makes all the colors more vivid',
        0, Math.round(maxVibrance * 1000), 5, function(val) {
      changeScheme(setSchemeVibrance(scheme, val / 1000));
    });
    vibranceInput = vibranceRow.findChild('input');
    longHueBtn = addIconButton(vibranceRow, 'Go the long way around the color wheel', longHueIcon, function() {
      changeScheme(setSchemeLongHue(scheme, !scheme.longHue));
    });
    addIconButton(vibranceRow, 'Reverse the colors', reverseIcon, function() {
      changeScheme(reverseScheme(scheme));
    });
    selectionNote = El('div').addClass('label-style-row color-scheme-note').appendTo(controlsEl)
      .text('Colors apply to every feature in the layer, not only the selected ones.');

    document.addEventListener('mousedown', function(e) {
      if (paletteMenu.visible() && !paletteMenu.node().contains(e.target) &&
          !paletteBtn.node().contains(e.target)) {
        hidePaletteMenu();
      }
    });
  }

  function render() {
    var fields, colors, tiles;
    if (!targetLayer || !scheme) return;
    fields = getNumericFields(targetLayer);
    noFieldsNote.classed('hidden', fields.length > 0);
    controlsEl.classed('hidden', fields.length === 0);
    if (fields.length === 0) return;
    renderFieldOptions(fields);
    methodSelect.node().value = scheme.method;
    countField.setValue(String(scheme.n));
    tiles = getSchemeTiles(scheme);
    colors = tiles.map(function(tile) { return tile.color; });
    renderPaletteButton(colors);
    renderTiles(tiles);
    renderVibrance();
    selectionNote.classed('hidden', !(opts.getSelectionCount() > 0));
  }

  function addSliderRow(label, tooltip, min, max, step, onInput) {
    var row = El('div').addClass('label-style-row color-scheme-slider-row').appendTo(controlsEl);
    var labelEl = El('span').addClass('color-scheme-slider-label').attr('data-tooltip', tooltip)
      .appendTo(row).text(label)
      .on('mouseenter', function() { keepTooltipInWindow(labelEl.node()); });
    var input = El('input').attr('type', 'range').attr('min', min).attr('max', max).attr('step', step)
      .attr('aria-label', label).appendTo(row)
      .on('input', function() {
        onInput(+input.node().value);
      })
      .on('change', releaseFocus);
    return row;
  }

  function addIconButton(parent, label, icon, onClick) {
    var btn = El('button').addClass('color-scheme-icon-btn').attr('type', 'button')
      .attr('aria-label', label).attr('data-tooltip', label).html(icon).appendTo(parent)
      .on('click', onClick)
      .on('mouseenter', function() { keepTooltipInWindow(btn.node()); });
    return btn;
  }

  // Presets have no interpolated tiles for vibrance or the hue path to
  // change; the row keeps only the reverse button for them.
  function renderVibrance() {
    var vibrance = getSchemeVibrance(scheme);
    setSliderValue(vibranceInput, Math.round(vibrance * 1000));
    vibranceRow.classed('preset', !!scheme.preset);
    longHueBtn.classed('selected', !!scheme.longHue)
      .attr('aria-pressed', scheme.longHue ? 'true' : 'false');
  }

  function setSliderValue(input, val) {
    if (input.node().value != val) input.node().value = val;
  }

  function renderFieldOptions(fields) {
    fieldSelect.empty();
    fields.forEach(function(field) {
      El('option').attr('value', field).text(field).appendTo(fieldSelect);
    });
    fieldSelect.node().value = scheme.field;
  }

  function renderPaletteButton(colors) {
    paletteBtn.empty();
    El('div').addClass('color-scheme-strip').appendTo(paletteBtn)
      .css('background-image', getStripBackground(colors));
    El('span').addClass('color-scheme-palette-name').appendTo(paletteBtn)
      .text(scheme.preset || 'Custom');
  }

  function renderTiles(tiles) {
    var n = tiles.length;
    tilesEl.empty();
    tiles.forEach(function(tile, i) {
      var color = tile.color;
      var cell = El('div').addClass('color-scheme-tile-cell').appendTo(tilesEl);
      El('div').addClass('color-scheme-tile').attr('role', 'button')
        .attr('aria-label', 'Color ' + (i + 1) + ': ' + color)
        .classed('selected', i == selectedTile)
        .css('background-color', color)
        .appendTo(cell)
        .on('click', function() {
          selectTile(i, color);
        });
      var pin = El('div').addClass('color-scheme-pin').appendTo(cell)
        .on('mouseenter', function() { keepTooltipInWindow(pin.node()); });
      if (tile.adjusted) {
        pin.addClass('adjusted').attr('data-tooltip', describeAdjustment(tile));
      }
      if (!tile.pinned) return;
      pin.addClass('pinned');
      if (i === 0 || i == n - 1) {
        pin.addClass('end').attr('data-tooltip', 'The ends of a ramp are always pinned');
      } else {
        pin.attr('role', 'button').attr('aria-label', 'Unpin this color')
          .attr('data-tooltip', 'Unpin this color')
          .on('click', function() {
            changeScheme(clearTileColor(scheme, i));
          });
      }
    });
  }

  // A tooltip is centered under its pin or button, unless that would run it past the
  // edge of the window
  function keepTooltipInWindow(el) {
    var margin = 4;
    el.style.removeProperty('--tooltip-shift');
    if (!el.hasAttribute('data-tooltip')) return;
    var width = parseFloat(getComputedStyle(el, '::after').width) || 0;
    var rect = el.getBoundingClientRect();
    var center = rect.left + rect.width / 2;
    var left = center - width / 2;
    var right = center + width / 2;
    var maxRight = document.documentElement.clientWidth - margin;
    var shift = 0;
    if (right > maxRight) shift = maxRight - right;
    else if (left < margin) shift = margin - left;
    if (shift) el.style.setProperty('--tooltip-shift', shift + 'px');
  }

  function describeAdjustment(tile) {
    var parts = [];
    var dl = tile.l - tile.ideal.l;
    var dc = tile.c - tile.ideal.c;
    if (Math.abs(dl) >= 0.0005) parts.push('lightness ' + formatShift(dl));
    if (Math.abs(dc) >= 0.0005) parts.push('chroma ' + formatShift(dc));
    return 'Shifted to fit the sRGB gamut:\n' + parts.join(', ');
  }

  function formatShift(val) {
    return (val > 0 ? '+' : '') + val.toFixed(3);
  }

  function selectTile(i, color) {
    if (selectedTile == i && picker.visible()) {
      picker.hide();
    } else {
      selectedTile = i;
      picker.setColor(getTileEditColor(scheme, i) || color);
      if (!picker.visible()) picker.toggle();
    }
    render();
  }

  function togglePaletteMenu() {
    if (paletteMenu.visible()) {
      hidePaletteMenu();
    } else {
      renderPaletteMenu();
      paletteMenu.show();
    }
  }

  function hidePaletteMenu() {
    paletteMenu.hide();
  }

  function renderPaletteMenu() {
    paletteMenu.empty();
    addPaletteItem('Custom', getSchemeColors(makeSchemeCustom(scheme)), !scheme.preset, function() {
      changeScheme(makeSchemeCustom(scheme));
    });
    getSequentialPresetNames().forEach(function(name) {
      addPaletteItem(name, getPresetColors(name, 7), scheme.preset == name, function() {
        changeScheme(choosePreset(scheme, name));
      });
    });
  }

  function addPaletteItem(name, colors, selected, onSelect) {
    var item = El('div').addClass('color-scheme-palette-item').attr('role', 'button')
      .classed('selected', selected).appendTo(paletteMenu)
      .on('click', function() {
        hidePaletteMenu();
        onSelect();
      });
    El('div').addClass('color-scheme-strip').appendTo(item)
      .css('background-image', getStripBackground(colors));
    El('span').appendTo(item).text(name);
  }

  function updateScheme(changes) {
    changeScheme(Object.assign({}, scheme, changes));
  }

  function changeScheme(next) {
    var prevN = scheme.n;
    scheme = next;
    if (scheme.n != prevN) {
      picker.hide();
      selectedTile = -1;
    }
    apply();
    render();
  }

  function apply() {
    var lyr = targetLayer;
    var colors = getSchemeColors(scheme);
    var applied = Object.assign({}, scheme, {colors: colors});
    var cmd, extra;
    if (!lyr || !scheme.field || !gui.console) return;
    getSession();
    if (!session || !session.isPending()) {
      sessionLayer = lyr;
      baseScheme = getLayerScheme(lyr);
    }
    cmd = formatSchemeCommand(scheme, colors, {target: getTargetOption(lyr)});
    extra = opts.getExtraCommands ? opts.getExtraCommands() : '';
    if (extra) cmd += ' ' + extra;
    runGuiEditCommand(gui, cmd, {
      title: 'Color scheme',
      session: session,
      onDone: function(err) {
        if (!err) setLayerScheme(lyr, applied);
        opts.onUpdate();
      }
    });
  }

  // The scheme on each side of the session's undo state, to go with the fills
  // that undo and redo put back.
  function onCommit() {
    var lyr = sessionLayer;
    var before = baseScheme;
    var after = lyr ? getLayerScheme(lyr) : null;
    if (!lyr) return null;
    return {
      onUndo: function() {
        setLayerScheme(lyr, before);
      },
      onRedo: function() {
        setLayerScheme(lyr, after);
      }
    };
  }

  function getTargetOption(lyr) {
    var active = gui.model.getActiveLayer();
    if (active && active.layer == lyr) return '';
    return internal.formatOptionValue(internal.getLayerTargetId(gui.model, lyr));
  }

  function releaseFocus() {
    releasePanelFocus(panel.node());
  }
}

// A row of hard-edged color blocks, as a CSS background
export function getStripBackground(colors) {
  var n = colors.length;
  var stops = colors.map(function(color, i) {
    return color + ' ' + (i / n * 100) + '%, ' + color + ' ' + ((i + 1) / n * 100) + '%';
  });
  return 'linear-gradient(to right, ' + stops.join(', ') + ')';
}
