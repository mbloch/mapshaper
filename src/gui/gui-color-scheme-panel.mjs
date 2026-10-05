import { El } from './gui-el';
import { ColorPicker } from './gui-color-picker';
import { claimFieldKeys, isTextInput, opensAMenu, releasePanelFocus } from './gui-panel-focus';
import { SizeField } from './gui-size-field';
import { runGuiEditCommand } from './gui-edit-command';
import { makeColorRow, makePanelToggle, makePanelActionButton, setPanelButtonDisabled } from './gui-panel-controls';
import { ClassBreaksDialog } from './gui-class-breaks-dialog';
import { formatSchemeCPT, formatSchemeJSON, getSchemeExportFileName } from './gui-color-scheme-export';
import { ColorSchemeImportDialog } from './gui-color-scheme-import-dialog';
import { importColorPalette } from './gui-color-scheme-import';
import { saveBlobToLocalFile } from './gui-save';
import { isNytUser } from './gui-nyt';
import { internal } from './gui-core';
import {
  schemeTypes, maxCategoricalColors,
  getPresetGroups, getDefaultSchemeOfType, getSchemeColors,
  getPresetMenuColors, getCategoricalPresetColors, getSchemeMethods, setSchemeField, setSchemeMethod,
  choosePreset, makeSchemeCustom, setTileColor, clearTileColor, setTileCount, reverseScheme,
  getSchemeVibrance, setSchemeVibrance, setSchemeLongHue, getSchemeTiles, getTileEditColor, maxVibrance,
  formatSchemeCommand, getAppliedColors, getNumericFields, getCategoryFields, getCategories,
  getSwatchCategories, getCategoricalPalette, moveSwatch, shuffleScheme,
  getSchemeNullColor, setSchemeNullColor, getNoDataCount,
  pivotOptions, divergingSplits, updateDivergingLayout, getDivergingTileUse,
  getDivergingClassRanges, getSequentialClassRanges, getPivotSummary, setSchemePivot, setSchemeNeutral, setSchemeSplit,
  getCenterTile, getSchemeNeutral, isContinuousScheme, setSchemeContinuous, getContinuousTileStops,
  getContinuousSegments, getAppliedScheme,
  hasSchemeRange, getDisplayRange, setSchemeRangeEnd, resetSchemeRange,
  getRangeStripColors,
  getLayerScheme, setLayerScheme
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
// opts.onUpdate()          the scheme or the fills changed
// opts.onClose()           the panel was closed
var reverseIcon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M2 4.5h9.5M9 2l2.5 2.5L9 7"/><path d="M12 9.5H2.5M5 7L2.5 9.5 5 12"/></svg>';
var shuffleIcon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M1.5 3.5h2.2c1.4 0 2.3.7 3 2l1.6 3c.7 1.3 1.6 2 3 2h1.2"/>' +
  '<path d="M1.5 10.5h2.2c1.2 0 2-.5 2.6-1.4M8.2 4.9c.6-.9 1.4-1.4 2.6-1.4h1.7"/>' +
  '<path d="M11 1.5l1.7 2-1.7 2M11 8.5l1.7 2-1.7 2"/></svg>';
var longHueIcon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M11.5 4.6A5 5 0 1 0 12 7"/><path d="M12 1.8v3h-3"/></svg>';
var continuousIcon = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
  '<defs><linearGradient id="color-scheme-continuous-icon">' +
  '<stop offset="0" stop-color="currentColor" stop-opacity="0"/>' +
  '<stop offset="1" stop-color="currentColor"/></linearGradient></defs>' +
  '<rect x="1.5" y="3.5" width="11" height="7" rx="1.5" fill="url(#color-scheme-continuous-icon)" ' +
  'stroke="currentColor" stroke-width="1.2"/></svg>';

export function ColorSchemePanel(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel color-scheme-panel').appendTo(parent).hide();
  var session = null; // made on first use: the console is made after the panel
  var targetLayer = null;
  var scheme = null;
  var sessionLayer = null; // the layer the session's edits are to
  var baseScheme = null; // its scheme when they began
  var selectedTile = -1;
  // the scheme last used on each tab while the panel is open, for switching back
  var tabSchemes = {};
  var tabs = {};
  var paletteBtn, paletteMenu, countField, tileRow, gradientEl, tilesEl, picker, fieldRow, fieldSelect, methodSelect,
      methodRow, methodLabel, customizeCell, customizeBtn, breaksDialog, exportBtns, importBtn, importDialog,
      noFieldsNote, controlsEl, vibranceRow, vibranceInput,
      longHueBtn, continuousBtn, reverseBtn, shuffleBtn, dropMarker, nullControl, nullCount, countLabel,
      rangeEl, rangeStrip, rangeShades, rangeHandles,
      divergingEl, pivotSelect, pivotInput, pivotNote, neutralToggle, splitSelect;
  // set while a tile is being dragged, so that letting go isn't a click
  var tileDrag = null;

  initPanel();

  gui.on('undo_redo_post', function() {
    var restored;
    if (!targetLayer) return;
    restored = getLayerScheme(targetLayer);
    if (restored) {
      scheme = updateDivergingLayout(restored, targetLayer);
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
    tabSchemes = {};
    scheme = getLayerScheme(lyr);
    panel.show();
    if (scheme) {
      scheme = updateDivergingLayout(scheme, lyr);
    } else {
      fields = getNumericFields(lyr);
      scheme = getDefaultSchemeOfType(fields.length > 0 ? 'sequential' : 'categorical', lyr);
      if (canApply(scheme)) apply();
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
    nullControl.picker.hide();
    hidePaletteMenu();
    breaksDialog.close();
    importDialog.close();
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
    El('span').appendTo(header).text('Color palettes');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', function() {
      close();
      opts.onUpdate();
    });

    var tabRow = El('div').addClass('label-style-row color-scheme-tabs').attr('role', 'tablist').appendTo(panel);
    schemeTypes.forEach(function(type) {
      tabs[type.name] = El('button').addClass('color-scheme-tab').attr('type', 'button')
        .attr('role', 'tab').text(type.label).appendTo(tabRow)
        .on('click', function() {
          switchType(type.name);
        });
    });

    noFieldsNote = El('div').addClass('label-style-row color-scheme-note').appendTo(panel)
      .text('This layer has no numeric fields to classify.');
    controlsEl = El('div').appendTo(panel);

    fieldRow = El('div').addClass('label-style-row color-scheme-select-row').appendTo(controlsEl);
    El('span').appendTo(fieldRow).text('Field');
    fieldSelect = El('select').attr('aria-label', 'Data field').appendTo(fieldRow).on('change', function() {
      var field = fieldSelect.node().value;
      changeScheme(setSchemeField(scheme, field, getCategoryCount(field)));
    });

    // numeric schemes: the breaks' method on the left, the button for
    // editing them on the right
    methodRow = El('div').addClass('label-style-row').appendTo(controlsEl);
    var methodCell = El('div').addClass('label-split-cell color-scheme-select-row').appendTo(methodRow);
    customizeCell = El('div').addClass('label-split-cell color-scheme-customize-cell').appendTo(methodRow);
    methodLabel = El('span').appendTo(methodCell).text('Method');
    methodSelect = El('select').attr('aria-label', 'Classification method').appendTo(methodCell).on('change', function() {
      var field = scheme.field || getCategoryFields(targetLayer)[0];
      changeScheme(setSchemeMethod(scheme, methodSelect.node().value, field, getCategoryCount(field)));
    });
    customizeBtn = makePanelActionButton(customizeCell, 'Customize', function() {
      if (breaksDialog.isOpen()) {
        breaksDialog.close();
      } else {
        picker.hide();
        importDialog.close();
        breaksDialog.open();
      }
      renderMethodRow();
    }).addClass('color-scheme-customize-btn').attr('title', 'Edit the class breaks');
    breaksDialog = new ClassBreaksDialog(gui, {
      getScheme: function() { return scheme; },
      getLayer: function() { return targetLayer; },
      onChange: changeScheme,
      onClose: renderMethodRow
    });

    initDivergingControls();

    var paletteRow = El('div').addClass('label-style-row label-split-row').appendTo(controlsEl);
    var paletteCell = El('div').addClass('label-split-cell color-scheme-palette-cell').appendTo(paletteRow);
    var countCell = El('div').addClass('label-split-cell').appendTo(paletteRow);
    El('span').appendTo(paletteCell).text('Palette');
    paletteBtn = El('div').addClass('color-scheme-palette-btn').attr('role', 'button')
      .attr('aria-label', 'Palette').appendTo(paletteCell).on('click', togglePaletteMenu);
    paletteMenu = El('div').addClass('color-scheme-palette-menu').appendTo(paletteCell).hide();
    countLabel = El('span').appendTo(countCell).text('Colors');
    // the scheme sets the limits (see getMinSchemeColors(), getMaxSchemeColors())
    countField = new SizeField(countCell, {
      min: 1,
      max: maxCategoricalColors,
      step: 1,
      bigStep: 2,
      decimals: 0,
      title: 'Number of classes',
      onSet: function(n) {
        changeScheme(setTileCount(scheme, n, getCategoryCount(), targetLayer));
      },
      onStep: function(delta) {
        changeScheme(setTileCount(scheme, scheme.n + (delta > 0 ? 1 : -1), getCategoryCount(), targetLayer));
      },
      onDone: releaseFocus
    });

    tileRow = El('div').addClass('color-scheme-tile-row').appendTo(controlsEl);
    gradientEl = El('div').addClass('color-scheme-gradient').appendTo(tileRow);
    tilesEl = El('div').addClass('color-scheme-tiles').appendTo(tileRow);
    picker = new ColorPicker(tileRow, {
      presetRows: [],
      onPreview: function(hex) {
        var tile = getTileCells()[selectedTile];
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
    initRangeControl(vibranceRow);
    longHueBtn = addIconButton(vibranceRow, 'Go the long way around the color wheel', longHueIcon, function() {
      changeScheme(setSchemeLongHue(scheme, !scheme.longHue));
    }).addClass('long-hue-btn');
    continuousBtn = addIconButton(vibranceRow, 'Continuous colors (unclassed)', continuousIcon, function() {
      changeScheme(setSchemeContinuous(scheme, !scheme.continuous));
    }).addClass('continuous-btn');
    reverseBtn = addIconButton(vibranceRow, 'Reverse the colors', reverseIcon, function() {
      changeScheme(reverseScheme(scheme));
    });
    shuffleBtn = addIconButton(vibranceRow, 'Shuffle the colors', shuffleIcon, function() {
      changeScheme(shuffleScheme(scheme));
    });
    // the color of features with no data, and how many there are
    nullControl = makeColorRow(controlsEl, {
      label: 'No data',
      noOpacity: true,
      onColor: function(color) {
        changeScheme(setSchemeNullColor(scheme, color));
      }
    });
    nullControl.row.addClass('color-scheme-null-row');
    nullControl.chit.on('click', function() {
      picker.hide();
    });
    nullCount = El('span').addClass('color-scheme-note color-scheme-null-count').appendTo(nullControl.aside);
    // import on the left; on the right, a file for each export format, so
    // that there is no format to choose first
    var exportRow = El('div').addClass('label-style-row color-scheme-export-row').appendTo(controlsEl);
    importBtn = makePanelActionButton(exportRow, 'Import', function() {
      if (importDialog.isOpen()) {
        importDialog.close();
      } else {
        picker.hide();
        breaksDialog.close();
        importDialog.open();
      }
      renderImportButton();
    }).attr('title', 'Use a palette from a GMT (.cpt) or JSON file, or a list of colors');
    importDialog = new ColorSchemeImportDialog(gui, {
      onImport: importPalette,
      onClose: renderImportButton
    });
    El('span').addClass('color-scheme-export-label').appendTo(exportRow).text('Export');
    exportBtns = [
      makePanelActionButton(exportRow, 'GMT', function() { exportScheme('cpt'); })
        .attr('title', 'Save the classes and colors as a GMT color palette table (.cpt)'),
      makePanelActionButton(exportRow, 'JSON', function() { exportScheme('json'); })
        .attr('title', 'Save the classes and colors as JSON, with a MapLibre style expression')
    ];
    document.addEventListener('mousedown', function(e) {
      if (paletteMenu.visible() && !paletteMenu.node().contains(e.target) &&
          !paletteBtn.node().contains(e.target)) {
        hidePaletteMenu();
      }
    });
  }

  // The pivot, the pivot class and how the classes are split between the
  // sides
  function initDivergingControls() {
    divergingEl = El('div').appendTo(controlsEl);
    var pivotRow = El('div').addClass('label-style-row label-split-row').appendTo(divergingEl);
    var pivotCell = El('div').addClass('label-split-cell color-scheme-select-row').appendTo(pivotRow);
    var valueCell = El('div').addClass('label-split-cell color-scheme-select-row').appendTo(pivotRow);
    El('span').appendTo(pivotCell).text('Pivot');
    pivotSelect = El('select').attr('aria-label', 'Pivot').appendTo(pivotCell).on('change', function() {
      var name = pivotSelect.node().value;
      var current = scheme.layout ? scheme.layout.pivot : 0;
      changeScheme(setSchemePivot(scheme, name == 'value' ? current : name));
    });
    pivotOptions.forEach(function(item) {
      El('option').attr('value', item.name).text(item.label).appendTo(pivotSelect);
    });
    El('span').appendTo(valueCell).text('Value');
    pivotInput = El('input').attr('type', 'text').attr('aria-label', 'Pivot value')
      .addClass('color-scheme-pivot-input').appendTo(valueCell)
      .on('change', function() {
        var val = parseFloat(pivotInput.node().value);
        if (isFinite(val)) {
          changeScheme(setSchemePivot(scheme, val));
        } else {
          render();
        }
      })
      .on('keydown', function(e) {
        if (e.key == 'Enter') pivotInput.node().blur();
      });
    pivotNote = El('div').addClass('label-style-row color-scheme-note').appendTo(divergingEl);

    var optionRow = El('div').addClass('label-style-row label-split-row').appendTo(divergingEl);
    var splitCell = El('div').addClass('label-split-cell color-scheme-select-row').appendTo(optionRow);
    var neutralCell = El('div').addClass('label-split-cell color-scheme-select-row').appendTo(optionRow);
    var neutralLabel = El('span').addClass('color-scheme-hint-label').appendTo(neutralCell).text('Pivot class')
      .attr('data-tooltip', 'A class around the pivot, in the center color')
      .on('mouseenter', function() { keepTooltipInWindow(neutralLabel.node()); });
    var neutralLine = El('div').addClass('color-scheme-toggle-line').appendTo(neutralCell);
    neutralToggle = makePanelToggle(neutralLine, {
      title: 'Pivot class',
      onChange: function(on) {
        changeScheme(setSchemeNeutral(scheme, on));
      }
    });
    El('span').appendTo(splitCell).text('Sides');
    splitSelect = El('select').attr('aria-label', 'Classes on each side').appendTo(splitCell).on('change', function() {
      changeScheme(setSchemeSplit(scheme, splitSelect.node().value));
    });
    divergingSplits.forEach(function(item) {
      El('option').attr('value', item.name).text(item.label).appendTo(splitSelect);
    });
  }

  function renderDivergingControls() {
    var diverging = scheme.type == 'diverging';
    var pivot = scheme.pivot;
    var option = typeof pivot == 'number' ? 'value' : pivot;
    var summary;
    divergingEl.classed('hidden', !diverging);
    if (!diverging) return;
    pivotSelect.node().value = option;
    pivotInput.node().disabled = option != 'value';
    if (document.activeElement != pivotInput.node()) {
      pivotInput.node().value = scheme.layout ? formatNumber(scheme.layout.pivot) : '';
    }
    summary = getPivotSummary(scheme, targetLayer);
    pivotNote.text(summary ? formatCount(summary.below) + ' below the pivot, ' +
      summary.above + ' at or above' : 'No numeric data to classify.');
    neutralToggle.setState(getSchemeNeutral(scheme) ? 'on' : 'off');
    splitSelect.node().value = scheme.split;
  }

  function formatCount(n) {
    return n + (n == 1 ? ' feature' : ' features');
  }

  function formatNumber(val) {
    return String(+val.toPrecision(6));
  }

  function render() {
    var categorical, fields, colors, tiles;
    if (!targetLayer || !scheme) return;
    categorical = scheme.type == 'categorical';
    Object.keys(tabs).forEach(function(type) {
      tabs[type].classed('selected', type == scheme.type)
        .attr('aria-selected', type == scheme.type ? 'true' : 'false');
    });
    fields = categorical ? getCategoryFields(targetLayer) : getNumericFields(targetLayer);
    noFieldsNote.classed('hidden', categorical || fields.length > 0);
    controlsEl.classed('hidden', !categorical && fields.length === 0);
    if (!categorical && fields.length === 0) {
      breaksDialog.close();
      return;
    }
    renderFieldOptions(fields);
    fieldRow.classed('hidden', scheme.method == 'non-adjacent');
    renderMethodOptions(fields);
    renderDivergingControls();
    countLabel.text(scheme.type != 'diverging' ? 'Colors' : scheme.split == 'count' ? 'Per side' : 'Classes');
    countField.setValue(String(scheme.n));
    tiles = getSchemeTiles(scheme);
    colors = tiles.map(function(tile) { return tile.color; });
    renderPaletteButton(colors);
    renderTiles(tiles);
    renderVibrance();
    renderNullColor();
    renderExportButtons();
    if (categorical) breaksDialog.close();
    breaksDialog.update();
  }

  // non-adjacent colors have no classes to export
  function renderExportButtons() {
    var disabled = scheme.method == 'non-adjacent' || !canApply(scheme);
    exportBtns.forEach(function(btn) { setPanelButtonDisabled(btn, disabled); });
  }

  function renderImportButton() {
    importBtn.classed('selected', importDialog.isOpen());
  }

  // An imported scheme of another type goes on its own tab, and the tab it
  // came from keeps its scheme
  function importPalette(text) {
    var result = importColorPalette(text, scheme, targetLayer);
    if (result.scheme.type != scheme.type) tabSchemes[scheme.type] = scheme;
    picker.hide();
    selectedTile = -1;
    // a palette without a no-data color keeps the panel's
    changeScheme(Object.assign({nullColor: scheme.nullColor}, result.scheme));
    return result.note;
  }

  function exportScheme(ext) {
    var text = ext == 'cpt' ? formatSchemeCPT(scheme, targetLayer) : formatSchemeJSON(scheme, targetLayer);
    if (!text) return;
    saveBlobToLocalFile(getSchemeExportFileName(targetLayer, scheme, ext),
      new Blob([text], {type: ext == 'json' ? 'application/json' : 'text/plain'}));
  }

  function renderNullColor() {
    var count = getNoDataCount(targetLayer, scheme);
    nullControl.row.classed('hidden', scheme.method == 'non-adjacent');
    if (scheme.method == 'non-adjacent') nullControl.picker.hide();
    nullControl.showColor(getSchemeNullColor(scheme));
    nullCount.text(count === 0 ? 'None in this layer' : formatCount(count));
  }

  function renderMethodOptions(fields) {
    methodSelect.empty();
    getSchemeMethods(scheme).forEach(function(item) {
      var opt = El('option').attr('value', item.name).text(item.label).appendTo(methodSelect);
      // classifying by category needs a field
      if (item.name == 'categorical' && fields.length === 0) opt.attr('disabled', true);
    });
    // edited breaks; choosing a method starts over with its breaks
    if (scheme.method == 'breaks') {
      El('option').attr('value', 'breaks').text('Custom').appendTo(methodSelect);
    }
    methodSelect.node().value = scheme.method;
    renderMethodRow();
  }

  function renderMethodRow() {
    var numeric = scheme && scheme.type != 'categorical';
    methodRow.classed('label-split-row', numeric);
    methodLabel.text(numeric ? 'Breaks' : 'Method');
    methodSelect.attr('aria-label', numeric ? 'Class breaks' : 'Classification method');
    customizeCell.classed('hidden', !numeric);
    customizeBtn.classed('selected', breaksDialog.isOpen());
  }

  // Each tab keeps its own scheme while the panel is open, and starts from a
  // default the first time
  function switchType(type) {
    var next;
    if (type == scheme.type) return;
    tabSchemes[scheme.type] = scheme;
    next = tabSchemes[type] || getDefaultSchemeOfType(type, targetLayer);
    // one no-data color for both tabs
    next = updateDivergingLayout(Object.assign({}, next, {nullColor: scheme.nullColor}), targetLayer);
    picker.hide();
    selectedTile = -1;
    scheme = next;
    if (canApply(scheme)) apply();
    render();
  }

  // a diverging scheme needs data that its classes can divide
  function canApply(s) {
    if (s.type == 'diverging' && !s.layout) return false;
    return s.method == 'non-adjacent' || !!s.field;
  }

  // The number of categories in a field (the scheme's, by default), for a
  // categorical scheme
  function getCategoryCount(field) {
    if (scheme.type != 'categorical') return -1;
    return getCategories(targetLayer, field || scheme.field).length;
  }

  function addSliderRow(label, tooltip, min, max, step, onInput) {
    var row = El('div').addClass('label-style-row color-scheme-slider-row').appendTo(controlsEl);
    var labelEl = El('span').addClass('color-scheme-slider-label').attr('data-tooltip', tooltip)
      .appendTo(row).text(label)
      .on('mouseenter', function() { keepTooltipInWindow(labelEl.node()); });
    var input = El('input').attr('type', 'range').attr('min', min).attr('max', max).attr('step', step)
      .attr('aria-label', label).appendTo(row)
      .on('input', function() {
        showSliderFill(input);
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

  // The part of a preset that the tiles are taken from: a strip of the whole
  // ramp, shaded outside the part in use, with a handle at each end of it
  function initRangeControl(row) {
    var label = El('span').addClass('color-scheme-hint-label color-scheme-range-part')
      .attr('data-tooltip', 'Use part of the color ramp\n(double-click the strip to use all of it)')
      .appendTo(row).text('Range')
      .on('mouseenter', function() { keepTooltipInWindow(label.node()); });
    rangeEl = El('div').addClass('color-scheme-range color-scheme-range-part').appendTo(row)
      .on('pointerdown', startRangeDrag)
      .on('dblclick', function() {
        changeScheme(resetSchemeRange(scheme));
      });
    rangeStrip = El('div').addClass('color-scheme-range-strip').appendTo(rangeEl);
    rangeShades = ['left', 'right'].map(function(side) {
      return El('div').addClass('color-scheme-range-shade ' + side).appendTo(rangeEl);
    });
    rangeHandles = ['left', 'right'].map(function(side) {
      return El('div').addClass('color-scheme-range-handle').attr('role', 'slider').attr('tabindex', '0')
        .attr('aria-label', side == 'left' ? 'Start of range' : 'End of range')
        .attr('aria-valuemin', '0').attr('aria-valuemax', '100')
        .appendTo(rangeEl)
        .on('keydown', function(e) {
          onRangeKey(e, side);
        });
    });
  }

  function renderRange() {
    var display, colors;
    if (!hasSchemeRange(scheme)) return;
    display = getDisplayRange(scheme);
    colors = getRangeStripColors(scheme, 33);
    rangeStrip.css('background-image', 'linear-gradient(to right, ' + colors.join(', ') + ')');
    rangeShades[0].css('width', pct(display[0]));
    rangeShades[1].css('width', pct(1 - display[1]));
    rangeHandles.forEach(function(handle, i) {
      handle.css('left', pct(display[i])).attr('aria-valuenow', String(Math.round(display[i] * 100)));
    });
  }

  function pct(val) {
    return round(val * 100) + '%';
  }

  // Dragging a handle (or pressing the strip, which takes the nearer handle
  // there) moves that end of the range
  function startRangeDrag(e) {
    var box = rangeStrip.node().getBoundingClientRect();
    var display = getDisplayRange(scheme);
    var pos = getPos(e);
    var side = e.target == rangeHandles[0].node() ? 'left' :
      e.target == rangeHandles[1].node() ? 'right' :
      Math.abs(pos - display[0]) <= Math.abs(pos - display[1]) ? 'left' : 'right';
    if (e.button !== 0 || !(box.width > 0)) return;
    e.preventDefault();
    picker.hide();
    move(e);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);

    // in steps of half a percent, so that a drag runs fewer commands
    function getPos(e) {
      return Math.round((e.clientX - box.left) / box.width * 200) / 200;
    }

    function move(e) {
      var next = setSchemeRangeEnd(scheme, side, getPos(e));
      if (getDisplayRange(next).join() != getDisplayRange(scheme).join()) changeScheme(next);
    }

    function finish() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
    }
  }

  function onRangeKey(e, side) {
    var step = e.shiftKey ? 0.05 : 0.01;
    var display = getDisplayRange(scheme);
    var pos = side == 'left' ? display[0] : display[1];
    if (e.key == 'ArrowLeft' || e.key == 'ArrowDown') {
      pos -= step;
    } else if (e.key == 'ArrowRight' || e.key == 'ArrowUp') {
      pos += step;
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    changeScheme(setSchemeRangeEnd(scheme, side, pos));
  }

  // Presets and categorical schemes have no interpolated tiles for vibrance
  // or the hue path to change; the row keeps only the reverse button for them,
  // and for sequential and diverging presets, the range.
  function renderVibrance() {
    var vibrance = getSchemeVibrance(scheme);
    setSliderValue(vibranceInput, Math.round(vibrance * 1000));
    vibranceRow.classed('preset', !!scheme.preset || scheme.type == 'categorical');
    vibranceRow.classed('ranged', hasSchemeRange(scheme));
    renderRange();
    reverseBtn.classed('hidden', scheme.type == 'categorical');
    shuffleBtn.classed('hidden', scheme.type != 'categorical');
    // each half of a diverging ramp runs from a low-chroma center, where the
    // hue path makes little difference
    longHueBtn.classed('hidden', scheme.type == 'diverging')
      .classed('selected', !!scheme.longHue)
      .attr('aria-pressed', scheme.longHue ? 'true' : 'false');
    continuousBtn.classed('hidden', scheme.type == 'categorical')
      .classed('selected', isContinuousScheme(scheme))
      .attr('aria-pressed', isContinuousScheme(scheme) ? 'true' : 'false');
  }

  function setSliderValue(input, val) {
    if (input.node().value != val) input.node().value = val;
    showSliderFill(input);
  }

  // the track is filled up to the center of the handle, which travels the
  // track's width less its 12px box (see page.css)
  function showSliderFill(input) {
    var el = input.node();
    var min = +el.min, max = +el.max;
    var fill = max > min ? (el.value - min) / (max - min) : 0;
    el.style.setProperty('--fill', 'calc(6px + (100% - 12px) * ' + round(fill * 1000) / 1000 + ')');
  }

  function renderFieldOptions(fields) {
    fieldSelect.empty();
    fields.forEach(function(field) {
      El('option').attr('value', field).text(field).appendTo(fieldSelect);
    });
    fieldSelect.node().value = scheme.field || '';
  }

  function renderPaletteButton(colors) {
    paletteBtn.empty();
    El('div').addClass('color-scheme-strip').appendTo(paletteBtn)
      .css('background-image', isContinuousScheme(scheme) ?
        getGradientStripBackground(scheme) : getStripBackground(colors));
    El('span').addClass('color-scheme-palette-name').appendTo(paletteBtn)
      .text(scheme.preset || 'Custom');
  }

  function renderTiles(tiles) {
    var categorical = scheme.type == 'categorical';
    var diverging = scheme.type == 'diverging';
    var continuous = isContinuousScheme(scheme);
    var used = tiles.length;
    var tileUse = diverging ? getDivergingTileUse(scheme) : null;
    var center = getCenterTile(scheme);
    var classLabels = categorical ? null : continuous ? getStopLabels() : getClassLabels(tileUse);
    var groups = categorical && scheme.method == 'categorical' ?
      getSwatchCategories(getCategories(targetLayer, scheme.field), used) : null;
    var n, perRow;
    // a categorical scheme shows its whole palette, and marks the swatches
    // in use
    if (categorical) {
      tiles = getCategoricalPalette(scheme).map(function(color) {
        return {color: color, pinned: false, adjusted: false};
      });
    }
    n = tiles.length;
    // the stops of a continuous ramp stay in one row, under the gradient
    perRow = n > 12 && !continuous ? Math.ceil(n / 2) : n;
    tilesEl.empty();
    tilesEl.classed('two-rows', perRow < n);
    tilesEl.classed('continuous', continuous);
    tilesEl.node().style.setProperty('--tiles-per-row', perRow);
    dropMarker = El('div').addClass('color-scheme-drop-marker').appendTo(tilesEl).hide();
    tiles.forEach(function(tile, i) {
      var color = tile.color;
      var inUse = tileUse ? tileUse[i] : !categorical || i < used;
      var cell = El('div').addClass('color-scheme-tile-cell').appendTo(tilesEl);
      var tileEl = El('div').addClass('color-scheme-tile').attr('role', 'button')
        .attr('aria-label', 'Color ' + (i + 1) + ': ' + color + (inUse ? '' : ' (not used)'))
        .classed('selected', i == selectedTile)
        .css('background-color', color)
        .appendTo(cell)
        .on('click', function() {
          if (tileDrag && tileDrag.moved) return;
          selectTile(i, color);
        });
      if (categorical) {
        tileEl.on('pointerdown', function(e) {
          startTileDrag(e, i);
        });
      }
      if (groups && inUse || classLabels && classLabels[i]) {
        tileEl.attr('data-tooltip', groups ? formatCategories(groups[i]) : classLabels[i])
          .on('mouseenter', function() { keepTooltipInWindow(tileEl.node()); });
      }
      if (diverging && !continuous) {
        // the bar under the tiles that classes use; a gap at the center
        // when there is no pivot class (continuous ramps have the gradient)
        El('div').addClass('color-scheme-bar').appendTo(cell)
          .classed('used', inUse)
          .classed('joined', inUse && i < n - 1 && tileUse[i + 1]);
      }
      var pin = El('div').addClass('color-scheme-pin').appendTo(cell)
        .on('mouseenter', function() { keepTooltipInWindow(pin.node()); });
      var end = i === 0 || i == n - 1 || i == center;
      if (categorical) {
        // a bar under the swatches in use, unbroken to the end of each row
        pin.classed('used', inUse)
          .classed('joined', inUse && i < used - 1 && (i + 1) % perRow > 0);
      // a pinned tile between the ends needs its dot for unpinning, even if
      // vibrance was clipped
      } else if (tile.pinned && !end) {
        pin.addClass('pinned').attr('role', 'button').attr('aria-label', 'Unpin this color')
          .attr('data-tooltip', 'Unpin this color')
          .on('click', function() {
            changeScheme(clearTileColor(scheme, i));
          });
      } else if (tile.adjusted) {
        pin.addClass('adjusted').attr('data-tooltip', describeAdjustment(tile));
      }
    });
    renderGradient(continuous ? getContinuousSegments(scheme) : null, n);
  }

  // The gradient over a continuous ramp's tiles, each stop over the center
  // of its tile; one bar per side of a diverging ramp, and one for a pivot
  // class
  function renderGradient(segments, n) {
    var width = tilesEl.node().clientWidth;
    var gap = 3;
    var tileWidth = (width - (n - 1) * gap) / n;
    var center = function(pos) { return pos * (tileWidth + gap) + tileWidth / 2; };
    gradientEl.empty();
    gradientEl.classed('hidden', !segments);
    if (!segments || !(width > 0)) return;
    segments.forEach(function(seg) {
      var left = seg.flatStart ? center(seg.start) - tileWidth / 2 : center(seg.start);
      var right = seg.flatEnd ? center(seg.end) + tileWidth / 2 : center(seg.end);
      var stops = seg.samples.map(function(sample) {
        return sample.color + ' ' + round(center(sample.pos) - left) + 'px';
      });
      if (stops.length == 1) stops.push(stops[0]);
      El('div').addClass('color-scheme-gradient-segment').appendTo(gradientEl).css({
        left: round(left) + 'px',
        width: round(right - left) + 'px',
        'background-image': 'linear-gradient(to right, ' + stops.join(', ') + ')'
      });
    });
  }

  function round(val) {
    return Math.round(val * 10) / 10;
  }

  // The data value at each stop of a continuous ramp, and the range of a
  // pivot class
  function getStopLabels() {
    var stops = getContinuousTileStops(scheme, targetLayer) || [];
    return stops.map(function(stop) {
      if (!stop) return null;
      if (stop.range) return formatClassRange(stop.range);
      return formatNumber(stop.value) + (stop.min ? ' (min)' : stop.max ? ' (max)' : '');
    });
  }

  // The data range of each tile's class, for the tiles that classes use
  // (sequential tiles are all used, one class each)
  function getClassLabels(tileUse) {
    var ranges, j = 0;
    if (scheme.type == 'sequential') {
      ranges = getSequentialClassRanges(scheme, targetLayer) || [];
      return ranges.map(formatClassRange);
    }
    ranges = getDivergingClassRanges(scheme.layout);
    return tileUse.map(function(used) {
      return used ? formatClassRange(ranges[j++]) : null;
    });
  }

  function formatClassRange(range) {
    if (!range) return null;
    if (range[0] == -Infinity && range[1] == Infinity) return 'All values';
    if (range[0] == -Infinity) return 'Below ' + formatNumber(range[1]);
    if (range[1] == Infinity) return formatNumber(range[0]) + ' and above';
    return formatNumber(range[0]) + ' to ' + formatNumber(range[1]);
  }

  // Dragging a categorical swatch moves it to where it's dropped, which may
  // be into or out of the swatches in use
  function startTileDrag(e, from) {
    var x0 = e.clientX, y0 = e.clientY;
    var drag = tileDrag = {from: from, moved: false, before: -1};
    if (e.button !== 0) return;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);

    function onMove(e) {
      if (!drag.moved && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        tilesEl.addClass('dragging');
        getTileCells()[from].classList.add('drag-source');
      }
      drag.before = findDropPlace(e.clientX, e.clientY);
      showDropMarker(drag.before);
    }

    function onUp() {
      var to = drag.before > from ? drag.before - 1 : drag.before;
      finish();
      if (drag.moved && drag.before > -1 && to != from) {
        picker.hide();
        selectedTile = -1;
        changeScheme(moveSwatch(scheme, from, to));
      }
      // the click that follows a drag is ignored, then dragging is over
      setTimeout(function() {
        if (tileDrag == drag) tileDrag = null;
      }, 0);
    }

    function onCancel() {
      finish();
      tileDrag = null;
    }

    function finish() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      tilesEl.removeClass('dragging');
      getTileCells().forEach(function(cell) { cell.classList.remove('drag-source'); });
      dropMarker.hide();
    }
  }

  function getTileCells() {
    return Array.from(tilesEl.node().querySelectorAll('.color-scheme-tile-cell'));
  }

  // The index of the tile that a swatch dropped at (x, y) goes in front of
  // (the number of tiles, after the last), on the row nearest the pointer
  function findDropPlace(x, y) {
    var rects = getTileCells().map(function(cell) {
      return cell.querySelector('.color-scheme-tile').getBoundingClientRect();
    });
    var best = -1, bestDist = Infinity;
    rects.forEach(function(rect, i) {
      var dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      var dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      var dist = dy * 1000 + dx;
      if (dist < bestDist) {
        bestDist = dist;
        best = x < (rect.left + rect.right) / 2 ? i : i + 1;
      }
    });
    return best;
  }

  // A line in the gap where the swatch would go
  function showDropMarker(before) {
    var cells = getTileCells();
    var box = tilesEl.node().getBoundingClientRect();
    var ref = cells[Math.min(before, cells.length - 1)].querySelector('.color-scheme-tile');
    var rect = ref.getBoundingClientRect();
    var left = before < cells.length ? rect.left - 2 : rect.right + 1;
    dropMarker.css({
      left: (left - box.left) + 'px',
      top: (rect.top - box.top) + 'px',
      height: rect.height + 'px'
    }).show();
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

  function formatCategories(values) {
    // "and 1 more" would take a line that the value itself can have
    var max = values.length == 5 ? 5 : 4;
    var labels = values.slice(0, max).map(function(val) {
      return val === '' || val === null || val === undefined ? '(no value)' : String(val);
    });
    if (values.length > max) labels.push('and ' + (values.length - max) + ' more');
    return labels.join('\n');
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
    nullControl.picker.hide();
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
    var categorical = scheme.type == 'categorical';
    paletteMenu.empty();
    addPaletteItem('Custom', getSchemeColors(makeSchemeCustom(scheme)), !scheme.preset, function() {
      changeScheme(makeSchemeCustom(scheme));
    });
    getPresetGroups(scheme.type, {nyt: isNytUser()}).forEach(function(group) {
      El('div').addClass('color-scheme-palette-heading').appendTo(paletteMenu).text(group.source);
      group.names.forEach(function(name) {
        var colors = categorical ? getCategoricalPresetColors(name) : getPresetMenuColors(name);
        addPaletteItem(name, colors, scheme.preset == name, function() {
          changeScheme(choosePreset(scheme, name, getCategoryCount()));
        });
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

  function changeScheme(next) {
    var prevSize = getSchemeTiles(scheme).length;
    scheme = updateDivergingLayout(next, targetLayer);
    if (getSchemeTiles(scheme).length != prevSize) {
      picker.hide();
      selectedTile = -1;
    }
    apply();
    render();
  }

  function apply() {
    var lyr = targetLayer;
    var applying = scheme;
    var colors = getAppliedColors(scheme, getCategoryCount());
    var cmd, extra;
    if (!lyr || !canApply(scheme) || !gui.console) return;
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
        if (!err) setLayerScheme(lyr, getAppliedScheme(applying, colors, lyr));
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

// A scheme's colors as a CSS background: blocks, or for a continuous scheme,
// its gradients, side by side
export function getSchemeStripBackground(scheme) {
  return isContinuousScheme(scheme) ? getGradientStripBackground(scheme) : getStripBackground(scheme.colors);
}

// Each gradient takes room for its length, from its first stop to its last
// (see getContinuousSegments()), without the flat ends the panel's bar has
// over its end tiles; a pivot class takes a tile's width. Hard edges between
// them.
function getGradientStripBackground(scheme) {
  var segments = getContinuousSegments(scheme);
  var lengths = segments.map(function(seg) {
    return seg.end > seg.start ? seg.end - seg.start : 1;
  });
  var total = lengths.reduce(function(memo, len) { return memo + len; }, 0);
  var offset = 0;
  var stops = [];
  var pct = function(pos) { return (Math.round(pos / total * 10000) / 100) + '%'; };
  if (!(total > 0)) return 'none';
  segments.forEach(function(seg, i) {
    var first = seg.samples[0].color;
    var last = seg.samples[seg.samples.length - 1].color;
    stops.push(first + ' ' + pct(offset));
    seg.samples.forEach(function(sample) {
      stops.push(sample.color + ' ' + pct(offset + sample.pos - seg.start));
    });
    offset += lengths[i];
    stops.push(last + ' ' + pct(offset));
  });
  return 'linear-gradient(to right, ' + stops.join(', ') + ')';
}

// A row of hard-edged color blocks, as a CSS background
export function getStripBackground(colors) {
  var n = colors.length;
  var stops = colors.map(function(color, i) {
    return color + ' ' + (i / n * 100) + '%, ' + color + ' ' + ((i + 1) / n * 100) + '%';
  });
  return 'linear-gradient(to right, ' + stops.join(', ') + ')';
}
