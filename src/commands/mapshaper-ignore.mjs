import cmd from '../mapshaper-cmd';
import { layerIsEmpty } from '../dataset/mapshaper-layer-utils';
import { interrupt } from '../utils/mapshaper-logging';

cmd.ignore = function(targetLayer, dataset, opts) {
  if (opts.empty && layerIsEmpty(targetLayer)) {
    interrupt('Layer is empty, stopping processing');
  }
};