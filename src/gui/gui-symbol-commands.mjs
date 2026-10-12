import { quoteCommandValue } from './gui-command-utils';

// Turns symbol tool state into the commands the tool runs, as pure functions
// so that they can be tested without a map. Every edit goes through a command,
// which is what gives the tool undo/redo and session history.
//
// See docs/development/symbol-tool-design.md.

export var DEFAULT_SYMBOL_LAYER_NAME = 'symbols';

// Where a hand-placed symbol goes, given the active layer.
//
// A layer of annotations -- one with labels or symbols in it -- takes it, as
// does an empty point layer. Any other layer gets a new layer beside it: a
// symbol joining a layer of cities would be a feature with no attributes.
//
//   lyr: the active layer, or null/undefined if there is none
//   isAnnotationLayer: function(lyr) -> true for a point layer with labels or
//     SVG symbols in it
// Returns {mode, newLayerName, target}, as getLabelTarget() does: mode is
//   'existing' or 'new', and target is the layer the command runs against,
//   which is the active layer either way.
export function getSymbolTarget(lyr, isAnnotationLayer) {
  var name = lyr && lyr.name || null;
  if (!lyr) {
    return {mode: 'new', newLayerName: DEFAULT_SYMBOL_LAYER_NAME, target: null};
  }
  if (lyr.geometry_type == 'point' &&
      (getFeatureCount(lyr) === 0 || isAnnotationLayer(lyr))) {
    return {mode: 'existing', target: name};
  }
  return {mode: 'new', newLayerName: DEFAULT_SYMBOL_LAYER_NAME, target: name};
}

// coords: [[x, y], ...] in CRS coordinates: one point for an icon, two or more
//   for a curve (with the first repeated at the end for a closed one)
// opts:
//   options: -symbols options, e.g. {type: 'star', radius: 8, fill: '#c00'}
//   target: a {mode, newLayerName, target} from getSymbolTarget()
export function getAddSymbolCommand(coords, opts) {
  var o = opts || {};
  var target = o.target || {mode: 'new', newLayerName: DEFAULT_SYMBOL_LAYER_NAME};
  var parts = ['-symbols', 'coordinates=' + formatCoords(coords)];
  var options = o.options || {};
  Object.keys(options).forEach(function(name) {
    var val = options[name];
    if (val === undefined || val === null || val === '') return;
    parts.push(name + '=' + formatValue(val));
  });
  if (target.mode == 'new') {
    parts.push('no-replace');
    parts.push('name=' + formatValue(target.newLayerName || DEFAULT_SYMBOL_LAYER_NAME));
  }
  if (target.target) {
    parts.push('target=' + formatValue(target.target));
  }
  return parts.join(' ');
}

// The command that moves a symbol or reshapes a curve, run once when a drag
// is released, so that a drag is one undo step.
export function getUpdateSymbolCommand(coords, id, target) {
  var parts = ['-update-symbol', 'ids=' + id, 'coordinates=' + formatCoords(coords)];
  if (target) parts.push('target=' + formatValue(target));
  return parts.join(' ');
}

// The command that restyles symbols.
//   values: {field: value}, where '' removes the field
//   ids: feature ids, or null for the whole layer
export function getSymbolStyleCommand(values, ids, target) {
  var parts = ['-style'];
  Object.keys(values).forEach(function(name) {
    var val = values[name];
    parts.push(name + '=' + (val === '' || val === null || val === undefined ?
      '' : formatValue(val)));
  });
  if (ids) parts.push('ids=' + ids.join(','));
  if (target) parts.push('target=' + formatValue(target));
  return parts.join(' ');
}

// The command that removes symbols. -filter rather than a symbol command,
// since dropping features is what a CLI user would write.
export function getSymbolDeleteCommand(ids, target) {
  var expr = ids.length == 1 ? 'this.id !== ' + ids[0] :
    '[' + ids.join(',') + '].indexOf(this.id) == -1';
  var parts = ['-filter', quoteCommandValue(expr)];
  if (target) parts.push('target=' + formatValue(target));
  return parts.join(' ');
}

// A plain token -- a number, a name, a hex color -- needs no quotes, and
// leaving them off keeps the session history readable.
function formatValue(val) {
  var str = String(val);
  return /^[A-Za-z0-9#._-]+$/.test(str) ? str : quoteCommandValue(str);
}

// Coordinates are written at full precision: rounding would move a symbol
// placed against a map feature.
function formatCoords(coords) {
  var parts = [];
  for (var i = 0; i < coords.length; i++) {
    parts.push(coords[i][0], coords[i][1]);
  }
  return parts.join(',');
}

function getFeatureCount(lyr) {
  if (lyr.shapes) return lyr.shapes.length;
  if (lyr.data) return lyr.data.size();
  return 0;
}
