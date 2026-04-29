
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { copyLayerShapes } from '../dataset/mapshaper-layer-utils';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { stop, error } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import utils from '../utils/mapshaper-utils';
import { ArcCollection } from '../paths/mapshaper-arcs';

// Convert a source parameter (which can take several forms) into
// a dataset with a single layer.
export function normalizeOverlaySource(clipSrc, targetDataset, optsArg) {
  var opts = optsArg || {};
  var bbox = opts.bbox || opts.bbox2;
  var clipDataset;
  if (bbox) {
    clipDataset = convertClipBounds(bbox);
  } else if (!clipSrc) {
    stop('Command requires a source file, layer id or bbox');
  } else if (clipSrc.geometry_type) {
    // clipSrc is a layer (assumed in targetDataset)
    // TODO: update tests to remove this case (only used in tests)
    // error('Unsupported source format');
    clipDataset = utils.defaults({layers: [clipSrc], disposable: true}, targetDataset);
  } else if (clipSrc.layer && clipSrc.dataset) {
    clipDataset = utils.defaults({layers: [clipSrc.layer]}, clipSrc.dataset);
  } else if (clipSrc.layers?.length == 1) {
    clipDataset = clipSrc;
  } else {
    error('Invalid source format');
  }
  if (clipSrc?.disposable) {
    clipDataset.disposable = true;
  }
  return clipDataset;
}

// Create a merged dataset by appending the overlay layer to the target dataset
// so it is last in the layers array.
// DOES NOT insert clipping points
export function mergeLayersForOverlay(targetLayers, targetDataset, clipSrc, opts) {
  var clipDataset = normalizeOverlaySource(clipSrc, targetDataset, opts);
  return mergeLayersForOverlay2(targetLayers, targetDataset, clipDataset);
}

export function mergeLayersForOverlay2(targetLayers, targetDataset, clipDataset) {
  var mergedDataset;
  var clipLyr = clipDataset.layers[0];
  if (targetDataset.arcs != clipDataset.arcs) {
    // using external dataset -- need to merge arcs
    if (!clipDataset.disposable) {
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
      name: 'bbox',
      shapes: [[[0]]],
      geometry_type: 'polygon'
    }]
  };
}