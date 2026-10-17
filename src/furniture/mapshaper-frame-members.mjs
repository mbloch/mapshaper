import { getFrameForDataset, getFrameMemberLayers, getFrameMembers } from '../furniture/mapshaper-frame-resolver';
import { findFrameLayerInDataset, isFrameComponentLayer } from '../furniture/mapshaper-frame-utils';
import { getFrameRef, setFrameRef } from '../dataset/mapshaper-frame-membership';
import { haveSameSimplification, rejoinDatasets } from '../dataset/mapshaper-merging';
import { getStackedLayers, moveLayersInStack, setFrameHidden } from '../dataset/mapshaper-layer-stacking';
import { groupLayersByDataset } from '../dataset/mapshaper-target-utils';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { forEachArcId } from '../paths/mapshaper-path-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';
import {
  crsHaveSameTransform,
  crsTransformsDiffer,
  getDatasetCRS,
  getDatasetCrsInfo,
  isLatLngCRS
} from '../crs/mapshaper-projections';
import { markDatasetChanged, noteDatasetWillChange } from '../undo/mapshaper-undo-tracking';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

// Moving layers between frames
//
// Membership belongs to datasets, so moving some of a dataset's layers splits
// them off into a dataset of their own. The new dataset keeps the source's ID,
// recording that the two have one lineage: when a dataset arrives where a
// dataset with its ID already is, the two are rejoined, so that boundaries
// that are still identical are shared again (see rejoinDatasets()).

// A frame's member layers (not the frame or its furniture), bottom to top
export function getFrameStack(catalog, frame) {
  var members = getFrameMemberLayers(catalog, frame).map(function(o) { return o.layer; });
  return getStackedLayers(catalog).filter(function(o) {
    return members.includes(o.layer);
  });
}

// How a -frame option that lists layers of @frame (hide-layers=, order-layers=,
// ...) refers to member @lyr: by name if that is unambiguous among the members,
// otherwise by its number among them, counting from 1 in catalog order.
export function getFrameMemberRef(catalog, frame, lyr) {
  var members = getFrameMemberLayers(catalog, frame);
  var name = lyr.name;
  var nameIsUsable = !!name && !/^[0-9]+$/.test(name) && !/[,*?:]/.test(name) &&
    members.filter(function(o) { return o.layer.name == name; }).length == 1;
  if (nameIsUsable) return name;
  return String(members.findIndex(function(o) { return o.layer == lyr; }) + 1);
}

// The frame's coordinate system: the first one that is known (from metadata,
// not guessed from coordinates) among the frame dataset and its members
export function getFrameCrsInfo(catalog, frame) {
  var dataset = [frame.dataset].concat(getFrameMembers(catalog, frame)).find(datasetHasCrsMetadata);
  return dataset ? getDatasetCrsInfo(dataset) : null;
}

// Moves layers into @frame, or out of their frames if @frame is null. Layers
// already in @frame are only restacked.
// @items [{layer, dataset}]
// @opts.position where moved layers go in the frame's stack: {above: <layer>},
//   {below: <layer>}, {top: true} (default) or {bottom: true}
// @opts.ordered stack the layers in the order of @items, first at the bottom
//   (otherwise they keep their order in the stack)
// @opts.reproject reproject layers whose coordinate system clearly differs from
//   the frame's, instead of stopping
export function moveLayersToFrame(catalog, items, frame, opts) {
  var operation = 'frame';
  var groups, projections;
  opts = opts || {};
  items.forEach(function(o) {
    if (isFrameComponentLayer(o.layer, o.dataset)) {
      stop('A map frame or its furniture cannot be moved into a frame:', o.layer.name || '[unnamed layer]');
    }
  });
  groups = groupLayersByDataset(items);
  // check coordinate systems before anything changes
  projections = groups.map(function(g) {
    return frame && !isInDestination(g.dataset, frame) ?
      getProjectionForJoin(catalog, frame, g.dataset, opts.reproject) : null;
  });
  groups.forEach(function(g, i) {
    var prevFrame = getFrameForDataset(catalog, g.dataset);
    var moved;
    if (isInDestination(g.dataset, frame)) return;
    moved = g.layers.length == g.dataset.layers.length && !findFrameLayerInDataset(g.dataset) ?
      g.dataset : splitLayersOff(catalog, g.dataset, g.layers);
    if (projections[i]) {
      cmd.proj(moved, catalog, {}, moved.layers, projections[i]);
      message('Reprojected', formatLayerNames(moved.layers), 'to the coordinate system of',
        frame.layer.name);
    }
    setFrameRef(moved, frame ? frame.dataset.id : null);
    if (prevFrame) {
      moved.layers.forEach(function(lyr) { setFrameHidden(lyr, false, operation); });
    }
    rejoinByLineage(catalog, moved);
  });
  if (frame) {
    moveLayersInStack(catalog, utils.pluck(items, 'layer'), opts.position || {top: true}, {
      group: getFrameMemberLayers(catalog, frame).map(function(o) { return o.layer; }),
      ordered: opts.ordered,
      operation: operation
    });
  }
}

// -merge-layers and -union combine layers from several datasets. Returns the
// frame of the target datasets, or null if none are in a frame. Layers in
// different frames cannot be combined.
export function getFrameForMerge(catalog, targets, commandName) {
  var frames = targets.reduce(function(memo, target) {
    var frame = getFrameForDataset(catalog, target.dataset);
    if (frame && !memo.some(function(f) { return f.dataset == frame.dataset; })) {
      memo.push(frame);
    }
    return memo;
  }, []);
  if (frames.length > 1) {
    stop('-' + commandName, 'cannot combine layers from different map frames:',
      utils.pluck(utils.pluck(frames, 'layer'), 'name').join(', '));
  }
  return frames[0] || null;
}

// Prepares the targets of a -merge-layers or -union whose output goes into
// @frame: targeted layers are split off from untargeted layers in the same
// dataset, so that only the targeted layers move. Coordinate systems of
// unframed layers are checked before anything changes.
export function splitOffMergeTargets(catalog, targets, frame, commandName) {
  var arriving = [];
  targets.forEach(function(target) {
    target.layers.forEach(function(lyr) {
      if (isFrameComponentLayer(lyr, target.dataset)) {
        stop('-' + commandName, 'cannot combine a map frame or its furniture with other layers');
      }
    });
    if (!isInDestination(target.dataset, frame)) {
      getProjectionForJoin(catalog, frame, target.dataset, false);
      arriving = arriving.concat(target.layers);
    }
  });
  if (arriving.length > 0) {
    message('Moved', formatLayerNames(arriving), 'into frame', frame.layer.name);
  }
  return targets.map(function(target) {
    var whole = target.layers.length == target.dataset.layers.length &&
      !findFrameLayerInDataset(target.dataset);
    return whole ? target : {
      layers: target.layers,
      dataset: splitLayersOff(catalog, target.dataset, target.layers)
    };
  });
}

// The ID that the output of a -merge-layers or -union in @frame keeps: the ID
// of a member dataset, so that later moves can still rejoin the output
export function getMergedMemberId(targets, frame) {
  var member = targets.find(function(target) {
    return getFrameRef(target.dataset) == frame.dataset.id;
  });
  return member ? member.dataset.id : null;
}

function isInDestination(dataset, frame) {
  if (frame) {
    return dataset == frame.dataset || getFrameRef(dataset) == frame.dataset.id;
  }
  return !getFrameRef(dataset) && !findFrameLayerInDataset(dataset);
}

// Returns CRS info to reproject the dataset with, or null if it can join as is
function getProjectionForJoin(catalog, frame, dataset, reproject) {
  var frameInfo = getFrameCrsInfo(catalog, frame);
  var frameCrs = frameInfo ? frameInfo.crs : getDatasetCRS(frame.dataset);
  var known = datasetHasCrsMetadata(dataset) ? getDatasetCRS(dataset) : null;
  var names = formatLayerNames(dataset.layers);
  // Two known projected systems must be the same projection. Lat-long data is
  // only kept apart from projected data, as everywhere else in mapshaper, so
  // that data in a different datum (or without metadata) can still join.
  var frameSpace = frameInfo ?
    {space: isLatLngCRS(frameCrs) ? 'latlong' : 'projected', known: true} :
    getCoordinateSpace(frame.dataset);
  if (known && frameInfo && !isLatLngCRS(known) && !isLatLngCRS(frameCrs) &&
      crsTransformsDiffer(known, frameCrs) ||
      coordinateSpacesConflict(getCoordinateSpace(dataset), frameSpace)) {
    if (reproject && frameInfo) return frameInfo;
    stop(names, 'and frame', frame.layer.name, 'have different coordinate systems.',
      frameInfo ? 'Use the reproject option to reproject the layers into the frame.' : '');
  }
  return null;
}

// {space: 'latlong' or 'projected', known: true if from CRS metadata}, or
// null if a dataset has no CRS and no coordinates. A dataset without CRS
// metadata whose coordinates are not lat-long counts as projected.
export function getCoordinateSpace(dataset) {
  var crs = getDatasetCRS(dataset);
  var known = datasetHasCrsMetadata(dataset);
  if (crs) return {space: isLatLngCRS(crs) ? 'latlong' : 'projected', known: known};
  return getDatasetBounds(dataset).hasBounds() ? {space: 'projected', known: false} : null;
}

// Two guesses from coordinates can be wrong (small projected coordinates look
// like degrees), so data is kept apart only if one side has CRS metadata
function coordinateSpacesConflict(a, b) {
  return !!a && !!b && a.space != b.space && (a.known || b.known);
}

// Layers drawn on one page have to be in one kind of coordinate space
export function requireSameCoordinateSpace(datasets, msg) {
  var spaces = datasets.map(getCoordinateSpace);
  if (spaces.some(function(a) {
    return spaces.some(function(b) { return coordinateSpacesConflict(a, b); });
  })) {
    stop(msg || 'Unable to combine projected and unprojected datasets');
  }
}

function datasetHasCrsMetadata(dataset) {
  var info = dataset.info || {};
  return !!(info.crs || info.crs_string || info.wkt1 || info.geopackage_crs || info.flatgeobuf_crs);
}

// Moves @layers into a new dataset with the same ID, placed next to @dataset
// in the catalog (before it, if the moved layers came first). Content in a
// frame dataset (from before frames had members) gets an ID of its own,
// because a frame dataset's ID identifies the frame.
function splitLayersOff(catalog, dataset, layers) {
  var part = {
    info: utils.extend({}, dataset.info),
    layers: dataset.layers.filter(function(lyr) { return layers.includes(lyr); }),
    arcs: dataset.arcs
  };
  var rest = dataset.layers.filter(function(lyr) { return !layers.includes(lyr); });
  var before = dataset.layers.indexOf(part.layers[0]) < dataset.layers.indexOf(rest[0]);
  if (!findFrameLayerInDataset(dataset)) part.id = dataset.id;
  if (layersShareArcs(dataset.arcs, part.layers, rest)) {
    message('Separated', formatLayerNames(part.layers), 'from', formatLayerNames(rest),
      '(they shared boundaries). Editing them separately can open gaps between them.');
  }
  noteDatasetWillChange(dataset, {operation: 'splitLayersOff', unit: 'layers'});
  dataset.layers = rest;
  dissolveArcs(part);
  dissolveArcs(dataset);
  markDatasetChanged(dataset, {operation: 'splitLayersOff', unit: 'layers'});
  catalog.insertDatasetAfter(part, dataset, before);
  return part;
}

function layersShareArcs(arcs, a, b) {
  var used, shared = false;
  if (!arcs) return false;
  used = new Uint8Array(arcs.size());
  a.filter(layerHasPaths).forEach(function(lyr) {
    forEachArcId(lyr.shapes, function(id) { used[absArcId(id)] = 1; });
  });
  b.filter(layerHasPaths).forEach(function(lyr) {
    forEachArcId(lyr.shapes, function(id) {
      if (used[absArcId(id)]) shared = true;
    });
  });
  return shared;
}

// Rejoins @dataset with a dataset of the same lineage in the same frame (or
// among unframed datasets), if both have the same simplification state and
// coordinate system
function rejoinByLineage(catalog, dataset) {
  var ref = getFrameRef(dataset);
  var candidates = catalog.getDatasets().filter(function(d) {
    return d != dataset && !!d.id && d.id == dataset.id && getFrameRef(d) == ref &&
      !findFrameLayerInDataset(d) && haveSameCRS(d, dataset);
  });
  var match = candidates.find(function(d) {
    return haveSameSimplification([d, dataset]);
  });
  if (candidates.length > 0 && !match) {
    message('Kept', formatLayerNames(dataset.layers), 'separate from',
      formatLayerNames(candidates[0].layers), 'because they are simplified differently');
  }
  if (match) {
    catalog.replaceDatasets([match, dataset], rejoinDatasets([match, dataset]));
  }
}

function haveSameCRS(a, b) {
  var P = getDatasetCRS(a), Q = getDatasetCRS(b);
  return !P || !Q || crsHaveSameTransform(P, Q);
}

function formatLayerNames(layers) {
  return layers.map(function(lyr) { return lyr.name || '[unnamed layer]'; }).join(', ');
}
