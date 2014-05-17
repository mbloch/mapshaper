/* @requires
mapshaper-options,
mapshaper-commands,
mapshaper-topology,
mapshaper-simplify,
mapshaper-shapes,
mapshaper-export,
mapshaper-repair,
mapshaper-segments,
mapshaper-snapping,
mapshaper-keep-shapes,
mapshaper-file-import,
mapshaper-dissolve,
mapshaper-split,
mapshaper-split-on-grid,
mapshaper-field-calculator
mapshaper-subdivide
mapshaper-filter-fields
mapshaper-filter
mapshaper-merge-files
mapshaper-join
mapshaper-innerlines
mapshaper-encodings
mapshaper-info
*/

var cli = api.cli = {};

function getVersion() {
  var v;
  try {
    var packagePath = Node.resolvePathFromScript("../package.json"),
        obj = JSON.parse(Node.readFile(packagePath, 'utf-8'));
    v = obj.version;
  } catch(e) {}
  return v || "";
}

cli.getOutputPaths = function(files, dir) {
  if (!files || !files.length) {
    message("No files to save");
    return;
  }

  var paths = files.map(function(file) {
    return Node.path.join(dir || '.', file);
  });

  // avoid naming conflicts
  var i = 0,
      suffix = "",
      candidates = paths.concat();

  while (cli.testFileCollision(candidates)) {
    i++;
    suffix = "-ms";
    if (i > 1) suffix += String(i);
    candidates = cli.addFileSuffix(paths, suffix);
  }
  return candidates;
};

cli.addFileSuffix = function(paths, suff) {
  return paths.map(function(path) {
     return utils.getPathBase(path) + suff + '.' + utils.getFileExtension(path);
  });
};

cli.testFileCollision = function(paths, suff) {
  return Utils.some(paths, function(path) {
    return Node.fileExists(path);
  });
};

cli.validateFileExtension = function(path) {
  var type = MapShaper.guessFileType(path),
      valid = type == 'shp' || type == 'json';
  return valid;
};

cli.replaceFileExtension = function(path, ext) {
  var info = Node.parseFilename(path);
  return Node.path.join(info.relative_dir, info.base + "." + ext);
};

cli.validateInputFiles = function(arr) {
  var files = Utils.map(arr, cli.validateInputFile);
  if (files.length === 0) error("Missing an input file");
  return files;
};

cli.validateInputFile = function(ifile) {
  var opts = {};
  if (!Node.fileExists(ifile)) {
    error("File not found (" + ifile + ")");
  }
  if (!cli.validateFileExtension(ifile)) {
     error("File has an unsupported extension:", ifile);
  }
  return ifile;
};

cli.validateCommaSepNames = function(str) {
  if (!Utils.isString(str)) {
    error ("Expected comma-separated list; found:", str);
  }
  var parts = Utils.map(str.split(','), Utils.trim);
  return parts;
};

cli.printRepairMessage = function(info) {
  if (info.intersections_initial > 0) {
    console.log(Utils.format(
        "Repaired %'i intersection%s; unable to repair %'i intersection%s.",
        info.intersections_repaired, "s?", info.intersections_remaining, "s?"));
    /*
    if (info.intersections_remaining > 10) {
      if (!opts.snapping) {
        console.log("Tip: use --auto-snap to fix minor topology errors.");
      }
    }*/
  }
};

cli.validateEncoding = function(raw) {
  var enc = raw.replace(/-/, '').toLowerCase();
  if (!Utils.contains(MapShaper.getEncodings(), enc)) {
    console.log("[Unsupported encoding:", raw + "]");
    MapShaper.printEncodings();
    process.exit(0);
  }
  return enc;
};

function validateCommaSep(str, count) {
  var parts = Utils.mapFilter(str.split(','), function(part) {
    var str = Utils.trim(part);
    return str === '' ? void 0 : str;
  });
  if (parts.length === 0 || count && parts.length !== count) {
    return null;
  }
  return parts;
}

// Force v8 to perform a complete gc cycle.
// To enable, run node with --expose_gc
// Timing gc() gives a crude indication of number of objects in memory.
/*
MapShaper.gc = function() {
  if (global.gc) {
    T.start();
    global.gc();
    T.stop("gc()");
  }
};
*/

Utils.extend(api.internal, {
  Node: Node,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  C: C,
  Bounds: Bounds
});

cli.readFile = Node.readFile;
cli.writeFile = Node.writeFile;
cli.fileExists = Node.fileExists;
api.T = T;

module.exports = api;
C.VERBOSE = false;
