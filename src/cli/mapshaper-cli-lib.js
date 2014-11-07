/* @requires
mapshaper-cli-utils
mapshaper-commands
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
cli.writeFile = Node.writeFile;

cli.validateFileExtension = function(path) {
  var type = MapShaper.guessFileType(path),
      valid = type == 'shp' || type == 'json';
  return valid;
};

cli.replaceFileExtension = function(path, ext) {
  var info = utils.parseLocalPath(path);
  return info.pathbase + '.' + ext;
};

cli.validateInputFile = function(ifile) {
  var opts = {};
  cli.checkFileExists(ifile);
  if (!cli.validateFileExtension(ifile)) {
     error("File has an unsupported extension:", ifile);
  }
  return ifile;
};

cli.checkFileExists = function(path) {
  var stat = Node.statSync(path);
  if (!stat || stat.isDirectory()) {
    stop("File not found (" + path + ")");
  }
};

cli.printRepairMessage = function(info) {
  if (info.intersections_initial > 0) {
    message(Utils.format(
        "Repaired %'i intersection%s; unable to repair %'i intersection%s.",
        info.intersections_repaired, "s?", info.intersections_remaining, "s?"));
    /*
    if (info.intersections_remaining > 10) {
      if (!opts.snapping) {
        message("Tip: use --auto-snap to fix minor topology errors.");
      }
    }*/
  }
};

cli.validateEncoding = function(raw) {
  var enc = raw.replace(/-/, '').toLowerCase();
  if (!Utils.contains(MapShaper.getEncodings(), enc)) {
    console.error("[Unsupported encoding:", raw + "]");
    MapShaper.printEncodings();
    process.exit(0);
  }
  return enc;
};

// Expose internal objects for testing
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

if (typeof define === "function" && define.amd) {
  define("mapshaper", api);
} else if (typeof module === "object" && module.exports) {
  module.exports = api;
}
this.mapshaper = api;
