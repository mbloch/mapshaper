import { El } from './gui-el';
import { internal } from './gui-core';
import { makeCollapsibleSection, makeColorRow } from './gui-panel-controls';
import { SizeField } from './gui-size-field';
import { formatOpacityPct } from './gui-style-values';

// The polygon panel's "Effects" section: an outer and an inner glow, each a
// color, an opacity and a width. See svg-glow.mjs for how they are drawn.
//
// A glow is there when its color is set, so each glow is a color row: picking
// a color adds the glow, and emptying the color field removes it. The
// heading's × removes both glows and their settings.
//
// A width or opacity typed while no feature has the glow is kept, and goes
// with the color when one is picked.
//
// opts.getRecords()        the target layer's records
// opts.getTargetIds()      the features being styled
// opts.applyEdits(edits, title)   run per-feature edits: [{id, styles}]
// opts.revert()            put the panel back as the data has it
// opts.releaseFocus()

export var glowTypes = ['outer', 'inner'];
var glowTitles = {outer: 'Outer glow', inner: 'Inner glow'};

export function GlowEffectsControl(parent, opts) {
  var rows = {};
  var pending = {outer: {}, inner: {}};
  var heading = makeCollapsibleSection(parent, 'Effects', {
    onToggle: function(open) {
      if (!open) hidePickers();
    },
    onRemove: function() {
      pending = {outer: {}, inner: {}};
      opts.applyEdits(getEffectsOffEdits(opts.getRecords(), opts.getTargetIds()),
        'Remove glow effects');
    },
    removeTitle: 'Remove glow effects'
  });
  var section = heading.section.addClass('layer-effects-section');
  glowTypes.forEach(function(type) {
    rows[type] = addGlowRow(type);
  });

  this.section = section;
  this.update = update;
  this.hidePickers = hidePickers;

  this.reset = function() {
    pending = {outer: {}, inner: {}};
    hidePickers();
  };

  // The glows every target has, for a saved style.
  this.addStyleValues = function(style) {
    var records = opts.getRecords();
    var ids = opts.getTargetIds();
    glowTypes.forEach(function(type) {
      if (getGlowState(records, ids, type) != 'on') return;
      ['color', 'width', 'opacity'].forEach(function(name) {
        var field = getGlowField(type, name);
        var val = getCommonValue(records, ids, field);
        if (val || val === 0) style[field] = val;
      });
    });
  };

  function hidePickers() {
    rows.outer.picker.hide();
    rows.inner.picker.hide();
  }

  function addGlowRow(type) {
    var o = makeColorRow(section, {
      label: glowTitles[type],
      onColor: function(color) {
        applyGlowColor(type, color);
      },
      onOpacity: function(value) {
        applyGlowValue(type, 'opacity', value);
      },
      revert: opts.revert
    });
    o.row.addClass('layer-glow-row layer-' + type + '-glow-row');
    El('span').appendTo(o.aside).text('Width');
    o.width = new SizeField(o.aside, {
      min: 0.5,
      max: 200,
      step: 1,
      bigStep: 5,
      decimals: 1,
      title: 'How far the glow reaches from the edge, in px',
      onSet: function(value) {
        applyGlowValue(type, 'width', value);
      },
      onStep: function(delta) {
        var shown = Number(o.width.getValue());
        if (!(shown > 0)) shown = internal.svg.DEFAULT_GLOW_WIDTH;
        applyGlowValue(type, 'width', Math.max(0.5, Math.round(shown + delta)));
      },
      onDone: opts.releaseFocus
    });
    return o;
  }

  function applyGlowColor(type, color) {
    var edits = getGlowColorEdits(opts.getRecords(), opts.getTargetIds(), type, color, pending[type]);
    if (color) pending[type] = {};
    if (edits.length > 0) {
      opts.applyEdits(edits, color ? glowTitles[type] : 'Remove ' + glowTitles[type].toLowerCase());
    } else {
      update();
    }
  }

  // A width or opacity goes to the features that have the glow, as the label
  // panel's halo settings go only to the labels that have a halo.
  function applyGlowValue(type, name, value) {
    var records = opts.getRecords();
    var ids = opts.getTargetIds().filter(function(id) {
      return hasGlow(records[id], type);
    });
    if (ids.length === 0) {
      pending[type][name] = value;
      update();
      return;
    }
    opts.applyEdits(ids.map(function(id) {
      return {id: id, styles: [[getGlowField(type, name), formatGlowValue(name, value)]]};
    }));
  }

  function update() {
    var records = opts.getRecords();
    var ids = opts.getTargetIds();
    heading.setPresence(getEffectsState(records, ids));
    glowTypes.forEach(function(type) {
      updateGlowRow(type, records, ids);
    });
  }

  function updateGlowRow(type, records, ids) {
    var o = rows[type];
    var shown = getShownGlow(records, ids, type, pending[type]);
    o.showColor(shown.color);
    o.input.attr('placeholder', shown.mixed ? 'mixed' : '');
    o.chit.classed('mixed', shown.mixed);
    o.opacity.node().value = shown.opacity === '' ? '' : formatOpacityPct(shown.opacity);
    o.width.setValue(shown.width === '' ? '' : String(shown.width));
    o.width.setPlaceholder(shown.width === '' ? 'mixed' : '');
  }
}

export function getGlowField(type, name) {
  return type + '-glow-' + name;
}

// In the panel, a feature has a glow when the glow's color is set.
export function hasGlow(rec, type) {
  return !!rec && !isBlank(rec[getGlowField(type, 'color')]);
}

// 'on', 'off' or 'mixed', over the features @ids
export function getGlowState(records, ids, type) {
  var n = ids.filter(function(id) { return hasGlow(records[id], type); }).length;
  return n === 0 ? 'off' : n < ids.length ? 'mixed' : 'on';
}

export function getEffectsState(records, ids) {
  var n = ids.filter(function(id) {
    return hasGlow(records[id], 'outer') || hasGlow(records[id], 'inner');
  }).length;
  return n === 0 ? 'off' : n < ids.length ? 'mixed' : 'on';
}

// Per-feature edits for a color typed or picked for one glow. A color adds the
// glow to every feature, with the @pending width and opacity where a feature
// has none of its own; an empty color removes the glow's color.
export function getGlowColorEdits(records, ids, type, color, pending) {
  var colorField = getGlowField(type, 'color');
  var edits = [];
  ids.forEach(function(id) {
    var rec = records[id] || {};
    var styles = [];
    if (!color) {
      if (!isBlank(rec[colorField])) styles.push([colorField, '']);
    } else {
      if (String(rec[colorField]).trim() != color) styles.push([colorField, color]);
      ['width', 'opacity'].forEach(function(name) {
        var field = getGlowField(type, name);
        if (pending && name in pending && isBlank(rec[field])) {
          var val = formatGlowValue(name, pending[name]);
          if (val !== '') styles.push([field, val]);
        }
      });
    }
    if (styles.length > 0) edits.push({id: id, styles: styles});
  });
  return edits;
}

// Switching Effects off removes every glow setting, which mean nothing
// without a color.
export function getEffectsOffEdits(records, ids) {
  var edits = [];
  ids.forEach(function(id) {
    var rec = records[id] || {};
    var styles = internal.svg.glowFields.filter(function(field) {
      return !isBlank(rec[field]);
    }).map(function(field) {
      return [field, ''];
    });
    if (styles.length > 0) edits.push({id: id, styles: styles});
  });
  return edits;
}

// What a glow's row shows. The color is blank where no feature has the glow,
// and blank and mixed where only some do or their colors differ. The width
// and opacity are those the glowing features agree on, '' where they differ;
// with no glowing features, they are the @pending ones, the default width and
// no opacity.
export function getShownGlow(records, ids, type, pending) {
  var glowIds = ids.filter(function(id) { return hasGlow(records[id], type); });
  var defaultWidth = internal.svg.DEFAULT_GLOW_WIDTH;
  var color, mixed;
  pending = pending || {};
  if (glowIds.length === 0) {
    return {
      color: '',
      mixed: false,
      width: 'width' in pending ? pending.width : defaultWidth,
      opacity: 'opacity' in pending ? pending.opacity : ''
    };
  }
  color = getCommonValue(records, glowIds, getGlowField(type, 'color'), undefined, trim);
  mixed = glowIds.length < ids.length || color === '';
  return {
    color: mixed ? '' : color,
    mixed: mixed,
    width: getCommonValue(records, glowIds, getGlowField(type, 'width'), defaultWidth, Number),
    opacity: getCommonValue(records, glowIds, getGlowField(type, 'opacity'), 1, Number)
  };
}

// Full opacity is the default, and stored as no opacity at all.
function formatGlowValue(name, value) {
  return name == 'opacity' && value >= 1 ? '' : value;
}

// The value of @field that the features @ids share, or '' if they differ.
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
