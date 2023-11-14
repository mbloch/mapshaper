import { getLayerInfo } from '../commands/mapshaper-info';

export function getTargetProxy(target) {
  var lyr = target.layers[0];
  var data = getLayerInfo(lyr, target.dataset);
  data.layer = lyr;
  data.dataset = target.dataset;
  return data;
}
