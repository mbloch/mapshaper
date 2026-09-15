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
//   corners: knot indexes to treat as corners
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
  if (o.corners && o.corners.length > 0) {
    parts.push('corners=' + o.corners.join(','));
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
// property on the feature that nothing reads.
function getStyleFields(style, isPathLabel) {
  return Object.keys(style || {}).filter(function(name) {
    return !(isPathLabel && name == 'label-pos');
  });
}

// The command that moves a label, run once when a knot or anchor drag is
// released so that a drag is one undo step rather than one per mouse move.
//
// Corners are left out deliberately: they are knot indexes, and a move changes
// where a knot is rather than how many there are, so -update-label keeps the
// ones already stored.
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

// The command that saves edited text, run once when an editing session ends so
// that a session is one undo step rather than one per keystroke.
//
//   text: the edited string, with real newlines
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
