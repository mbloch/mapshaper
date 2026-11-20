import { El } from './gui-el';
import { ColorPicker } from './gui-color-picker';
import { claimFieldKeys, isTextInput, releasePanelFocus } from './gui-panel-focus';
import { getRasterUnitsLabel } from './gui-raster-band-values';
import {
  getSchemeBreaks, setSchemeBreak, getSchemeValues, getBreaksScale, getHistogram, getRoundestNumber,
  getBreakClassSwatches, getBreakClassCounts, formatSchemeCount, isElevationScheme, isBlendedScheme,
  getElevationStopChips, getElevationClassLanes, setElevationChipColor, getClimatePresetNames,
  getSchemeLightness, setSchemeLightness, maxLightness, fitElevationStops, canClassifyElevations,
  setSchemeContinuous, isContinuousScheme, canDeleteElevationStop, deleteElevationStop,
  canAddElevationStop, addElevationStop
} from './gui-color-scheme-model';
import { getContinuousIcon } from './gui-color-scheme-icons';

// A popup beside the color scheme panel for editing a numeric scheme's class
// breaks: a histogram of the field's values with a handle under it at each
// break, and the classes, with a field for each break between them. Editing a break makes the
// scheme's breaks custom (see setSchemeBreak()); the pivot of a diverging
// scheme is shown, but stays where the panel puts it.
//
// Fixed elevations also have their colors here: a chip at each stop, on the
// rule between two classes, whose tiles are gradients from one stop's color
// to the next. A blend has a column of chips and tiles for each preset, and
// presets that share a color share a chip, which recolors all of them. Under
// the table, the selected chip of a ramp has buttons for deleting its stop,
// adding one above it and resetting its color; a blend's has only the reset. A slider
// makes all of a ramp's colors lighter or darker, and the histogram has only
// the land's values (or the sea's).
//
// opts.getScheme(), opts.getLayer()  the scheme and layer being edited
// opts.onChange(scheme)  a break was moved
// opts.onClose()         the dialog was closed
// opts.title             the dialog's title ('Class breaks' by default, or
//                        'Elevations and colors')
// opts.reversed(scheme)  true to list the classes from high to low
var numBins = 40;
// slider positions on each side of the center
var lightnessSteps = 50;

export function ClassBreaksDialog(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel class-breaks-dialog').appendTo(parent).hide();
  var isOpen = false;
  var logScale = false;
  var info = null; // see getSchemeBreaks()
  var scale = null;
  var range = null; // the scale's [min, max]
  var titleEl, chartEl, barsEl, linesEl, handlesEl, minLabel, maxLabel, logToggle, tableEl, noteEl, bodyEl;
  var lightnessRow, lightnessInput, fitBtn, continuousBtn, logLabel;
  var handles = [], lines = [], pivotLine, inputs = [], rules = [], classRows = [], chipBoxes = [];
  var reversed = false; // the table's order, from opts.reversed()
  var drag = null;
  var chipBar, pickerAnchor, picker;
  // the chip being recolored: {i, names (the chip's presets), checked (the
  // ones to recolor)}, or null
  var selected = null;

  initDialog();

  this.open = function() {
    isOpen = true;
    panel.show();
    update();
  };

  this.close = close;

  this.isOpen = function() {
    return isOpen;
  };

  this.update = update;

  function update() {
    var scheme, lyr, values, elevation;
    if (!isOpen) return;
    scheme = opts.getScheme();
    lyr = opts.getLayer();
    info = scheme && lyr ? getSchemeBreaks(scheme, lyr) : null;
    titleEl.text(opts.title || (scheme && isElevationScheme(scheme) ? 'Elevations and colors' : 'Class breaks'));
    if (!info || !isElevationScheme(scheme)) hidePicker();
    noteEl.classed('hidden', !!info);
    bodyEl.classed('hidden', !info);
    if (!info) return;
    elevation = isElevationScheme(scheme);
    logToggle.node().checked = logScale;
    logLabel.classed('hidden', elevation);
    fitBtn.classed('hidden', !elevation);
    renderLightness(scheme);
    // a drag keeps the scale it started with, since moving an end stop of
    // fixed elevations can change the range
    if (!drag) {
      scale = getBreaksScale(info.min, info.max, logScale && !elevation);
      range = [info.min, info.max];
    }
    values = getSchemeValues(scheme, lyr);
    renderHistogram(getHistogram(values, scale, numBins));
    minLabel.text(formatNumber(range[0]));
    maxLabel.text(formatNumber(range[1]));
    renderHandles();
    renderTable();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    stopDrag();
    hidePicker();
    panel.hide();
    if (opts.onClose) opts.onClose();
  }

  function initDialog() {
    claimFieldKeys(panel.node(), {
      revert: renderTable,
      release: function() { releasePanelFocus(panel.node()); }
    });
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    titleEl = El('span').appendTo(header);
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', close);
    noteEl = El('div').addClass('label-style-row color-scheme-note').appendTo(panel)
      .text('There are no breaks to edit.');
    bodyEl = El('div').appendTo(panel);

    chartEl = El('div').addClass('class-breaks-chart').appendTo(bodyEl);
    barsEl = El('div').addClass('class-breaks-bars').appendTo(chartEl);
    linesEl = El('div').addClass('class-breaks-lines').appendTo(chartEl);
    pivotLine = El('div').addClass('class-breaks-pivot').appendTo(linesEl);
    handlesEl = El('div').addClass('class-breaks-handles').appendTo(chartEl);
    var axis = El('div').addClass('class-breaks-axis').appendTo(chartEl);
    minLabel = El('span').appendTo(axis);
    maxLabel = El('span').appendTo(axis);

    // a log scale for other breaks; fitting the stops and continuous colors
    // for fixed elevations
    var logRow = El('div').addClass('label-style-row class-breaks-log-row').appendTo(bodyEl);
    logLabel = El('label').appendTo(logRow);
    logToggle = El('input').attr('type', 'checkbox').appendTo(logLabel).on('change', function() {
      logScale = logToggle.node().checked;
      this.blur();
      update();
    });
    El('span').appendTo(logLabel).text('Log scale');
    // see fitElevationStops()
    fitBtn = El('button').addClass('class-breaks-fit-btn').attr('type', 'button').text('Fit to data')
      .appendTo(logRow)
      .on('click', function() {
        var scheme = opts.getScheme();
        var next = scheme && isElevationScheme(scheme) ? fitElevationStops(scheme, opts.getLayer()) : scheme;
        this.blur();
        if (next != scheme) opts.onChange(next);
      });
    // one preset's colors, or the sea's, can be classes (see canClassifyElevations())
    continuousBtn = El('button').addClass('color-scheme-icon-btn class-breaks-continuous-btn')
      .attr('type', 'button').attr('aria-label', 'Continuous colors (unclassed)')
      .attr('data-tooltip', 'Continuous colors (unclassed)').html(getContinuousIcon())
      .appendTo(logRow)
      .on('click', function() {
        var scheme = opts.getScheme();
        this.blur();
        if (scheme && canClassifyElevations(scheme)) opts.onChange(setSchemeContinuous(scheme, !isContinuousScheme(scheme)));
      });

    // fixed elevations only (see setSchemeLightness()); double-click to reset
    lightnessRow = El('div').addClass('label-style-row color-scheme-slider-row class-breaks-lightness-row')
      .appendTo(bodyEl);
    El('span').addClass('color-scheme-slider-label').appendTo(lightnessRow).text('Lightness');
    lightnessInput = El('input').attr('type', 'range').attr('aria-label', 'Lightness')
      .attr('min', -lightnessSteps).attr('max', lightnessSteps).attr('step', 1)
      .appendTo(lightnessRow)
      .on('input', function() {
        setLightness(+this.value / lightnessSteps * maxLightness);
      })
      .on('dblclick', function() {
        setLightness(0);
      })
      .on('change', function() { this.blur(); });

    tableEl = El('div').addClass('class-breaks-table').appendTo(bodyEl);
    chipBar = El('div').addClass('class-breaks-chip-bar hidden').appendTo(bodyEl);
    // the picker opens beside the dialog, level with its chip (see positionPicker()
    // in gui-color-picker.mjs: 48px below its parent, and against its right side)
    pickerAnchor = El('div').addClass('class-breaks-picker-anchor').appendTo(panel);
    picker = new ColorPicker(pickerAnchor, {
      presetRows: [],
      onPreview: function(hex) {
        var chip = getSelectedChip();
        if (chip) chip.style.backgroundColor = hex;
      },
      onChange: function(hex) {
        var scheme = opts.getScheme();
        if (selected && scheme) opts.onChange(setElevationChipColor(scheme, selected.checked, selected.i, hex));
      },
      onHide: function() {
        selected = null;
        if (isOpen) renderTable();
      }
    });
  }

  function setLightness(lightness) {
    var scheme = opts.getScheme();
    if (!scheme || !isElevationScheme(scheme) || getSchemeLightness(scheme) == lightness) return;
    hidePicker();
    opts.onChange(setSchemeLightness(scheme, lightness));
  }

  function renderLightness(scheme) {
    var el = lightnessInput.node();
    var val = Math.round(getSchemeLightness(scheme) / maxLightness * lightnessSteps);
    lightnessRow.classed('hidden', !isElevationScheme(scheme));
    continuousBtn.classed('hidden', !canClassifyElevations(scheme))
      .classed('selected', isContinuousScheme(scheme));
    if (+el.value != val) el.value = val;
    // see showSliderFill() in gui-color-scheme-panel.mjs
    el.style.setProperty('--fill', 'calc(6px + (100% - 12px) * ' + (val + lightnessSteps) / (2 * lightnessSteps) + ')');
  }

  function renderHistogram(bins) {
    var max = Math.max.apply(null, bins);
    barsEl.empty();
    bins.forEach(function(count) {
      var bar = El('div').addClass('class-breaks-bar').appendTo(barsEl);
      // a bin with any values in it shows, however few
      bar.css('height', count > 0 ? Math.max(count / max * 100, 3) + '%' : '0');
    });
  }

  // a handle for each break, and a line up through the histogram; rebuilt
  // only when the breaks change in number, so that a drag keeps its handle
  function renderHandles() {
    var breaks = info.breaks;
    var pivotPos;
    if (handles.length != breaks.length) {
      handlesEl.empty();
      lines.forEach(function(line) { line.remove(); });
      handles = breaks.map(function(b, i) {
        return El('div').addClass('class-breaks-handle')
          .appendTo(handlesEl)
          .on('pointerdown', function(e) { startDrag(e, i); });
      });
      lines = breaks.map(function() {
        return El('div').addClass('class-breaks-line').appendTo(linesEl);
      });
    }
    breaks.forEach(function(b, i) {
      var left = pct(scale.toPos(b));
      // fixed elevations can have stops outside the range (see getSchemeBreaks())
      var outside = b < range[0] || b > range[1];
      handles[i].css('left', left).classed('hidden', outside)
        .classed('fixed', info.fixed[i]);
      lines[i].css('left', left).classed('fixed', info.fixed[i]).classed('hidden', outside);
    });
    // a pivot inside a pivot class isn't a break, but marks where the class's edges can go
    pivotPos = info.neutral ? scale.toPos(info.pivot) : -1;
    pivotLine.classed('hidden', pivotPos < 0).css('left', pct(Math.max(pivotPos, 0)));
  }

  // The classes from low to high (or high to low), a color tile and the number of features (or
  // share of pixels) in each, stacked; a rule across the boundary between two classes runs out to
  // the field with the break's value (see .class-breaks-list in page.css)
  function renderTable() {
    var breaks = info ? info.breaks : [];
    var scheme = opts.getScheme();
    var elevation = !!scheme && isElevationScheme(scheme);
    var nextReversed = !!scheme && !!opts.reversed && opts.reversed(scheme);
    var swatches, counts;
    tableEl.classed('elevation', elevation);
    tableEl.classed('blended', elevation && isBlendedScheme(scheme));
    tableEl.node().style.setProperty('--class-breaks-columns',
      elevation && isBlendedScheme(scheme) ? getClimatePresetNames().length : 1);
    if (inputs.length != breaks.length || classRows.length != breaks.length + 1 || reversed != nextReversed) {
      reversed = nextReversed;
      tableEl.empty();
      var list = El('div').addClass('class-breaks-list').appendTo(tableEl);
      classRows = breaks.concat([null]).map(function() {
        var row = El('div').addClass('class-breaks-class');
        El('div').addClass('class-breaks-swatch').appendTo(row);
        El('span').addClass('class-breaks-count').appendTo(row);
        return row;
      });
      inDisplayOrder(classRows).forEach(function(row) { row.appendTo(list); });
      rules = [];
      var marks = breaks.map(function(b, i) {
        var pos = reversed ? breaks.length - i : i + 1;
        return El('div').addClass('class-breaks-mark')
          .css('top', 'calc((var(--class-breaks-row-height) + var(--class-breaks-gap)) * ' + pos + ' - 13px)');
      });
      // appended in display order, so that Tab moves down the list
      inDisplayOrder(marks).forEach(function(mark) { mark.appendTo(list); });
      chipBoxes = marks.map(function(mark) {
        return El('div').addClass('class-breaks-chips').appendTo(mark);
      });
      inputs = marks.map(function(mark, i) {
        rules.push(El('div').addClass('class-breaks-rule').appendTo(mark));
        return El('input').attr('type', 'text').appendTo(mark)
          .on('change', function() {
            var val = parseFloat(this.value);
            if (isFinite(val)) {
              setBreak(i, val);
            }
            renderTable();
          })
          .on('keydown', function(e) {
            if (e.key == 'Enter') this.blur();
          });
      });
    }
    if (!info) return;
    swatches = elevation ? getElevationClassLanes(scheme) : getBreakClassSwatches(scheme);
    counts = getBreakClassCounts(scheme, opts.getLayer(), breaks);
    classRows.forEach(function(row, j) {
      var neutral = info.neutral && j > 0 && breaks[j - 1] == info.neutral[0];
      var swatch = row.findChild('.class-breaks-swatch');
      if (elevation) {
        renderLanes(swatch, swatches[j]);
      } else {
        swatch.empty().css('background', swatches[j] || 'transparent');
      }
      // the top row says what the numbers are
      var top = reversed ? j == classRows.length - 1 : j === 0;
      row.findChild('.class-breaks-count').text(formatSchemeCount(scheme, opts.getLayer(), counts[j], !top) +
        (neutral ? ' (pivot class)' : ''));
    });
    breaks.forEach(function(b, i) {
      var input = inputs[i].node();
      input.disabled = info.fixed[i];
      input.setAttribute('aria-label', getBreakLabel(i));
      rules[i].classed('fixed', info.fixed[i]);
      if (document.activeElement != input || !isTextInput(input)) input.value = formatNumber(b);
      renderChips(chipBoxes[i], elevation ? getElevationStopChips(scheme, i) : [], i);
    });
    renderChipBar(scheme);
  }

  // a tile for each run of presets (see getElevationClassLanes()), as wide as
  // its presets' columns, from the color at the top of the row to the one at
  // the bottom
  function renderLanes(swatch, lanes) {
    swatch.empty().css('background', 'none');
    lanes.forEach(function(lane) {
      var colors = reversed ? lane.colors.slice().reverse() : lane.colors;
      El('div').addClass('class-breaks-lane').appendTo(swatch)
        .css('grid-column', 'span ' + Math.max(lane.names.length, 1))
        .css('background', 'linear-gradient(' + colors[0] + ', ' + colors[1] + ')');
    });
  }

  // A chip's tooltip is fixed (see page.css): centered below the chip, and
  // inside the window
  function placeChipTooltip(el) {
    var rect = el.getBoundingClientRect();
    var half = (parseFloat(getComputedStyle(el, '::after').width) || 0) / 2;
    var margin = 4;
    var x = Math.min(rect.left + rect.width / 2, document.documentElement.clientWidth - margin - half);
    el.style.setProperty('--tooltip-x', Math.max(x, margin + half) + 'px');
    el.style.setProperty('--tooltip-y', rect.bottom + 5 + 'px');
  }

  // only a blend's chips have tooltips, which say whose colors they are
  function renderChips(box, chips, i) {
    box.empty();
    chips.forEach(function(chip) {
      var blended = chip.names.length > 0;
      var label = (blended ? chip.names.join(', ') + ' at ' : 'Color at ') + formatElevation(info.breaks[i]) +
        (chip.edited ? ' (edited)' : '');
      // after recoloring some of a shared chip's presets, the chip they now have
      var isSelected = !!selected && selected.i == i && (!blended ||
        chip.names.some(function(name) { return selected.checked.indexOf(name) > -1; }));
      var el = El('div').addClass('class-breaks-chip')
        .attr('aria-label', label)
        .attr('data-tooltip', blended ? label : null)
        .classed('selected', isSelected)
        .css('grid-column', 'span ' + Math.max(chip.names.length, 1))
        .css('background-color', chip.color)
        .appendTo(box)
        .on('click', function() { selectChip(i, chip); });
      if (blended) el.on('mouseenter', function(e) { placeChipTooltip(e.currentTarget); });
    });
  }

  function selectChip(i, chip) {
    var chipEl;
    if (selected && selected.i == i && sameNames(selected.names, chip.names)) {
      hidePicker();
      return;
    }
    selected = {i: i, names: chip.names, checked: chip.names.concat()};
    renderTable();
    chipEl = getSelectedChip();
    if (chipEl) {
      pickerAnchor.css('top', Math.round(chipEl.getBoundingClientRect().top - panel.node().getBoundingClientRect().top - 48) + 'px');
    }
    picker.setColor(chip.color);
    if (!picker.visible()) picker.toggle();
  }

  // Buttons for the selected stop of a ramp: deleting it, adding a stop above
  // it, and resetting an edited color (a blend has only the reset)
  function renderChipBar(scheme) {
    var chip, lyr;
    var blended = isBlendedScheme(scheme);
    chipBar.empty();
    chip = selected ? getElevationStopChips(scheme, selected.i).find(function(chip) {
      return chip.names.length === 0 || chip.names.some(function(name) { return selected.checked.indexOf(name) > -1; });
    }) : null;
    chipBar.classed('hidden', !selected || blended && !(chip && chip.edited));
    if (!selected) return;
    lyr = opts.getLayer();
    if (blended) {
      if (chip && chip.edited) {
        addChipButton('Reset', function(scheme, i, names) {
          return setElevationChipColor(scheme, names, i, null);
        });
      }
      return;
    }
    if (canDeleteElevationStop(scheme)) {
      addChipButton('Delete stop', function(scheme, i) {
        return deleteElevationStop(scheme, opts.getLayer(), i);
      });
    }
    addChipButton('Add stop', function(scheme, i) {
      return addElevationStop(scheme, opts.getLayer(), i);
    }).node().disabled = !canAddElevationStop(scheme, lyr, selected.i);
    if (chip && chip.edited) {
      addChipButton('Reset', function(scheme, i) {
        return setElevationChipColor(scheme, [], i, null);
      });
    }

    function addChipButton(text, edit) {
      return El('button').appendTo(chipBar).text(text)
        .on('click', function() {
          var i = selected.i;
          var names = selected.checked;
          hidePicker();
          opts.onChange(edit(opts.getScheme(), i, names));
        });
    }
  }

  function getSelectedChip() {
    return selected ? tableEl.node().querySelector('.class-breaks-chip.selected') : null;
  }

  function hidePicker() {
    if (picker && picker.visible()) picker.hide();
    selected = null;
  }

  function sameNames(a, b) {
    return a.join() == b.join();
  }

  function formatElevation(val) {
    var units = getRasterUnitsLabel(opts.getLayer());
    return formatNumber(val) + (units ? ' ' + units : '');
  }

  function inDisplayOrder(arr) {
    return reversed ? arr.slice().reverse() : arr;
  }

  function getBreakLabel(i) {
    var b = info.breaks[i];
    if (info.fixed[i]) return 'Pivot';
    if (info.neutral && b == info.neutral[0]) return 'Pivot class from';
    if (info.neutral && b == info.neutral[1]) return 'Pivot class to';
    return 'Break ' + (i + 1);
  }

  function setBreak(i, val) {
    var scheme = opts.getScheme();
    var next = setSchemeBreak(scheme, opts.getLayer(), i, val);
    if (next != scheme && getSchemeBreaks(next, opts.getLayer()).breaks[i] !== info.breaks[i]) opts.onChange(next);
  }

  // A dragged break goes to the roundest value under the pointer: the one with
  // the fewest digits among those within half a pixel of it
  function startDrag(e, i) {
    var box = handlesEl.node().getBoundingClientRect();
    if (e.button !== 0 || !info || info.fixed[i] || !(box.width > 0)) return;
    e.preventDefault();
    drag = {i: i, box: box};
    handles[i].addClass('dragging');
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', stopDrag);
    document.addEventListener('pointercancel', stopDrag);
  }

  function onDragMove(e) {
    var x = e.clientX - drag.box.left;
    var halfPx = 0.5 / drag.box.width;
    var pos = x / drag.box.width;
    setBreak(drag.i, getRoundestNumber(scale.toValue(pos - halfPx), scale.toValue(pos + halfPx)));
  }

  function stopDrag() {
    if (!drag) return;
    if (handles[drag.i]) handles[drag.i].removeClass('dragging');
    drag = null;
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', stopDrag);
    document.removeEventListener('pointercancel', stopDrag);
    update(); // the scale, for the range the drag left
  }

  function formatNumber(val) {
    return String(+val.toPrecision(6));
  }

  function pct(val) {
    return Math.round(val * 10000) / 100 + '%';
  }
}
