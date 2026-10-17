import { getFrameForDataset } from '../furniture/mapshaper-frame-resolver';
import { getFrameFurnitureLayers } from '../furniture/mapshaper-frame-utils';
import { getFrameStack } from '../furniture/mapshaper-frame-members';
import { expandCommandTargets, groupLayersByDataset } from '../dataset/mapshaper-target-utils';
import { layerNameIsUnsafeFilename } from '../utils/mapshaper-filename-utils';
import { message, stop, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// What a map export (SVG, HTML, PNG, JPG) draws, by frame
//
// A frame in the targets stands for the whole map: the frame, its furniture
// and its members that are not hidden, in stacking order. A member layer is
// drawn on its frame's page. Layers in no frame are drawn in the frame if just
// one frame is involved (as before frames had members); with several frames,
// they are left out.
//
// Returns null if no frame is involved, so that the export works as it did
// before frames had members. Otherwise returns one group per frame:
// [{frame, datasets}], where the datasets hold shallow copies of the layers,
// numbered in drawing order (target_id, which sorts layers for CLI export).
// Explicitly targeted layers keep the order of the target list.
export function getMapExportGroups(catalog, targets) {
  var items = expandCommandTargets(targets).map(function(o, i) {
    return {layer: o.layer, dataset: o.dataset, frame: getFrameForDataset(catalog, o.dataset), i: i};
  }).sort(function(a, b) {
    return getTargetOrder(a) - getTargetOrder(b) || a.i - b.i;
  });
  var frames = items.reduce(function(memo, o) {
    if (o.frame && !memo.some(function(f) { return f.dataset == o.frame.dataset; })) {
      memo.push(o.frame);
    }
    return memo;
  }, []);
  var unframed = items.filter(function(o) { return !o.frame; });
  if (frames.length === 0) return null;
  if (unframed.length > 0 && frames.length > 1) {
    warn('Left out layers that are in no frame:', formatNames(unframed));
  } else if (unframed.length > 0) {
    message('Drawing layers that are in no frame in frame', frames[0].layer.name + ':',
      formatNames(unframed));
  }
  return frames.map(function(frame) {
    return {
      frame: frame,
      datasets: getFrameExportDatasets(catalog, frame, items.filter(function(o) {
        return o.frame ? o.frame.dataset == frame.dataset : frames.length == 1;
      }))
    };
  });
}

// The file name of a frame's map, when an export writes one map per frame:
// the frame's name, after any name given to -o (map.svg -> map-frame1.svg)
export function getFrameExportFilename(frame, file, ext) {
  var name = frame.layer.name || 'frame';
  if (layerNameIsUnsafeFilename(name)) {
    stop('Frame name cannot be used as an output filename:', name);
  }
  return file ? file.replace(/(\.[^.]*)?$/, '-' + name + '$1') : name + '.' + ext;
}

function getFrameExportDatasets(catalog, frame, items) {
  var explicit = utils.pluck(items, 'layer');
  var ordered = [];
  var stack = getFrameStack(catalog, frame).filter(function(o) {
    return !o.layer.frame_hidden && !explicit.includes(o.layer);
  });
  var add = function(o) {
    if (!ordered.some(function(o2) { return o2.layer == o.layer; })) {
      ordered.push({layer: o.layer, dataset: o.dataset});
    }
  };
  if (!explicit.includes(frame.layer)) {
    add(frame);
  }
  items.forEach(function(o) {
    add(o);
    if (o.layer == frame.layer) {
      stack.forEach(add);
    }
  });
  getFrameFurnitureLayers(frame.dataset).forEach(function(lyr) {
    add({layer: lyr, dataset: frame.dataset});
  });
  return groupLayersByDataset(ordered.map(function(o, i) {
    return {layer: utils.defaults({target_id: i}, o.layer), dataset: o.dataset};
  })).map(function(target) {
    return utils.defaults({layers: target.layers}, target.dataset);
  });
}

function getTargetOrder(o) {
  return o.layer.target_id >= 0 ? o.layer.target_id : Infinity;
}

function formatNames(items) {
  return items.map(function(o) { return o.layer.name || '[unnamed layer]'; }).join(', ');
}
