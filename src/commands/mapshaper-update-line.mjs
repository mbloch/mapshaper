import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { getDatasetCrsInfo, setDatasetCrsInfo } from '../crs/mapshaper-projections';
import { toFeature, mergeShapeIntoDataset } from './mapshaper-add-shape';

cmd.updateLine = updateLine;

// Replaces the path of one line, keeping its attributes. The GUI's curve tool
// emits it when a knot of a curve is dragged, so that reshaping a curve is a
// command, with undo and session history.
//
// The new path's arcs are appended to the dataset's arcs, as -add-shape
// appends them, and the line's old arcs are left in place, unreferenced. A
// curve dragged many times leaves many of them behind, but rewriting the arcs
// instead would copy every vertex in the dataset on every drag, and an undo
// state would keep each copy. Commands that rewrite arcs prune unreferenced
// arcs, and the rest ignore them.
//
// The line goes in a copy of the target layer, which replaces it (see
// extendLine() in mapshaper-add-shape.mjs): undo then restores the old layer,
// and the arcs it refers to are still there.
export function updateLine(targetLayers, dataset, opts) {
  var lyr, id, feature, imported, pathLyr, outputLyr;
  if (targetLayers.length > 1) {
    stop('Command expects a single target layer');
  }
  lyr = targetLayers[0];
  id = getTargetId(lyr, opts);
  feature = toFeature({coordinates: opts.coordinates}, 'polyline');
  if (feature.geometry.type != 'LineString') {
    stop('Command expects a single path');
  }
  imported = importGeoJSON(feature);
  setDatasetCrsInfo(imported, getDatasetCrsInfo(dataset));
  pathLyr = mergeShapeIntoDataset(dataset, imported)[0];
  if (!pathLyr.shapes[0]) {
    stop('Invalid path coordinates');
  }
  outputLyr = Object.assign({}, lyr, {shapes: lyr.shapes.concat()});
  outputLyr.shapes[id] = pathLyr.shapes[0];
  return [outputLyr];
}

function getTargetId(lyr, opts) {
  var ids = opts.ids;
  var id;
  if (!lyr || lyr.geometry_type != 'polyline') {
    stop('Command requires a polyline target layer');
  }
  if (!ids || ids.length === 0) {
    stop('Missing required ids parameter (the feature id of the line to update)');
  }
  if (ids.length > 1) {
    stop('Command expects a single feature id; received', ids.join(','));
  }
  id = ids[0];
  if (id >= 0 === false || id >= getFeatureCount(lyr)) {
    stop('Layer "' + (lyr.name || '[unnamed]') + '" has no feature with id', id);
  }
  if (!opts.coordinates) {
    stop('Missing required coordinates parameter');
  }
  return id;
}
