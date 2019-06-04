

api.overlay = function(targetLyr, src, targetDataset, opts) {
  var sourceLyr, sourceDataset, mergedDataset;
  if (!src || !src.layer || !src.dataset) {
    error("Unexpected source layer argument");
  }
  sourceLyr = src.layer;
  sourceDataset = src.dataset;
  if (targetDataset.arcs != sourceDataset.arcs) {
    // see mapshaper-clip-erase.js
    mergedDataset = internal.mergeDatasets([targetDataset, clipDataset]);
    api.buildTopology(mergedDataset);
  } else {
    mergedDataset = targetDataset;
  }

  internal.overlayLayer(targetLyr, sourceLyr, mergedDataset, opts);
};


internal.overlayLayer = function(targetLyr, sourceLyr, dataset, opts) {
  // TODO: don't build nodes twice (consider adding filter option to addIntersectionCuts())
  internal.addIntersectionCuts(dataset, opts); // returns a NodeCollection
  // build nodes from arcs in both layers
  var arcFilter = internal.getArcPresenceTest(targetLyr.shapes.concat(sourceLyr.shapes), dataset.arcs);
  var nodes = new NodeCollection(dataset.arcs, arcFilter);
  var mosaicIndex = new MosaicIndex(targetLyr, nodes); // TODO: add flat opt
  var dissolve = internal.getRingIntersector(mosaicIndex.nodes, 'dissolve');

  mosaicIndex.removeGaps(internal.getGapFillTest(dataset, opts));


};
