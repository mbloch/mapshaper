import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { makePolygonBuffer } from '../buffer/mapshaper-polygon-buffer';
import { makePolylineBuffer } from '../buffer/mapshaper-polyline-buffer';
import { makePointBuffer } from '../buffer/mapshaper-point-buffer';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';

// TODO: consider if layers should be buffered together
// cmd.buffer = function(layers, dataset, opts) {
//   return makeBufferLayer(layers[0], dataset, opts);
// };

cmd.buffer = makeBufferLayer;

function makeBufferLayer(lyr, dataset, opts) {
  var dataset2, lyr2;
  if (lyr.geometry_type == 'point') {
    dataset2 = makePointBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polyline') {
    dataset2 = makePolylineBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polygon') {
    dataset2 = makePolygonBuffer(lyr, dataset, opts);
  } else {
    stop("Unsupported geometry type");
  }
  var outputLayers = mergeDatasetsIntoDataset(dataset, [dataset2]);
  lyr2 = outputLayers[0];
  setOutputLayerName(lyr2, lyr, null, opts);
  if (lyr.data && !lyr2.data) {
    lyr2.data = opts.no_replace ? lyr.data.clone() : lyr.data;
  }
  return outputLayers;
}

