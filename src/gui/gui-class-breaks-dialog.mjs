import { El } from './gui-el';
import { claimFieldKeys, isTextInput, releasePanelFocus } from './gui-panel-focus';
import {
  getSchemeBreaks, setSchemeBreak, getSchemeValues, getBreaksScale, getHistogram, getRoundestNumber,
  getBreakClassSwatches, getBreakClassCounts
} from './gui-color-scheme-model';

// A popup beside the color scheme panel for editing a numeric scheme's class
// breaks: a histogram of the field's values with a handle under it at each
// break, and the classes, with a field for each break between them. Editing a break makes the
// scheme's breaks custom (see setSchemeBreak()); the pivot of a diverging
// scheme is shown, but stays where the panel puts it.
//
// opts.getScheme(), opts.getLayer()  the scheme and layer being edited
// opts.onChange(scheme)  a break was moved
// opts.onClose()         the dialog was closed
var numBins = 40;

export function ClassBreaksDialog(gui, opts) {
  var parent = gui.container.findChild('.mshp-main-map');
  var panel = El('div').addClass('label-style-panel class-breaks-dialog').appendTo(parent).hide();
  var isOpen = false;
  var logScale = false;
  var info = null; // see getSchemeBreaks()
  var scale = null;
  var chartEl, barsEl, linesEl, handlesEl, minLabel, maxLabel, logToggle, tableEl, noteEl, bodyEl;
  var handles = [], lines = [], pivotLine, inputs = [], rules = [], classRows = [];
  var drag = null;

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
    var scheme, lyr, values;
    if (!isOpen) return;
    scheme = opts.getScheme();
    lyr = opts.getLayer();
    info = scheme && lyr ? getSchemeBreaks(scheme, lyr) : null;
    noteEl.classed('hidden', !!info);
    bodyEl.classed('hidden', !info);
    if (!info) return;
    if (!(info.min > 0)) logScale = false;
    logToggle.node().disabled = !(info.min > 0);
    logToggle.node().checked = logScale;
    scale = getBreaksScale(info.min, info.max, logScale);
    values = getSchemeValues(scheme, lyr);
    renderHistogram(getHistogram(values, scale, numBins));
    minLabel.text(formatNumber(info.min));
    maxLabel.text(formatNumber(info.max));
    renderHandles();
    renderTable();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    stopDrag();
    panel.hide();
    if (opts.onClose) opts.onClose();
  }

  function initDialog() {
    claimFieldKeys(panel.node(), {
      revert: renderTable,
      release: function() { releasePanelFocus(panel.node()); }
    });
    var header = El('div').addClass('label-style-panel-title').appendTo(panel);
    El('span').appendTo(header).text('Class breaks');
    El('button').addClass('label-style-close').appendTo(header).text('×').on('click', close);
    noteEl = El('div').addClass('label-style-row color-scheme-note').appendTo(panel)
      .text('There are no breaks to edit.');
    bodyEl = El('div').appendTo(panel);

    chartEl = El('div').addClass('class-breaks-chart').appendTo(bodyEl);
    barsEl = El('div').addClass('class-breaks-bars').appendTo(chartEl);
    linesEl = El('div').addClass('class-breaks-lines').appendTo(chartEl);
    pivotLine = El('div').addClass('class-breaks-pivot').attr('title', 'Pivot').appendTo(linesEl);
    handlesEl = El('div').addClass('class-breaks-handles').appendTo(chartEl);
    var axis = El('div').addClass('class-breaks-axis').appendTo(chartEl);
    minLabel = El('span').appendTo(axis);
    maxLabel = El('span').appendTo(axis);

    var logRow = El('label').addClass('label-style-row class-breaks-log-row').appendTo(bodyEl);
    logToggle = El('input').attr('type', 'checkbox').appendTo(logRow).on('change', function() {
      logScale = logToggle.node().checked;
      this.blur();
      update();
    });
    El('span').appendTo(logRow).text('Log scale');

    tableEl = El('div').addClass('class-breaks-table').appendTo(bodyEl);
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
        return El('div').addClass('class-breaks-handle').attr('role', 'slider').attr('tabindex', '0')
          .appendTo(handlesEl)
          .on('pointerdown', function(e) { startDrag(e, i); })
          .on('keydown', function(e) { onHandleKey(e, i); });
      });
      lines = breaks.map(function() {
        return El('div').addClass('class-breaks-line').appendTo(linesEl);
      });
    }
    breaks.forEach(function(b, i) {
      var left = pct(scale.toPos(b));
      handles[i].css('left', left)
        .classed('fixed', info.fixed[i])
        .attr('aria-label', getBreakLabel(i))
        .attr('aria-valuenow', String(b))
        .attr('aria-disabled', info.fixed[i] ? 'true' : null)
        .attr('title', getBreakLabel(i) + ': ' + formatNumber(b));
      lines[i].css('left', left).classed('fixed', info.fixed[i]);
    });
    // a pivot inside a pivot class isn't a break, but marks where the class's edges can go
    pivotPos = info.neutral ? scale.toPos(info.pivot) : -1;
    pivotLine.classed('hidden', pivotPos < 0).css('left', pct(Math.max(pivotPos, 0)));
  }

  // The classes from low to high, a color tile and the number of features in
  // each, stacked; a rule across the boundary between two classes runs out to
  // the field with the break's value (see .class-breaks-list in page.css)
  function renderTable() {
    var breaks = info ? info.breaks : [];
    var scheme = opts.getScheme();
    var swatches, counts;
    if (inputs.length != breaks.length || classRows.length != breaks.length + 1) {
      tableEl.empty();
      var list = El('div').addClass('class-breaks-list').appendTo(tableEl);
      classRows = breaks.concat([null]).map(function() {
        var row = El('div').addClass('class-breaks-class').appendTo(list);
        El('div').addClass('class-breaks-swatch').appendTo(row);
        El('span').addClass('class-breaks-count').appendTo(row);
        return row;
      });
      rules = [];
      inputs = breaks.map(function(b, i) {
        var mark = El('div').addClass('class-breaks-mark').appendTo(list)
          .css('top', 'calc((var(--class-breaks-row-height) + var(--class-breaks-gap)) * ' + (i + 1) + ' - 13px)');
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
    swatches = getBreakClassSwatches(scheme);
    counts = getBreakClassCounts(scheme, opts.getLayer(), breaks);
    classRows.forEach(function(row, j) {
      var neutral = info.neutral && j > 0 && breaks[j - 1] == info.neutral[0];
      row.findChild('.class-breaks-swatch').css('background', swatches[j] || 'transparent');
      // the top row says what the numbers are
      row.findChild('.class-breaks-count').text((j === 0 ? formatCount(counts[j]) : String(counts[j])) +
        (neutral ? ' (pivot class)' : ''));
    });
    breaks.forEach(function(b, i) {
      var input = inputs[i].node();
      input.disabled = info.fixed[i];
      input.setAttribute('aria-label', getBreakLabel(i));
      input.setAttribute('title', getBreakLabel(i));
      rules[i].classed('fixed', info.fixed[i]);
      if (document.activeElement != input || !isTextInput(input)) input.value = formatNumber(b);
    });
  }

  function formatCount(n) {
    return n + (n == 1 ? ' feature' : ' features');
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
    if (next != scheme && next.breaks[i] !== info.breaks[i]) opts.onChange(next);
  }

  // A dragged break goes to the roundest value under the pointer: the one with
  // the fewest digits among those within half a pixel of it
  function startDrag(e, i) {
    var box = handlesEl.node().getBoundingClientRect();
    if (e.button !== 0 || !info || info.fixed[i] || !(box.width > 0)) return;
    e.preventDefault();
    handles[i].node().focus();
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
  }

  // arrow keys move a break by a hundredth of the histogram's width (a
  // tenth with Shift)
  function onHandleKey(e, i) {
    var step = e.shiftKey ? 0.1 : 0.01;
    var pos, dir;
    if (!info || info.fixed[i]) return;
    if (e.key == 'ArrowLeft' || e.key == 'ArrowDown') dir = -1;
    else if (e.key == 'ArrowRight' || e.key == 'ArrowUp') dir = 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    pos = scale.toPos(info.breaks[i]) + dir * step;
    setBreak(i, getRoundestNumber(scale.toValue(pos - step / 4), scale.toValue(pos + step / 4)));
  }

  function formatNumber(val) {
    return String(+val.toPrecision(6));
  }

  function pct(val) {
    return Math.round(val * 10000) / 100 + '%';
  }
}
