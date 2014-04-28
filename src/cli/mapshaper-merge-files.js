/* @requires mapshaper-file-import, mapshaper-path-import, mapshaper-merging */

api.mergeFiles = function(files, opts) {
  // import datasets without topology
  var importOpts = Utils.extend({}, opts, {no_topology: true});
  var datasets = files.map(function(fname) {
    return MapShaper.importFromFile(fname, importOpts);
  });

  // merge datasets
  var merged = MapShaper.mergeDatasets(datasets);
  // kludge -- use info property of first dataset
  merged.info = datasets[0].info;

  if (!opts.no_topology) {
    MapShaper.buildTopology(merged);
  }
  return merged;
};

// @see mapshaper script
//
utils.getMergedFileBase = function(arr, suffix) {
  var basename = utils.getCommonFilePrefix(arr);
  basename = basename.replace(/[-_ ]+$/, '');
  if (suffix) {
    basename = basename ? basename + '-' + suffix : suffix;
  }
  return basename;
};

utils.getCommonFilePrefix = function(files) {
  return Utils.reduce(files, function(prefix, file) {
    var filebase = Node.getFileInfo(file).base;
    if (prefix !== null) {
      filebase = utils.findStringPrefix(prefix, filebase);
    }
    return filebase;
  }, null);
};

utils.findStringPrefix = function(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
};
