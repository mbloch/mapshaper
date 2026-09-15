import cmd from '../mapshaper-cmd';
import { stop, warn } from '../utils/mapshaper-logging';
import { getFeatureCount, getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { featureIsLabel } from '../svg/svg-feature-utils';
import { parseKnotIndexList } from '../svg/svg-properties';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import {
  parseLabelCoords, warnIfCurveIsUnprojected, warnAboutOutOfRangeCorners
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
  // afterwards. captureLayerBefore() clones the shapes but holds the data table
  // by reference, so a corners change is declared separately below.
  noteLayerWillChange(lyr, {operation: OPERATION, unit: 'shapes'});
  // Point shapes hold their coordinates directly, so this is the whole edit.
  // The pairs are copied rather than aliased: the GUI drags a live copy of the
  // knots and would otherwise keep a handle on the layer's own arrays.
  lyr.shapes[id] = coords.map(function(p) { return [p[0], p[1]]; });
  markLayerChanged(lyr, {operation: OPERATION, unit: 'shapes'});
  updateCorners(lyr, rec, coords.length, opts);
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

// Corners are knot *indexes*, so they depend on the knot list this command has
// just replaced. Given explicitly they are replaced outright; left out they are
// kept, but pruned of anything the new knot list no longer has -- an index past
// the end would otherwise sit in the data marking a knot that does not exist.
function updateCorners(lyr, rec, knotCount, opts) {
  var corners;
  if (opts.corners === undefined) {
    pruneCorners(lyr, rec, knotCount);
    return;
  }
  corners = parseKnotIndexList(opts.corners);
  if (!corners) {
    stop('Invalid corners parameter:', opts.corners,
      '(expected a comma-separated list of knot indexes)');
  }
  if (knotCount < 3) {
    // the ends of a curve already have one-sided tangents, so marking them as
    // corners changes nothing
    if (corners.length > 0) {
      warn('Ignoring corners= on a label with', knotCount,
        knotCount == 1 ? 'point' : 'points');
    }
    setCorners(lyr, rec, null);
    return;
  }
  warnAboutOutOfRangeCorners(corners, knotCount);
  setCorners(lyr, rec, corners.length === 0 ? null : corners.join(','));
}

function pruneCorners(lyr, rec, knotCount) {
  var corners = parseKnotIndexList(rec['label-corners']);
  var kept;
  if (!corners || corners.length === 0) return;
  kept = knotCount < 3 ? [] : corners.filter(function(i) { return i < knotCount; });
  if (kept.length === corners.length) return;
  setCorners(lyr, rec, kept.length === 0 ? null : kept.join(','));
}

// A null value removes the property. The field itself is left in place: the
// layer's other labels may still use it, and a label with no corners is
// expressed by the absence of a value rather than the absence of a column.
function setCorners(lyr, rec, value) {
  var table = getLayerDataTable(lyr);
  var field = 'label-corners';
  if (value === null && !(field in rec)) return;
  if (rec[field] === value) return;
  table.captureFieldsBefore([field], {operation: OPERATION});
  if (value === null) {
    delete rec[field];
  } else {
    rec[field] = value;
  }
  table.markFieldsChanged([field], {operation: OPERATION});
}

function layerName(lyr) {
  return lyr && lyr.name || '[unnamed]';
}
