
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { copyLayerShapes } from '../dataset/mapshaper-layer-utils';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import utils from '../utils/mapshaper-utils';
import { ArcCollection } from '../paths/mapshaper-arcs';

// Create a merged dataset by appending the overlay layer to the target dataset
// so it is last in the layers array.
// DOES NOT insert clipping points
export function mergeLayersForOverlay(targetLayers, targetDataset, clipSrc, opts) {
  var usingPathClip = utils.some(targetLayers, layerHasPaths);
  var bbox = opts.bbox || opts.bbox2;
  var mergedDataset, clipDataset, clipLyr;
  if (clipSrc && clipSrc.geometry_type) {
    // TODO: update tests to remove this case (clipSrc is a layer)
    clipSrc = {dataset: targetDataset, layer: clipSrc, disposable: true};
  }
  if (bbox) {
    clipDataset = convertClipBounds(bbox);
    clipLyr = clipDataset.layers[0];
  } else if (!clipSrc) {
    stop("Command requires a source file, layer id or bbox");
  } else if (clipSrc.layer && clipSrc.dataset) {
    clipLyr = clipSrc.layer;
    clipDataset = utils.defaults({layers: [clipLyr]}, clipSrc.dataset);
  } else if (clipSrc.layers && clipSrc.layers.length == 1) {
    clipLyr = clipSrc.layers[0];
    clipDataset = clipSrc;
  }
  if (targetDataset.arcs != clipDataset.arcs) {
    // using external dataset -- need to merge arcs
    if (clipSrc && !clipSrc.disposable) {
      // copy overlay layer shapes because arc ids will be reindexed during merging
      clipDataset.layers[0] = copyLayerShapes(clipDataset.layers[0]);
    }
    // merge external dataset with target dataset,
    // so arcs are shared between target layers and clipping lyr
    // Assumes that layers in clipDataset can be modified (if necessary, a copy should be passed in)
    mergedDataset = mergeDatasets([targetDataset, clipDataset]);
    buildTopology(mergedDataset); // identify any shared arcs between clipping layer and target dataset
  } else {
    // overlay layer belongs to the same dataset as target layers... move it to the end
    mergedDataset = utils.extend({}, targetDataset);
    mergedDataset.layers = targetDataset.layers.filter(function(lyr) {return lyr != clipLyr;});
    mergedDataset.layers.push(clipLyr);
  }
  return mergedDataset;
}

function convertClipBounds(bb) {
  var x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3],
      arc = [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];

  if (!(y1 > y0 && x1 > x0)) {
    stop("Invalid bbox (should be [xmin, ymin, xmax, ymax]):", bb);
  }
  return {
    arcs: new ArcCollection([arc]),
    layers: [{
      shapes: [[[0]]],
      geometry_type: 'polygon'
    }]
  };
}