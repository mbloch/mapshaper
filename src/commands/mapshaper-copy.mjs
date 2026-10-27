import cmd from '../mapshaper-cmd';
import { copyLayer } from '../dataset/mapshaper-layer-utils';
import { isFrameLayer } from '../furniture/mapshaper-frame-utils';
import { copyFrameAndMembers } from './mapshaper-frame';
import { stop } from '../utils/mapshaper-logging';

// Copies of the target layers, of any type, for adding to their dataset.
// A frame target is copied with its member layers instead (see copyFrame()).
cmd.copyLayers = function(layers) {
  return layers.map(copyLayer);
};

// Returns true if the target is a frame, which has been copied
cmd.copyFrame = function(catalog, targetLayers, targetDataset, opts) {
  var frames = targetLayers.filter(function(lyr) {
    return isFrameLayer(lyr, targetDataset.arcs);
  });
  if (frames.length === 0) return false;
  if (targetLayers.length > 1) {
    stop('-copy copies one frame at a time, without other layers');
  }
  copyFrameAndMembers(catalog, {layer: frames[0], dataset: targetDataset}, opts.name);
  return true;
};
