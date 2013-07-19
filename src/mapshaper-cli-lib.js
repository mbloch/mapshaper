/* @requires
mapshaper-topology,
mapshaper-simplify,
mapshaper-shapefile,
mapshaper-visvalingam,
mapshaper-dp,
mapshaper-shapes,
mapshaper-export
*/

var cli = MapShaper.cli = {};

MapShaper.validateArgv = function(argv) {
  var opts = {};
  cli.validateInputOpts(opts, argv);
  cli.validateOutputOpts(opts, argv);
  cli.validateSimplifyOpts(opts, argv);

  opts.timing = !!argv.t;
  return opts;
};

cli.validateInputOpts = function(opts, argv) {
  var ifile = argv._[0];
  if (!ifile) error("Missing an input file");

  var ifileInfo = Node.getFileInfo(ifile);
  if (!ifileInfo.exists) error("File not found (" + ifile + ")");
  if (ifileInfo.ext == 'shp') {
    opts.input_format = 'shapefile';
  } else if (/json$/.test(ifileInfo.ext)) {
    opts.input_format = 'geojson';
  } else {
     error("File has an unknown extension:", ifileInfo.ext);
  }

  opts.input_file = ifile;
  opts.input_file_base = ifileInfo.base;
  opts.input_directory = ifileInfo.relative_dir;
  opts.input_path_base = Node.path.join(opts.input_directory, opts.input_file_base);
  return opts;
};

cli.validateOutputOpts = function(opts, argv) {
  var supportedTypes = ["geojson", "topojson", "shapefile"],
      fmt = argv.f && argv.f.toLowerCase() || null;
  if (fmt && Utils.contains(supportedTypes, fmt) == false) error("Unsupported output format:", argv.f);
  opts.output_format = fmt || opts.input_format;

  var obase = opts.input_file_base + "-mshp"; // default
  if (argv.o) {
    if (!Utils.isString(argv.o)) {
      error("-o option needs a file name");
    }
    var ofileInfo = Node.getFileInfo(argv.o);
    if (ofileInfo.is_directory) {
      error("-o should be a file, not a directory");
    }
    if (ofileInfo.ext && ofileInfo.ext != "shp") {
      error("Output option looks like an unsupported file type:", ofileInfo.file);
    }
    if (!Node.dirExists(ofileInfo.relative_dir)) {
      error("Output directory not found");
    }
    obase = Node.path.join(ofileInfo.relative_dir, ofileInfo.base);

    if (opts.input_format == opts.output_format && obase == Node.path.join(opts.input_directory, opts.input_file_base)) {
      // TODO: overwriting is possible users types absolute path for input or output path...
      error("Output file shouldn't overwrite source file");
    }
  }

  opts.output_path_base = obase;
  return opts;
};

cli.validateSimplifyOpts = function(opts, argv) {
  if (argv.i != null) {
    if (!Utils.isNumber(argv.i) || argv.i < 0) error("-i (--interval) option should be a non-negative number");
    opts.simplify_interval = argv.i;
  }
  else if (argv.p != null) {
    if (!Utils.isNumber(argv.p) || argv.p <= 0 || argv.p >= 1) error("-p (--pct) option should be in the range (0,1)");
    opts.simplify_pct = argv.p;
  }

  opts.use_simplification = !!(opts.simplify_pct || opts.simplify_interval);
  opts.keep_shapes = !!argv.k;

  if (argv.dp)
    opts.simplify_method = "dp";
  else if (argv.vis)
    opts.simplify_method = "vis";
  else
    opts.simplify_method = "mod";

  return opts;
};


MapShaper.gc = function() {
  T.start();
  Node.gc();
  T.stop("gc()");
};


MapShaper.importFromFile = function(fname, format) {
  var info = Node.getFileInfo(fname),
      data, content;
  if (!info.exists) error("File not found.");
  if (format == 'shapefile') {
    content = Node.readFile(fname);
    data = MapShaper.importShp(content);
  } else if (/json$/.test(format)) {
    content = Node.readFile(fname, 'utf-8');
    data = MapShaper.importJSON(content);
  } else {
    error("Unexpected input file:", fname);
  }
  return data;
};

var api = Utils.extend(MapShaper, {
  Node: Node,
  Utils: Utils,
  Opts: Opts,
  trace: trace,
  error: error,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  DbfReader: DbfReader,
  Bounds: Bounds
});

module.exports = api;

T.verbose = false; // timing messages off by default (e.g. for testing)
