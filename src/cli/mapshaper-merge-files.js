/* @requires mapshaper-file-import, mapshaper-path-import, mapshaper-merging */

// Import multiple files to a single dataset
internal.importFiles = function(files, opts) {
  var unbuiltTopology = false;
  var datasets = files.map(function(fname) {
    // import without topology or snapping
    var importOpts = utils.defaults({no_topology: true, auto_snap: false, snap_interval: null, files: [fname]}, opts);
    var dataset = api.importFile(fname, importOpts);
    // check if dataset contains non-topological paths
    // TODO: may also need to rebuild topology if multiple topojson files are merged
    if (dataset.arcs && dataset.arcs.size() > 0 && dataset.info.input_formats[0] != 'topojson') {
      unbuiltTopology = true;
    }
    return dataset;
  });
  var combined = internal.mergeDatasets(datasets);

  // Build topology, if needed
  // TODO: consider updating topology of TopoJSON files instead of concatenating arcs
  // (but problem of mismatched coordinates due to quantization in input files.)
  if (unbuiltTopology && !opts.no_topology) {
    // TODO: remove duplication with mapshaper-path-import.js; consider applying
    //   snapping option inside buildTopology()
    if (opts.auto_snap || opts.snap_interval) {
      internal.snapCoords(combined.arcs, opts.snap_interval);
    }
    api.buildTopology(combined);
  }
  return combined;
};
