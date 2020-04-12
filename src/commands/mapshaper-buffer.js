import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { makePolygonBuffer } from '../buffer/mapshaper-polygon-buffer';
import { makePolylineBuffer } from '../buffer/mapshaper-polyline-buffer';
import { makePointBuffer } from '../buffer/mapshaper-point-buffer';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';

// returns a dataset
cmd.buffer = function(layers, dataset, opts) {
  return makeBufferLayer(layers[0], dataset, opts);
};

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
  lyr2.name = lyr.name;
  if (lyr.data && !lyr2.data) {
    lyr2.data = opts.no_replace ? lyr.data.clone() : lyr.data;
  }
  return outputLayers;
}

