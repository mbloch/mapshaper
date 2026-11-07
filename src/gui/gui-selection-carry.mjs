import { internal } from './gui-core';

// Whether a feature belongs to the tool of @mode, on a layer the label tool and
// the symbol tool share: a numbered marker is a label to the data and a symbol
// to the GUI (see featureIsMarker()). Every feature belongs in the other modes.
// rec: the feature's data record, or null
export function featureBelongsToMode(mode, rec) {
  var svg = internal.svg;
  if (mode == 'label') return !svg.featureIsMarker(rec);
  if (mode == 'symbols') return !svg.featureIsTextLabel(rec);
  return true;
}

export function modeHasOwnedFeatures(mode) {
  return mode == 'label' || mode == 'symbols';
}

// The modes a selection can be carried into when the user switches tools.
// Inspect ('info', and the older 'data') takes the first feature as its pinned
// one. Left out: modes that do not select ('edit_points', where a click adds a
// point and Delete removes whatever is selected, unseen), modes with a drawing
// or reshaping tool armed, and the older 'label_style' mode.
var carryModes = ['info', 'data', 'selection', 'label', 'symbols', 'point_style',
  'line_style', 'polygon_style'];

// Returns the part of a selection made in one interaction mode that stays
// selected when another mode opens on the same layer.
// ids: selected feature ids
// toolMode: what the pointer does in the new mode (see getToolMode())
// lyr: the layer, {shapes, data}
export function filterSelectionForMode(ids, toolMode, lyr) {
  var records, n;
  if (!ids || ids.length === 0 || !lyr || !lyr.shapes) return [];
  if (!carryModes.includes(toolMode)) return [];
  records = lyr.data ? lyr.data.getRecords() : null;
  n = lyr.shapes.length;
  return ids.filter(function(id) {
    // a feature with no geometry cannot be seen or clicked on the map
    return id >= 0 && id < n && !!lyr.shapes[id] &&
      featureBelongsToMode(toolMode, records ? records[id] : null);
  });
}
