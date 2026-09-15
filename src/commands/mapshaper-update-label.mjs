import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { getFeatureCount, getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { featureIsLabel } from '../svg/svg-feature-utils';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import {
  parseLabelCoords, warnIfCurveIsUnprojected
} from './mapshaper-label-geom';

var OPERATION = 'update-label';

cmd.updateLabel = updateLabel;

// Rewrites the knots of a label that already exists.
//
// -add-label creates and -style sets properties, so neither can move a label:
// a label's knots are its geometry, not an attribute. This is the command the
// GUI emits when a knot or an anchor is dragged, so that an interactive move is
// an ordinary command with undo and session history rather than a direct
// mutation with hand-rolled undo.
//
// See docs/development/label-tool-design.md.
export function updateLabel(targetLayers, dataset, opts) {
  var lyr, id, coords, rec;
  if (targetLayers.length > 1) {
    // One coordinate list describes one label, so there is no sensible reading
    // of this across layers.
    stop('Command expects a single target layer');
  }
  lyr = targetLayers[0];
  id = getTargetId(lyr, opts);
  coords = parseLabelCoords(opts.coordinates);
  rec = getLayerDataTable(lyr).getRecords()[id];
  if (!featureIsLabel(rec)) {
    // Moving an arbitrary point through a command named -update-label would be
    // a surprising way to succeed, and in the GUI it would mean the hit test
    // handed over the wrong feature.
    stop('Feature', id, 'in layer "' + layerName(lyr) + '" is not a label ' +
      '(it has no label-text property)');
  }
  warnIfCurveIsUnprojected(dataset, coords.length);
  // Undo works from what a command declares it is about to change, so an edit
  // that does not say so is an edit that cannot be undone -- the shapes array
  // keeps its identity here, leaving nothing for the transaction to notice
  // afterwards.
  noteLayerWillChange(lyr, {operation: OPERATION, unit: 'shapes'});
  // Point shapes hold their coordinates directly, so this is the whole edit.
  // The pairs are copied rather than aliased: the GUI drags a live copy of the
  // knots and would otherwise keep a handle on the layer's own arrays.
  lyr.shapes[id] = coords.map(function(p) { return [p[0], p[1]]; });
  markLayerChanged(lyr, {operation: OPERATION, unit: 'shapes'});
  // label-text-width is deliberately left alone. It measures the *text*, and
  // moving a knot changes the length of the path instead; the fit check
  // compares the two at render time, measuring the curve as it then stands. So
  // a move can turn a fitting label into an overflowing one without the
  // stored measurement going stale.
}

// Which feature to move. One coordinate list can only describe one label, so
// this takes a single id rather than the ids= list that -style accepts.
function getTargetId(lyr, opts) {
  var ids = opts.ids;
  var id;
  requirePointLayer(lyr);
  if (!ids || ids.length === 0) {
    stop('Missing required ids parameter (the feature id of the label to update)');
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

function requirePointLayer(lyr) {
  if (!lyr || getFeatureCount(lyr) === 0) {
    stop('Missing a target layer containing labels');
  }
  if (lyr.geometry_type != 'point') {
    stop('Labels can only be updated in a point layer; target "' +
      layerName(lyr) + '" contains ' + (lyr.geometry_type || 'no geometry'));
  }
}

function layerName(lyr) {
  return lyr && lyr.name || '[unnamed]';
}
