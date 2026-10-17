import {
  assertValidFrames,
  findFrameLayerInDataset,
  isFrameComponentLayer,
  isFrameLayer
} from '../furniture/mapshaper-frame-utils';
import { getFrameRef, setFrameRef } from '../dataset/mapshaper-frame-membership';

// Frame resolution
//
// A frame is a frame layer, alone in its dataset with any furniture; the ID of
// that dataset identifies the frame. A content dataset belongs to a frame if
// its info.frame property holds the frame's ID. Frames are returned as
// {layer, dataset} pairs.

// All frames, in catalog order
export function getFrames(catalog) {
  return catalog.getLayers().filter(function(o) {
    return isFrameLayer(o.layer, o.dataset.arcs);
  });
}

export function getFrameById(catalog, id) {
  if (!id) return null;
  return getFrames(catalog).find(function(o) {
    return o.dataset.id == id;
  }) || null;
}

export function getFrameByName(catalog, name) {
  return getFrames(catalog).find(function(o) {
    return o.layer.name == name;
  }) || null;
}

// The frame that a dataset belongs to: the frame it contains, if it is a frame
// dataset, or the frame named by its reference. Null for unframed datasets.
export function getFrameForDataset(catalog, dataset) {
  var lyr = dataset ? findFrameLayerInDataset(dataset) : null;
  if (lyr) return {layer: lyr, dataset: dataset};
  return getFrameById(catalog, getFrameRef(dataset));
}

// The content datasets that belong to a frame (not including the frame dataset)
export function getFrameMembers(catalog, frame) {
  var id = frame && frame.dataset.id;
  if (!id) return [];
  return catalog.getDatasets().filter(function(dataset) {
    return dataset != frame.dataset && getFrameRef(dataset) == id;
  });
}

// The frame's content layers, as [{layer, dataset}] in catalog order: the
// layers of its member datasets, and any content that shares the frame's own
// dataset (from before frames had members)
export function getFrameMemberLayers(catalog, frame) {
  var datasets = [frame.dataset].concat(getFrameMembers(catalog, frame));
  return catalog.getLayers().filter(function(o) {
    return datasets.includes(o.dataset) && !isFrameComponentLayer(o.layer, o.dataset);
  });
}

// The rule for datasets that commands create from other datasets: the output
// belongs to the frame of its sources if they all have the same one, and is
// unframed otherwise. A frame dataset's frame is the frame itself, so a grid
// made over a frame, for example, belongs to that frame. Datasets made from
// nothing (-i, -graticule, -shape) are unframed. -add-layer counts its target
// as the source, so a layer created beside a member joins the member's frame.
// @output a dataset that a command has just created (not yet in the catalog)
// @sources the datasets it was created from
export function inheritFrameRef(output, sources) {
  var refs = sources.map(getDerivedFrameRef);
  var ref = refs.length > 0 && refs.every(function(r) { return r == refs[0]; }) ?
    refs[0] : null;
  var info = output.info || (output.info = {});
  if (ref) {
    info.frame = ref;
  } else {
    delete info.frame;
  }
}

function getDerivedFrameRef(dataset) {
  return findFrameLayerInDataset(dataset) ? dataset.id || null : getFrameRef(dataset);
}

// The frame that a command operating on @dataset should use: the dataset's own
// frame, or else the default frame (the single-frame compatibility rule).
export function resolveFrameForDataset(catalog, dataset) {
  return getFrameForDataset(catalog, dataset) || getDefaultFrame(catalog);
}

// The frame that unframed layers are composed in: the session's frame, if it
// has exactly one. This keeps scripts and sessions made before frames had
// members working. With several frames, unframed layers belong to none.
export function getDefaultFrame(catalog) {
  var frames = getFrames(catalog);
  return frames.length == 1 ? frames[0] : null;
}

// The frame that the web UI shows a dataset's layers in: the dataset's own
// frame, or for an unframed dataset, the session's only frame if it has no
// content (a frame from before frames had members, which composes the
// unframed layers until layers are moved into it). Null if the dataset is
// shown in the unframed view.
export function getDisplayFrameForDataset(catalog, dataset) {
  var frame = getFrameForDataset(catalog, dataset);
  if (frame) return frame;
  frame = getDefaultFrame(catalog);
  return frame && getFrameMemberLayers(catalog, frame).length === 0 ? frame : null;
}

// Keeps frame references valid after a command: a reference to a frame that
// no longer exists is cleared, so deleting a frame leaves its members unframed
// in the same command, and a frame dataset belongs to no other frame. Also
// catches frame names made non-unique by commands that edit names in place.
export function repairFrameReferences(catalog) {
  var frames = getFrames(catalog);
  assertValidFrames(frames);
  catalog.getDatasets().forEach(function(dataset) {
    var ref = getFrameRef(dataset);
    if (!ref) return;
    if (findFrameLayerInDataset(dataset) || !frames.some(function(o) {
      return o.dataset.id == ref;
    })) {
      setFrameRef(dataset, null);
    }
  });
}
