/* @requires mapshaper-file-import, mapshaper-path-import, mapshaper-merging */

api.mergeFiles = function(files, opts) {
  var datasets = files.map(function(fname) {
    var importOpts = Utils.extend({}, opts,
      {no_topology: true, files: [fname]});  // import without topology
    return api.importFile(fname, importOpts);
  });

  var merged = MapShaper.mergeDatasets(datasets);
  // kludge -- use info property of first dataset
  merged.info = datasets[0].info;
  merged.info.input_files = files;

  if (!opts.no_topology) {
    api.buildTopology(merged);
  }

  if (opts.merge_files) api.mergeLayers(merged.layers);
  return merged;
};
