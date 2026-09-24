import { quoteCommandValue } from './gui-command-utils';
import { encodeLabelText } from './gui-label-text';

// Turns label tool state into the commands the tool runs, as pure functions so
// that they can be tested without a map. Every GUI edit goes through a command,
// which is what gives the tool undo/redo and session history for free.
//
// See docs/development/label-tool-design.md.

var DEFAULT_LABEL_LAYER_NAME = 'labels';

// Where an interactively created label goes, given the target layer.
//
// Both kinds of label are point features, so a layer that cannot hold one gets
// a new layer instead of an error -- unlike the CLI, where naming a target
// explicitly means refusing is more helpful than guessing.
//
//   lyr: the active layer, or null/undefined if there is none
// Returns:
//   mode:         'existing' to join the target layer, 'new' for a layer of its own
//   newLayerName: name for that new layer, when mode is 'new'
//   target:       the layer the command runs against, which is the active layer
//     either way. A new layer cannot be the command's target, because target=
//     is resolved before the command runs and the layer does not exist yet.
export function getLabelTarget(lyr, layerHasLabels) {
  var name = lyr && lyr.name || null;
  if (!lyr) {
    return {mode: 'new', newLayerName: DEFAULT_LABEL_LAYER_NAME, target: null};
  }
  // A layer with a label-text field is a label layer even if every value is
  // blank -- blank labels are what a freshly created one looks like.
  if (layerHasLabels(lyr)) {
    return {mode: 'existing', target: name};
  }
  // An empty point layer has nothing to conflict with, so adopt it rather than
  // leaving the user with an empty layer beside a new one.
  if (lyr.geometry_type == 'point' && getFeatureCount(lyr) === 0) {
    return {mode: 'existing', target: name};
  }
  return {mode: 'new', newLayerName: DEFAULT_LABEL_LAYER_NAME, target: name};
}

function getFeatureCount(lyr) {
  if (lyr.shapes) return lyr.shapes.length;
  if (lyr.data) return lyr.data.size();
  return 0;
}

// coords: [[x, y], ...] in CRS coordinates. One pair makes an anchored label,
//   several make a path-aligned one.
// opts:
//   target: a {mode, name} from getLabelTarget()
//   text: the label's text, with real newlines. A label is created with the
//     text it was typed into, so there is one command per new label rather
//     than a creation followed by a text edit -- and so that a label with
//     nothing in it is never created at all.
//   style: properties to set on the new label, e.g. {'font-size': 14}
export function getAddLabelCommand(coords, opts) {
  var o = opts || {};
  var target = o.target || {mode: 'new', newLayerName: DEFAULT_LABEL_LAYER_NAME};
  var parts = ['-add-label', 'coordinates=' + formatCoords(coords)];
  if (o.text) {
    // A real newline would break the command parser, so encodeLabelText()
    // writes the two-character escape the label renderer also accepts.
    parts.push('text=' + quoteCommandValue(encodeLabelText(o.text)));
  }
  getStyleFields(o.style, coords.length > 1).forEach(function(name) {
    parts.push(name + '=' + quoteCommandValue(o.style[name]));
  });
  if (target.mode == 'new') {
    // no-replace keeps the current target intact and puts the label in a layer
    // of its own
    parts.push('no-replace');
    parts.push('name=' + quoteCommandValue(target.newLayerName || DEFAULT_LABEL_LAYER_NAME));
  }
  // Naming the target makes the command reproducible from the session history,
  // where the active layer at replay time may not be the one that was active
  // when the label was made. An unnamed layer has to fall back on whatever the
  // current target is.
  if (target.target) {
    parts.push('target=' + quoteCommandValue(target.target));
  }
  return parts.join(' ');
}

// Which of the panel's style properties apply to the label being created.
//
// label-pos places text relative to an anchor point, which a path label does
// not have -- its text runs along the curve. Writing it there would put a
// property on the feature that nothing reads. label-width is the same: a path
// label is one line.
function getStyleFields(style, isPathLabel) {
  return Object.keys(style || {}).filter(function(name) {
    return !(isPathLabel && (name == 'label-pos' || name == 'label-width'));
  });
}

// The command that moves a label, run once when a knot or anchor drag is
// released so that a drag is one undo step rather than one per mouse move.
//
//   coords: the label's knots after the move, in CRS coordinates
//   id:     feature id of the label
//   target: layer name, or null to use the current target
export function getUpdateLabelCommand(coords, id, target) {
  var parts = ['-update-label', 'ids=' + id,
    'coordinates=' + formatCoords(coords)];
  if (target) parts.push('target=' + quoteCommandValue(target));
  return parts.join(' ');
}

// The command that places a path label's text on its curve, run once when a
// drag on the glyphs is released.
//
// Sliding writes one property. Flipping writes three things that have to agree
// -- the reversed knots, the offset measured from the other end, and the
// swapped text-anchor -- so they go in one command string: the console runs it
// as a single transaction, which makes a flip one undo step and one line of
// session history rather than two of each, and leaves no state in which the
// knots have turned around but the text has not.
//
//   offset: the value for label-start-offset, e.g. '42%'
//   anchor: the value for text-anchor, or '' to leave it alone
//   coords: the label's knots after a flip, in CRS coordinates, or null when
//     the text only slid
//   id:     feature id of the label
//   target: layer name, or null to use the current target
export function getLabelPlacementCommand(opts) {
  var parts = ['-style', 'label-start-offset=' + opts.offset];
  if (opts.anchor) {
    parts.push('text-anchor=' + opts.anchor);
  }
  parts.push('ids=' + opts.id);
  if (opts.target) parts.push('target=' + quoteCommandValue(opts.target));
  if (opts.coords) {
    parts.push(getUpdateLabelCommand(opts.coords, opts.id, opts.target));
  }
  return parts.join(' ');
}

// The command that offsets a label's text from its anchor, run once when a
// drag on the glyphs is released in Draggable mode.
//
// All three properties, not a delta: a value on the record wins over the
// position per property, so the drag materializes what the label was drawn
// with and the position goes -- "stop taking a position, carry these offsets
// instead", which is one command because it is one edit.
//
// label-pos= is always written, even by a label that has none. -style reads an
// empty value as "remove this", and removing a property no record carries adds
// nothing to the layer, so there is nothing to be gained by asking first.
//
//   dx, dy: the offsets, in px
//   anchor: the value for text-anchor
//   id:     feature id of the label
//   target: layer name, or null to use the current target
//   via:    (optional) the callout-via the text carried with it
export function getLabelOffsetCommand(opts) {
  var parts = ['-style', 'dx=' + opts.dx, 'dy=' + opts.dy,
    'text-anchor=' + opts.anchor, 'label-pos='];
  if (opts.via) parts.push('callout-via=' + quoteCommandValue(opts.via));
  parts.push('ids=' + opts.id);
  if (opts.target) parts.push('target=' + quoteCommandValue(opts.target));
  return parts.join(' ');
}

// The command a drag on one of a label's handles writes, run once on release.
//
//   values: {field: value}, where '' removes the field -- which is what
//     -style reads an empty value as, and how a handle goes back to automatic
//   id:     feature id of the label
//   opts:
//     target: layer name, or null to use the current target
//     text:   (optional) rewrapped label-text, with real newlines and soft
//       breaks. A second -style in the same string, so that a new width and
//       the lines it breaks into are one undo step.
export function getLabelStyleCommand(values, id, opts) {
  var o = opts || {};
  var parts = ['-style'];
  Object.keys(values).forEach(function(name) {
    var val = values[name];
    parts.push(name + '=' + (val === '' ? '' : quoteCommandValue(String(val))));
  });
  parts.push('ids=' + id);
  if (o.target) parts.push('target=' + quoteCommandValue(o.target));
  if (typeof o.text == 'string') {
    parts.push(getLabelTextCommand(o.text, id, o.target));
  }
  return parts.join(' ');
}

// The command that saves edited text, run once when an editing session ends so
// that a session is one undo step rather than one per keystroke.
//
//   text: the edited string, with real newlines and any soft breaks
//   id:   feature id of the label
//   target: layer name, or null to use the current target
export function getLabelTextCommand(text, id, target) {
  // A real newline would break the command parser, so encodeLabelText() writes
  // the two-character escape that the label renderer also accepts.
  var parts = ['-style', 'label-text=' + quoteCommandValue(encodeLabelText(text))];
  parts.push('ids=' + id);
  if (target) parts.push('target=' + quoteCommandValue(target));
  return parts.join(' ');
}

// The command that removes a label, run when an editing session ends with no
// glyphs left in the text.
//
// -filter rather than a label-specific command: dropping a feature is not a
// label operation, and it is what a CLI user would write. The expression is
// negated on a single id rather than listing the ones to keep, so the command
// stays the same length whatever the layer's size.
//
//   id:     feature id of the label to remove
//   target: layer name, or null to use the current target
export function getLabelDeleteCommand(id, target) {
  var parts = ['-filter', quoteCommandValue('this.id !== ' + id)];
  if (target) parts.push('target=' + quoteCommandValue(target));
  return parts.join(' ');
}

// Coordinates are written at full precision: they are the label's geometry, and
// rounding them would move a curve that was placed against a map feature.
function formatCoords(coords) {
  var parts = [];
  for (var i = 0; i < coords.length; i++) {
    parts.push(coords[i][0], coords[i][1]);
  }
  return parts.join(',');
}
