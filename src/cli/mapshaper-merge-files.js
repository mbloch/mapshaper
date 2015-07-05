/* @requires mapshaper-file-import, mapshaper-path-import, mapshaper-merging */

api.mergeFiles = function(files, opts) {
  var datasets = files.map(function(fname) {
    // import without topology or snapping
    var importOpts = utils.defaults({no_topology: true, auto_snap: false, snap_interval: null, files: [fname]}, opts);
    return api.importFile(fname, importOpts);
  });

  // Don't allow multiple input formats
  var formats = datasets.map(function(d) {
    return d.info.input_format;
  });
  if (utils.uniq(formats).length != 1) {
    stop("Importing files with different formats is not supported");
  }

  var merged = MapShaper.mergeDatasets(datasets);
  // kludge -- using info property of first dataset
  merged.info = datasets[0].info;
  merged.info.input_files = files;

  // Don't try to re-build topology of TopoJSON files
  // TODO: consider updating topology of TopoJSON files instead of concatenating arcs
  // (but problem of mismatched coordinates due to quantization in input files.)
  if (!opts.no_topology && merged.info.input_format != 'topojson') {
    // TODO: remove duplication with mapshaper-path-import.js; consider applying
    //   snapping option inside buildTopology()
    if (opts.auto_snap || opts.snap_interval) {
      T.start();
      MapShaper.snapCoords(merged.arcs, opts.snap_interval);
      T.stop("Snapping points");
    }

    api.buildTopology(merged);
  }

  if (opts.merge_files) {
    merged.layers = api.mergeLayers(merged.layers);
  }
  return merged;
};
