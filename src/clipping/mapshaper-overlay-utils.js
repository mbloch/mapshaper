
// Combine target layer(s) and overlay layer into a single dataset, with overlay
// last in the layers array
// DOES NOT insert clipping points
internal.mergeLayersForOverlay = function(targetLayers, clipSrc, targetDataset, opts) {
  var usingPathClip = utils.some(targetLayers, internal.layerHasPaths);
  var mergedDataset, clipDataset, clipLyr;
  if (clipSrc && clipSrc.geometry_type) {
    // TODO: update tests to remove this case (clipSrc is a layer)
    clipSrc = {dataset: targetDataset, layer: clipSrc, disposable: true};
  }
  if (opts.bbox) {
    clipDataset = internal.convertClipBounds(opts.bbox);
    clipLyr = clipDataset.layers[0];
  } else if (clipSrc) {
    clipLyr = clipSrc.layer;
    clipDataset = utils.defaults({layers: [clipLyr]}, clipSrc.dataset);
  } else {
    stop("Command requires a source file, layer id or bbox");
  }
  if (targetDataset.arcs != clipDataset.arcs) {
    // using external dataset -- need to merge arcs
    if (clipSrc && !clipSrc.disposable) {
      // copy overlay layer shapes because arc ids will be reindexed during merging
      clipDataset.layers[0] = internal.copyLayerShapes(clipDataset.layers[0]);
    }
    // merge external dataset with target dataset,
    // so arcs are shared between target layers and clipping lyr
    // Assumes that layers in clipDataset can be modified (if necessary, a copy should be passed in)
    mergedDataset = internal.mergeDatasets([targetDataset, clipDataset]);
    api.buildTopology(mergedDataset); // identify any shared arcs between clipping layer and target dataset
  } else {
    mergedDataset = utils.extend({}, targetDataset);
    mergedDataset.layers = targetLayers.concat(clipLyr);
  }
  return mergedDataset;
};
