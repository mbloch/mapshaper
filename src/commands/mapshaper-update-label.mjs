import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { getFeatureCount, getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { featureIsLabel } from '../svg/svg-feature-utils';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import {
  parseLabelCoords, warnIfCurveIsUnprojected
} from './mapshaper-label-geom';

cmd.updateLabel = updateLabel;

var labelKind = {
  operation: 'update-label',
  noun: 'label',
  plural: 'labels',
  test: featureIsLabel,
  notKindReason: 'it has no label-text property'
};

// Rewrites the knots of a label that already exists.
//
// -add-label creates and -style sets properties, so neither can move a label:
// a label's knots are its geometry, not an attribute. This is the command the
// GUI emits when a knot or an anchor is dragged, so that an interactive move is
// an ordinary command with undo and session history rather than a direct
// mutation with hand-rolled undo.
//
// Nothing about the label's text is touched, and nothing needs to be: a text
// measurement describes the *text*, and moving a knot changes the length of
// the *path*. The fit check compares the two at render time, against the
// curve as it then stands, so a move can turn a fitting label into an
// overflowing one with no measurement going out of date.
//
// See docs/development/label-tool-design.md.
export function updateLabel(targetLayers, dataset, opts) {
  updatePointFeature(targetLayers, dataset, opts, labelKind);
}

// Replaces the points of one feature of a point layer, which must be of the
// kind described by @kind -- -update-symbol shares this with -update-label.
// kind: {operation, noun, plural, test(rec), notKindReason, validate(rec, coords)}
export function updatePointFeature(targetLayers, dataset, opts, kind) {
  var lyr, id, coords, rec;
  if (targetLayers.length > 1) {
    // One coordinate list describes one feature, so there is no sensible
    // reading of this across layers.
    stop('Command expects a single target layer');
  }
  lyr = targetLayers[0];
  id = getTargetId(lyr, opts, kind);
  coords = parseLabelCoords(opts.coordinates);
  rec = getLayerDataTable(lyr).getRecords()[id];
  if (!kind.test(rec)) {
    // Moving an arbitrary point through a command named for a kind of feature
    // would be a surprising way to succeed, and in the GUI it would mean the
    // hit test handed over the wrong feature.
    stop('Feature', id, 'in layer "' + layerName(lyr) + '" is not a ' + kind.noun +
      ' (' + kind.notKindReason + ')');
  }
  if (kind.validate) kind.validate(rec, coords);
  warnIfCurveIsUnprojected(dataset, coords.length);
  // Undo works from what a command declares it is about to change, so an edit
  // that does not say so is an edit that cannot be undone -- the shapes array
  // keeps its identity here, leaving nothing for the transaction to notice
  // afterwards.
  noteLayerWillChange(lyr, {operation: kind.operation, unit: 'shapes'});
  // Point shapes hold their coordinates directly, so this is the whole edit.
  // The pairs are copied rather than aliased: the GUI drags a live copy of the
  // knots and would otherwise keep a handle on the layer's own arrays.
  lyr.shapes[id] = coords.map(function(p) { return [p[0], p[1]]; });
  markLayerChanged(lyr, {operation: kind.operation, unit: 'shapes'});
}

// Which feature to move. One coordinate list can only describe one feature, so
// this takes a single id rather than the ids= list that -style accepts.
function getTargetId(lyr, opts, kind) {
  var ids = opts.ids;
  var id;
  requirePointLayer(lyr, kind);
  if (!ids || ids.length === 0) {
    stop('Missing required ids parameter (the feature id of the ' + kind.noun + ' to update)');
  }
  if (ids.length > 1) {
    stop('Command expects a single feature id; received', ids.join(','));
  }
  id = ids[0];
  if (id >= 0 === false || id >= getFeatureCount(lyr)) {
    stop('Layer "' + layerName(lyr) + '" has no feature with id', id);
  }
  if (!lyr.shapes || !lyr.shapes[id]) {
    stop('Feature', id, 'in layer "' + layerName(lyr) + '" has no geometry');
  }
  return id;
}

function requirePointLayer(lyr, kind) {
  var Plural = kind.plural.charAt(0).toUpperCase() + kind.plural.slice(1);
  if (!lyr || getFeatureCount(lyr) === 0) {
    stop('Missing a target layer containing ' + kind.plural);
  }
  if (lyr.geometry_type != 'point') {
    stop(Plural + ' can only be updated in a point layer; target "' +
      layerName(lyr) + '" contains ' + (lyr.geometry_type || 'no geometry'));
  }
}

function layerName(lyr) {
  return lyr && lyr.name || '[unnamed]';
}
