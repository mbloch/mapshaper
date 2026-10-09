import { El } from './gui-el';
import { internal } from './gui-core';
import { makeCollapsibleSection, makeColorRow, makeFieldTip } from './gui-panel-controls';
import { SizeField } from './gui-size-field';
import {
  patternTypes, getDefaultPatternControls, getPatternBackground, getPatternControls,
  isValidPatternControls, formatFillPattern, formatFillPatternExpression, refillPattern,
  defaultPatternColor
} from './gui-fill-pattern';

// The polygon panel's "Pattern" section. See gui-fill-pattern.mjs for how its
// settings map to fill-pattern codes.
//
// Added and removed like the label panel's Icon section: choosing a type from
// the menu gives the features a pattern, the heading's × takes it off, and
// the rest of the section qualifies the pattern there is.
//
// opts.getRecords()        the target layer's records
// opts.getTargetIds()      the features being styled
// opts.applyEdits(edits, title)   run per-feature edits: [{id, styles}]
// opts.revert()            put the panel back as the data has it
// opts.releaseFocus()
export function PatternFillControl(parent, opts) {
  var heading = makeCollapsibleSection(parent, 'Patterns', {
    onToggle: function(open) {
      if (!open) colorControl.picker.hide();
    },
    onRemove: removePattern,
    removeTitle: 'Remove pattern fill'
  });
  var section = heading.section.addClass('layer-pattern-section');
  var shown = {type: 'none'};
  // Custom was chosen from the menu, and the code field is waiting for a code.
  // Until one is applied the data still says what it said before, so the
  // choice has to be remembered or the next refresh would undo it.
  var customPending = false;
  var typeSelect, noneOption, mixedOption, colorControl, angleField, sizeRow, sizeCaption,
      sizeField, gapField, customRow, codeInput;

  initRows();

  this.section = section;

  this.update = update;

  this.reset = function() {
    customPending = false;
  };

  this.hidePicker = function() {
    colorControl.picker.hide();
  };

  // What a saved style records for the pattern, over the fill it records.
  this.getCode = function(fill) {
    if (isSimple(shown)) return formatFillPattern(shown, getPatternBackground(fill));
    if (shown.type == 'custom') return shown.code || '';
    return '';
  };

  // Per-feature edits applying @styles to the targets. A new fill is also
  // written into the background of each feature's pattern, since that is where
  // the pattern's background colour is kept; custom patterns are left alone.
  this.getStyleEdits = function(styles) {
    var records = opts.getRecords();
    var fill = findStyle(styles, 'fill');
    var refill = fill !== undefined && findStyle(styles, 'fill-pattern') === undefined;
    return opts.getTargetIds().map(function(id) {
      var rec = records[id];
      var code = rec && rec['fill-pattern'];
      var edit = {id: id, styles: styles};
      var refilled;
      if (refill && !isBlank(code)) {
        refilled = refillPattern(internal.parsePattern(code), rec.fill, fill);
        if (refilled) edit.styles = styles.concat([['fill-pattern', refilled]]);
      }
      return edit;
    });
  };

  // Edits that keep each feature's pattern over its fill after a command that
  // sets fills the panel cannot know beforehand. A -style expression reads
  // the new fill when it runs.
  this.getRefillExpressionEdits = function(ids) {
    var records = opts.getRecords();
    var edits = [];
    ids.forEach(function(id) {
      var rec = records[id];
      var code = rec && rec['fill-pattern'];
      var o = isBlank(code) ? null : getPatternControls(internal.parsePattern(code), rec.fill);
      if (o) edits.push({id: id, styles: [['fill-pattern', formatFillPatternExpression(o)]]});
    });
    return edits;
  };

  function initRows() {
    var typeRow = El('div').addClass('label-style-row layer-pattern-type-row').appendTo(section);
    typeSelect = El('select').attr('aria-label', 'Pattern type').appendTo(typeRow)
      .on('change', function() {
        selectType(typeSelect.node().value);
      });
    // What the menu shows while the features have no pattern, which is not a
    // choice: the × in the heading is how a pattern is removed.
    noneOption = El('option').attr('value', 'none').appendTo(typeSelect).text('None');
    noneOption.node().disabled = true;
    [['hatches', 'Hatches'], ['dots', 'Dots'], ['squares', 'Squares'],
      ['custom', 'Custom']].forEach(function(o) {
      El('option').attr('value', o[0]).appendTo(typeSelect).text(o[1]);
    });
    // Shown only while the features being styled have different patterns,
    // which is not a choice the menu offers.
    mixedOption = El('option').attr('value', 'mixed').appendTo(typeSelect).text('Mixed');
    mixedOption.node().disabled = true;

    colorControl = makeColorRow(section, {
      label: 'Color',
      noOpacity: true,
      onColor: function(color) {
        // A pattern has to have a colour, so an emptied field is its default.
        if (!color) {
          color = defaultPatternColor;
          colorControl.showColor(color);
        }
        applyChange({color: color});
      },
      revert: opts.revert
    });
    colorControl.row.addClass('layer-pattern-color-row');
    El('span').appendTo(colorControl.aside).text('Angle');
    angleField = new SizeField(colorControl.aside, {
      min: -180, max: 180, step: 15, bigStep: 45,
      title: 'Pattern angle in degrees',
      onSet: function(value) {
        applyChange({angle: value});
      },
      onStep: function(delta) {
        applyChange({angle: Math.max(-180, Math.min(180, shown.angle + delta))});
      },
      onDone: opts.releaseFocus
    });

    sizeRow = El('div').addClass('label-style-row layer-pattern-size-row').appendTo(section);
    var sizeCell = El('div').addClass('label-split-cell').appendTo(sizeRow);
    var gapCell = El('div').addClass('label-split-cell').appendTo(sizeRow);
    sizeCaption = El('span').appendTo(sizeCell).text('Size');
    sizeField = new SizeField(sizeCell, {
      min: 0.25, step: 0.5, bigStep: 2, decimals: 2,
      title: 'Size in px',
      onSet: function(value) {
        applyChange({size: value});
      },
      onStep: function(delta) {
        applyChange({size: Math.max(0.25, shown.size + delta)});
      },
      onDone: opts.releaseFocus
    });
    El('span').appendTo(gapCell).text('Gap');
    gapField = new SizeField(gapCell, {
      min: 0, step: 0.5, bigStep: 2, decimals: 2,
      title: 'Gap in px',
      onSet: function(value) {
        applyChange({gap: value});
      },
      onStep: function(delta) {
        applyChange({gap: Math.max(0, shown.gap + delta)});
      },
      onDone: opts.releaseFocus
    });

    customRow = El('div').addClass('label-style-row layer-pattern-code-row').appendTo(section);
    var caption = El('div').addClass('label-style-row-label').appendTo(customRow).text('Code');
    makeFieldTip(caption,
      'The fill-pattern syntax of the -style command.\n' +
      'See the command reference for details.');
    codeInput = El('input').attr('type', 'text').attr('aria-label', 'Pattern code').appendTo(customRow)
      .on('change', function() {
        applyCode(codeInput.node().value.trim());
      });
  }

  function update() {
    var ids = opts.getTargetIds();
    var state = getCommonPatternState(ids);
    if (customPending && state.type != 'custom') {
      state = {type: 'custom', code: shown.type == 'custom' ? shown.code : getPendingCode(state)};
    }
    shown = state;
    heading.setPresence(getPresence(ids));
    noneOption.classed('hidden', state.type != 'none');
    mixedOption.classed('hidden', state.type != 'mixed');
    typeSelect.node().value = state.type;
    colorControl.row.classed('hidden', !isSimple(state));
    sizeRow.classed('hidden', !isSimple(state));
    customRow.classed('hidden', state.type != 'custom');
    if (isSimple(state)) {
      colorControl.showColor(state.color);
      angleField.setValue(state.angle);
      sizeCaption.text(state.type == 'hatches' ? 'Width' : 'Size');
      sizeField.setValue(state.size);
      gapField.setValue(state.gap);
    } else {
      colorControl.picker.hide();
    }
    if (state.type == 'custom' && document.activeElement !== codeInput.node()) {
      codeInput.node().value = state.code || '';
    }
  }

  function selectType(type) {
    if (type == 'custom') {
      customPending = true;
      update();
      codeInput.node().focus();
      return;
    }
    customPending = false;
    if (patternTypes.indexOf(type) > -1) {
      applyControls(getDefaultPatternControls(type, isSimple(shown) ? shown.color : null));
    }
  }

  function removePattern() {
    customPending = false;
    opts.applyEdits(opts.getTargetIds().filter(hasPattern).map(function(id) {
      return {id: id, styles: [['fill-pattern', '']]};
    }), 'Remove pattern fill');
  }

  function getPresence(ids) {
    var n = ids.filter(hasPattern).length;
    return n === 0 ? 'off' : n < ids.length ? 'mixed' : 'on';
  }

  function hasPattern(id) {
    var rec = opts.getRecords()[id];
    return !isBlank(rec && rec['fill-pattern']);
  }

  function applyChange(change) {
    if (!isSimple(shown)) return;
    var o = Object.assign({}, shown, change);
    if (!isValidPatternControls(o)) {
      opts.revert();
      return;
    }
    applyControls(o);
  }

  function applyControls(o) {
    applyToTargets(function(rec) {
      return formatFillPattern(o, getPatternBackground(rec && rec.fill));
    }, 'Pattern fill');
  }

  function applyCode(code) {
    if (code && !internal.parsePattern(code)) {
      codeInput.node().value = shown.code || '';
      opts.revert();
      return;
    }
    if (!code) customPending = false;
    applyToTargets(function() { return code; }, code ? 'Pattern fill' : 'Remove pattern fill');
  }

  function applyToTargets(getCode, title) {
    var records = opts.getRecords();
    opts.applyEdits(opts.getTargetIds().map(function(id) {
      return {id: id, styles: [['fill-pattern', getCode(records[id])]]};
    }), title);
  }

  // The pattern the features being styled have in common, as panel settings,
  // {type: 'custom', code}, {type: 'none'} -- or {type: 'mixed'} if they differ.
  // Features with the same pattern over different fills agree: each pattern's
  // background is its own feature's fill.
  function getCommonPatternState(ids) {
    var records = opts.getRecords();
    var cache = {};
    var firstKey = null, first = null;
    var rec, cacheKey, state, key;
    for (var i=0; i<ids.length; i++) {
      rec = records[ids[i]];
      cacheKey = (rec && rec['fill-pattern']) + '\t' + (rec && rec.fill);
      state = cache[cacheKey] || (cache[cacheKey] = readPatternState(rec));
      key = JSON.stringify(state);
      if (firstKey === null) {
        firstKey = key;
        first = state;
      } else if (key != firstKey) {
        return {type: 'mixed'};
      }
    }
    return first || {type: 'none'};
  }

  // The code the Custom field starts from: the pattern being replaced, so that
  // choosing Custom is a way to see the code for the settings shown.
  function getPendingCode(state) {
    var records = opts.getRecords();
    var ids = opts.getTargetIds();
    var rec = ids.length > 0 ? records[ids[0]] : null;
    return isSimple(state) ? formatFillPattern(state, getPatternBackground(rec && rec.fill)) : '';
  }
}

function readPatternState(rec) {
  var code = rec && rec['fill-pattern'];
  if (isBlank(code)) return {type: 'none'};
  return getPatternControls(internal.parsePattern(code), rec.fill) ||
    {type: 'custom', code: String(code)};
}

function isSimple(state) {
  return patternTypes.indexOf(state.type) > -1;
}

function findStyle(styles, name) {
  for (var i=0; i<styles.length; i++) {
    if (styles[i][0] == name) return styles[i][1];
  }
  return undefined;
}

function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === '';
}
