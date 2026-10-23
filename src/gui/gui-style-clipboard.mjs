// Copying one object's style and pasting it onto others, from the map's
// right-click menu (see gui-style-clipboard-menu.mjs). Pure functions, so that
// they can be tested without a map.
//
// A style is the properties the new-object rule takes from a selection (see
// gui-selection-style.mjs): a label's style leaves out where it sits, and a
// numbered marker's leaves out its text. Pasting makes each target look like
// the object copied, so a property the source has no value for is unset on
// the target. Lines and polygons share their stroke, which is all that goes
// from one to the other; any other pairing of kinds is not offered.
//
// An object is described as {id, kind, rec, closed, pathLabel, marker}, where
// kind is 'line', 'polygon', 'label', 'icon' (a symbol in a shape the symbol
// panel offers, numbered markers included) or 'curve' (a symbol curve).
import { getNewShapeStyleFields } from './gui-shape-style-state';
import { NEW_LABEL_STYLE_FIELDS, PLACEMENT_FIELDS } from './gui-label-style-state';
import { ANCHORED_ONLY_FIELDS, getLabelTextCommand } from './gui-label-commands';
import { getIconStyle, getRestyleIconOptions } from './gui-symbol-style';
import { shapeTakesText } from './gui-marker-style';
import { getRestyleSymbolCommand } from './gui-symbol-commands';
import { quoteCommandValue } from './gui-command-utils';

var LABEL_FIELDS = NEW_LABEL_STYLE_FIELDS.filter(function(field) {
  return PLACEMENT_FIELDS.indexOf(field) == -1;
});

var CURVE_END_FIELDS = ['line-start', 'line-end', 'line-end-size', 'line-fade', 'line-taper'];
var CURVE_FILL_FIELDS = ['fill', 'fill-opacity'];
var CURVE_FIELDS = ['stroke', 'stroke-width', 'stroke-opacity', 'opacity']
  .concat(CURVE_END_FIELDS, CURVE_FILL_FIELDS);

// The text style of a numbered marker, as the symbol panel writes it (see
// getMarkerTextFields()). dy is in em, so it goes with the font size.
var MARKER_TEXT_FIELDS = ['font-family', 'font-size', 'font-style', 'font-weight',
  'fill', 'dy'];

// The style of @obj, or null for an object with none that can be pasted
export function copyObjectStyle(obj) {
  var rec = obj && obj.rec || {};
  var icon;
  if (!obj) return null;
  if (obj.kind == 'line' || obj.kind == 'polygon') {
    return {kind: obj.kind, values: readFields(rec, getShapeFields(obj.kind))};
  }
  if (obj.kind == 'label') {
    return {kind: 'label', values: readFields(rec, LABEL_FIELDS)};
  }
  if (obj.kind == 'curve') {
    return {kind: 'curve', values: readFields(rec, CURVE_FIELDS)};
  }
  if (obj.kind == 'icon') {
    icon = getIconStyle(rec);
    if (!icon) return null;
    // -symbols makes a symbol again from these, so they are the whole symbol
    return {kind: 'icon', shape: icon.shape, options: getRestyleIconOptions(rec, icon),
      text: obj.marker ? readFields(rec, MARKER_TEXT_FIELDS) : null};
  }
  return null;
}

// Whether @style can be pasted onto @obj. A marker's text needs a shape with
// room for it, so a marker takes only the shapes a marker can have.
export function canPasteStyle(style, obj) {
  if (!style || !obj) return false;
  if (style.kind == 'line' || style.kind == 'polygon') {
    return obj.kind == 'line' || obj.kind == 'polygon';
  }
  if (style.kind == 'icon') {
    return obj.kind == 'icon' && (!obj.marker || shapeTakesText(style.shape));
  }
  return style.kind == obj.kind;
}

// The command string that pastes @style onto @targets, as one undo step, or
// '' if they all have it already. Targets it can not be pasted onto are
// skipped.
//
// opts.getRewrappedText(obj, values): the text a label block breaks into
//   with @values applied, or null if its lines stay as they are. A block's
//   breaks are only right for the font they were found with, so a new font
//   rewraps it in the same command, as in the label panel.
export function getPasteStyleCommand(style, targets, opts) {
  var objects = (targets || []).filter(function(obj) {
    return canPasteStyle(style, obj);
  });
  var cmds = style && style.kind == 'icon' ?
    getIconPasteCommands(style, objects) :
    getFieldPasteCommands(style, objects, opts || {});
  return cmds.join(' ');
}

function getIconPasteCommands(style, objects) {
  var key = JSON.stringify(style.options);
  var cmds = [];
  var ids = objects.filter(function(obj) {
    var icon = getIconStyle(obj.rec || {});
    return !icon || JSON.stringify(getRestyleIconOptions(obj.rec || {}, icon)) != key;
  }).map(getId);
  if (ids.length > 0) {
    cmds.push(getRestyleSymbolCommand(style.options, ids));
  }
  // -symbols keeps a marker's text, which the text style is written to after
  if (style.text) {
    groupValues(objects.filter(function(obj) { return obj.marker; }), function(obj) {
      return getChangedValues(style.text, obj.rec);
    }).forEach(function(group) {
      cmds.push(formatFieldCommand('-labels', group.values, group.ids));
    });
  }
  return cmds;
}

function getFieldPasteCommands(style, objects, opts) {
  var cmds = [];
  var groups = groupValues(objects, function(obj) {
    return getChangedValues(getPasteValues(style, obj), obj.rec);
  });
  groups.forEach(function(group) {
    cmds.push(formatFieldCommand(style.kind == 'label' ? '-labels' : '-style',
      group.values, group.ids));
  });
  if (style.kind == 'label' && opts.getRewrappedText) {
    groups.forEach(function(group) {
      group.objects.forEach(function(obj) {
        var text = opts.getRewrappedText(obj, group.values);
        if (typeof text == 'string') cmds.push(getLabelTextCommand(text, obj.id, null));
      });
    });
  }
  return cmds;
}

// The fields of @style that apply to @obj
function getPasteValues(style, obj) {
  var values = Object.assign({}, style.values);
  var fields;
  if (style.kind == 'line' || style.kind == 'polygon') {
    fields = getShapeFields(obj.kind);
    return pick(values, function(field) { return fields.indexOf(field) > -1; });
  }
  if (style.kind == 'label') {
    // A position is taken only from a label that has one (see
    // syncNewLabelStyle()), and a path label has neither a position nor a box.
    return pick(values, function(field) {
      if (field == 'label-pos' && (values[field] === '' || obj.pathLabel)) return false;
      return !(obj.pathLabel && ANCHORED_ONLY_FIELDS.indexOf(field) > -1);
    });
  }
  if (style.kind == 'curve') {
    // A closed curve has no ends, and an open one no fill
    return pick(values, function(field) {
      return (obj.closed ? CURVE_END_FIELDS : CURVE_FILL_FIELDS).indexOf(field) == -1;
    });
  }
  return values;
}

// Groups @objects by the values @getValues(obj) gives them, leaving out the
// ones with none: [{values, ids, objects}]
function groupValues(objects, getValues) {
  var index = {};
  var groups = [];
  objects.forEach(function(obj) {
    var values = getValues(obj);
    var key;
    if (Object.keys(values).length === 0) return;
    key = JSON.stringify(values);
    if (!index[key]) {
      index[key] = {values: values, ids: [], objects: []};
      groups.push(index[key]);
    }
    index[key].ids.push(obj.id);
    index[key].objects.push(obj);
  });
  return groups;
}

// The values that differ from @rec's. Only these are written, so that unsetting
// a property that a target has no value for does not add an empty column.
function getChangedValues(values, rec) {
  return pick(values, function(field) {
    return String(normalize(values[field])) !== String(normalize(rec && rec[field]));
  });
}

// A number is written bare and anything else quoted, so that each value is
// stored as the type it had on the object copied: a quoted value is a string.
function formatFieldCommand(name, values, ids) {
  var parts = [name];
  Object.keys(values).forEach(function(field) {
    var val = values[field];
    parts.push(field + '=' + (val === '' ? '' :
      typeof val == 'number' ? String(val) : quoteCommandValue(val)));
  });
  parts.push('ids=' + ids.join(','));
  return parts.join(' ');
}

function getShapeFields(kind) {
  return getNewShapeStyleFields(kind == 'polygon' ? 'polygon' : 'polyline');
}

function readFields(rec, fields) {
  var o = {};
  fields.forEach(function(field) {
    o[field] = normalize(rec[field]);
  });
  return o;
}

function pick(values, test) {
  var o = {};
  Object.keys(values).forEach(function(field) {
    if (test(field)) o[field] = values[field];
  });
  return o;
}

function normalize(val) {
  return val === undefined || val === null ? '' : val;
}

function getId(obj) {
  return obj.id;
}
