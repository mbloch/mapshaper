/* @requires
mapshaper-options
mapshaper-commands
mapshaper-topology
mapshaper-simplify
mapshaper-shapes
mapshaper-export
mapshaper-repair
mapshaper-segments
mapshaper-snapping
mapshaper-keep-shapes
mapshaper-file-import
mapshaper-dissolve
mapshaper-split
mapshaper-split-on-grid
mapshaper-field-calculator
mapshaper-subdivide
mapshaper-filter-fields
mapshaper-filter
mapshaper-merge-files
mapshaper-join
mapshaper-innerlines
mapshaper-encodings
mapshaper-info
mapshaper-dissolve2
mapshaper-flatten
mapshaper-clip-erase
mapshaper-divide
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

cli.isFile = Node.fileExists;
cli.isDirectory = Node.dirExists;
cli.readFile = Node.readFile;
cli.writeFlie = Node.writeFile;

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
    return cli.isFile(path) || cli.isDirectory(path);
  });
};

cli.validateFileExtension = function(path) {
  var type = MapShaper.guessFileType(path),
      valid = type == 'shp' || type == 'json';
  return valid;
};

cli.replaceFileExtension = function(path, ext) {
  var info = utils.parseLocalPath(path);
  return info.pathbase + '.' + ext;
};

cli.validateInputFiles = function(arr) {
  var files = Utils.map(arr, cli.validateInputFile);
  if (files.length === 0) error("Missing an input file");
  return files;
};

cli.validateInputFile = function(ifile) {
  var opts = {};
  if (!cli.isFile(ifile)) {
    error("File not found (" + ifile + ")");
  }
  if (!cli.validateFileExtension(ifile)) {
     error("File has an unsupported extension:", ifile);
  }
  return ifile;
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


Utils.extend(api.internal, {
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  ShpType: ShpType,
  Bounds: Bounds
});

api.T = T;
C.VERBOSE = false;

module.exports = api;
