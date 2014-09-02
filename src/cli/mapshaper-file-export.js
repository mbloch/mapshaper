/* @require mapshaper-common */

MapShaper.getOutputPaths = function(files, opts) {
  var paths =  files.map(function(file) {
    return Node.path.join(opts.output_dir || '', file);
  });
  if (!opts.force) {
    paths = resolveFileCollisions(paths);
  }
  return paths;
};

// Avoid naming conflicts with existing files
// by adding file suffixes to output filenames: -ms, -ms2, -ms3 etc.
function resolveFileCollisions(candidates) {
  var i = 0,
      suffix = "",
      paths = candidates.concat();

  while (testFileCollision(paths)) {
    i++;
    suffix = "-ms";
    if (i > 1) suffix += String(i);
    paths = addFileSuffix(candidates, suffix);
  }
  return paths;
}

function addFileSuffix(paths, suff) {
  return paths.map(function(path) {
     return utils.getPathBase(path) + suff + '.' + utils.getFileExtension(path);
  });
}

function testFileCollision(paths, suff) {
  return utils.some(paths, function(path) {
    return cli.isFile(path) || cli.isDirectory(path);
  });
}
