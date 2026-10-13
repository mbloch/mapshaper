import { El } from './gui-el';
import { internal } from './gui-core';
import { makeCollapsibleSection, makeColorRow } from './gui-panel-controls';
import { SizeField } from './gui-size-field';
import { formatOpacityPct } from './gui-style-values';

// The line panel's "Casing" section: a color, an opacity and a width for an
// outline drawn beneath the lines. See svg-line-casing.mjs for how it is drawn.
//
// A casing is there when its color is set, as with a polygon's glows (see
// gui-glow-control.mjs): picking a color adds the casing, and emptying the
// color field removes it. The heading's × removes the casing and its settings.
//
// A width or opacity typed while no feature has a casing is kept, and goes
// with the color when one is picked.
//
// opts.getRecords()        the target layer's records
// opts.getTargetIds()      the features being styled
// opts.applyEdits(edits, title)   run per-feature edits: [{id, styles}]
// opts.revert()            put the panel back as the data has it
// opts.releaseFocus()

export function LineCasingControl(parent, opts) {
  var pending = {};
  var heading = makeCollapsibleSection(parent, 'Casing', {
    onToggle: function(open) {
      if (!open) row.picker.hide();
    },
    onRemove: function() {
      pending = {};
      opts.applyEdits(getCasingOffEdits(opts.getRecords(), opts.getTargetIds()),
        'Remove casing');
    },
    removeTitle: 'Remove casing'
  });
  var section = heading.section.addClass('layer-casing-section');
  var row = addCasingRow();

  this.section = section;
  this.update = update;

  this.hidePicker = function() {
    row.picker.hide();
  };

  this.reset = function() {
    pending = {};
    row.picker.hide();
  };

  // The casing every target has, for a saved style
  this.addStyleValues = function(style) {
    var records = opts.getRecords();
    var ids = opts.getTargetIds();
    if (getCasingState(records, ids) != 'on') return;
    internal.svg.casingFields.forEach(function(field) {
      var val = getCommonValue(records, ids, field);
      if (val || val === 0) style[field] = val;
    });
  };

  function addCasingRow() {
    var o = makeColorRow(section, {
      label: 'Color',
      ariaLabel: 'Casing color',
      onColor: applyCasingColor,
      onOpacity: function(value) {
        applyCasingValue('opacity', value);
      },
      revert: opts.revert
    });
    o.row.addClass('layer-casing-row');
    El('span').appendTo(o.aside).text('Width');
    o.width = new SizeField(o.aside, {
      min: 0.25,
      max: 50,
      step: 0.5,
      bigStep: 2,
      decimals: 2,
      title: 'How far the casing extends past each edge of the line, in px',
      onSet: function(value) {
        applyCasingValue('width', value);
      },
      onStep: function(delta) {
        var shown = Number(o.width.getValue());
        if (!(shown > 0)) shown = internal.svg.DEFAULT_CASING_WIDTH;
        applyCasingValue('width', Math.max(0.25, Math.round((shown + delta) * 4) / 4));
      },
      onDone: opts.releaseFocus
    });
    return o;
  }

  function applyCasingColor(color) {
    var edits = getCasingColorEdits(opts.getRecords(), opts.getTargetIds(), color, pending);
    if (color) pending = {};
    if (edits.length > 0) {
      opts.applyEdits(edits, color ? 'Line casing' : 'Remove casing');
    } else {
      update();
    }
  }

  // A width or opacity goes to the lines that have a casing
  function applyCasingValue(name, value) {
    var records = opts.getRecords();
    var ids = opts.getTargetIds().filter(function(id) {
      return hasCasing(records[id]);
    });
    if (ids.length === 0) {
      pending[name] = value;
      update();
      return;
    }
    opts.applyEdits(ids.map(function(id) {
      return {id: id, styles: [[getCasingField(name), formatCasingValue(name, value)]]};
    }));
  }

  function update() {
    var records = opts.getRecords();
    var ids = opts.getTargetIds();
    var shown = getShownCasing(records, ids, pending);
    heading.setPresence(getCasingState(records, ids));
    row.showColor(shown.color);
    row.input.attr('placeholder', shown.mixed ? 'mixed' : '');
    row.chit.classed('mixed', shown.mixed);
    row.opacity.node().value = shown.opacity === '' ? '' : formatOpacityPct(shown.opacity);
    row.width.setValue(shown.width === '' ? '' : String(shown.width));
    row.width.setPlaceholder(shown.width === '' ? 'mixed' : '');
  }
}

function getCasingField(name) {
  return 'casing-' + name;
}

// In the panel, a line has a casing when the casing's color is set
export function hasCasing(rec) {
  return !!rec && !isBlank(rec['casing-color']);
}

// 'on', 'off' or 'mixed', over the features @ids
export function getCasingState(records, ids) {
  var n = ids.filter(function(id) { return hasCasing(records[id]); }).length;
  return n === 0 ? 'off' : n < ids.length ? 'mixed' : 'on';
}

// Per-feature edits for a casing color typed or picked. A color adds the
// casing to every feature, with the @pending width and opacity where a feature
// has none of its own; an empty color removes the casing's color.
export function getCasingColorEdits(records, ids, color, pending) {
  var edits = [];
  ids.forEach(function(id) {
    var rec = records[id] || {};
    var styles = [];
    if (!color) {
      if (!isBlank(rec['casing-color'])) styles.push(['casing-color', '']);
    } else {
      if (String(rec['casing-color']).trim() != color) styles.push(['casing-color', color]);
      ['width', 'opacity'].forEach(function(name) {
        var field = getCasingField(name);
        var val;
        if (pending && name in pending && isBlank(rec[field])) {
          val = formatCasingValue(name, pending[name]);
          if (val !== '') styles.push([field, val]);
        }
      });
    }
    if (styles.length > 0) edits.push({id: id, styles: styles});
  });
  return edits;
}

// Removing the casing removes its width and opacity too, which mean nothing
// without a color
export function getCasingOffEdits(records, ids) {
  var edits = [];
  ids.forEach(function(id) {
    var rec = records[id] || {};
    var styles = internal.svg.casingFields.filter(function(field) {
      return !isBlank(rec[field]);
    }).map(function(field) {
      return [field, ''];
    });
    if (styles.length > 0) edits.push({id: id, styles: styles});
  });
  return edits;
}

// What the casing row shows. The color is blank where no feature has a
// casing, and blank and mixed where only some do or their colors differ. The
// width and opacity are those the cased features agree on, '' where they
// differ; with no cased features, they are the @pending ones, the default
// width and no opacity.
export function getShownCasing(records, ids, pending) {
  var casedIds = ids.filter(function(id) { return hasCasing(records[id]); });
  var defaultWidth = internal.svg.DEFAULT_CASING_WIDTH;
  var color, mixed;
  pending = pending || {};
  if (casedIds.length === 0) {
    return {
      color: '',
      mixed: false,
      width: 'width' in pending ? pending.width : defaultWidth,
      opacity: 'opacity' in pending ? pending.opacity : ''
    };
  }
  color = getCommonValue(records, casedIds, 'casing-color', undefined, trim);
  mixed = casedIds.length < ids.length || color === '';
  return {
    color: mixed ? '' : color,
    mixed: mixed,
    width: getCommonValue(records, casedIds, 'casing-width', defaultWidth, Number),
    opacity: getCommonValue(records, casedIds, 'casing-opacity', 1, Number)
  };
}

// Full opacity is the default, and stored as no opacity at all
function formatCasingValue(name, value) {
  return name == 'opacity' && value >= 1 ? '' : value;
}

// The value of @field that the features @ids share, or '' if they differ
function getCommonValue(records, ids, field, defaultValue, convert) {
  var value, val;
  for (var i=0; i<ids.length; i++) {
    val = records[ids[i]] && records[ids[i]][field];
    if (isBlank(val)) val = defaultValue === undefined ? '' : defaultValue;
    if (convert && val !== '' && val !== null) val = convert(val);
    if (i === 0) {
      value = val;
    } else if (val !== value) {
      return '';
    }
  }
  return ids.length > 0 ? value : '';
}

function trim(val) {
  return String(val).trim();
}

function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === '';
}
