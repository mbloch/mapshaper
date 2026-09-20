import { quoteCommandValue } from './gui-command-utils';

// Turns the layer panel's "Draw" links into the commands they run, as pure
// functions so that they can be tested without a DOM. Layer creation goes
// through -add-layer for the same reason every label edit goes through a
// command: undo/redo and session history come with it.

// What the panel offers to draw, in the order the links appear.
//
// Labels are listed beside the geometry types rather than as a point layer the
// user has to know to ask for: both make a point layer, and what differs is the
// tool that opens. Each kind names the layer it creates, because a tool that
// follows can then name its target and so replay from the session history (see
// getLabelTarget() in gui-label-commands.mjs).
//
// The tip says that a layer is created, which the links themselves no longer
// say: they are named for the drawing, which is what the user came to do.
export var DRAW_KINDS = [{
  kind: 'labels',
  geometryType: 'point',
  name: 'labels',
  mode: 'label',
  tip: 'Create a new layer and add labels to it'
}, {
  kind: 'points',
  geometryType: 'point',
  name: 'points',
  mode: 'edit_points',
  tip: 'Create a new layer and add points to it'
}, {
  kind: 'lines',
  geometryType: 'polyline',
  name: 'lines',
  mode: 'edit_lines',
  tip: 'Create a new layer and draw lines in it'
}, {
  kind: 'polygons',
  geometryType: 'polygon',
  name: 'polygons',
  mode: 'edit_polygons',
  tip: 'Create a new layer and draw polygons in it'
}];

export function findDrawKind(kind) {
  return DRAW_KINDS.filter(function(o) {
    return o.kind == kind;
  })[0] || null;
}

// The command a link runs.
//
//   geometryType: 'point', 'polygon' or 'polyline'
//   name: name for the new layer, or falsy to leave it unnamed
export function getAddLayerCommand(geometryType, name) {
  var parts = ['-add-layer', 'geometry-type=' + geometryType];
  if (name) {
    parts.push('name=' + quoteCommandValue(name));
  }
  return parts.join(' ');
}

// A name no layer is using yet, e.g. 'labels2' in a project that already has a
// 'labels'. Two layers of the same name make target= ambiguous, which the
// commands the drawing and label tools run treat as an error rather than
// guessing between them.
//
//   kind: an entry from DRAW_KINDS
//   existingNames: the names of the layers in the project
export function getNewLayerName(kind, existingNames) {
  var names = existingNames || [];
  var name = kind.name;
  var i = 1;
  // 'labels' then 'labels2', which is the suffix utils.formatVersionedName()
  // adds. None of the names above ends in a digit, so none of them takes the
  // '-2' form it uses to keep such a name readable.
  while (names.indexOf(name) > -1) {
    name = kind.name + ++i;
  }
  return name;
}

// Whether a layer is one this link would have created, and so can draw into
// instead of making another: an empty layer of the right geometry type. Without
// this, clicking a link twice leaves the first layer behind, empty.
//
// Only the geometry type is asked about, as getLabelTarget() does when it adopts
// an empty point layer for a label. So an empty 'points' layer is what a click
// on "labels" draws into, rather than a 'labels' layer beside it: the name is
// then wrong for what the layer holds, but a layer named for what the user
// abandoned is better than an abandoned layer.
export function kindFitsLayer(kind, lyr) {
  if (!lyr || lyr.geometry_type != kind.geometryType) return false;
  return getFeatureCount(lyr) === 0;
}

// Local rather than internal.getFeatureCount(), to keep this module free of
// gui-core -- as gui-label-commands.mjs is, and for the same reason.
function getFeatureCount(lyr) {
  if (lyr.shapes) return lyr.shapes.length;
  if (lyr.data) return lyr.data.size();
  return 0;
}
