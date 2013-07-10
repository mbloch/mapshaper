/* @requires mapshaper-common, mapshaper-shapefile, mapshaper-geojson, nodejs */

var cli = MapShaper.cli = {};

MapShaper.validateArgv = function(argv) {
  var opts = {};
  cli.validateInputOpts(opts, argv);
  cli.validateOutputOpts(opts, argv);
  cli.validateSimplifyOpts(opts, argv);

  if (!opts.use_simplification) error("Missing simplification parameters")

  opts.timing = !!argv.t;
  return opts;
};

cli.validateInputOpts = function(opts, argv) {
  var ifile = argv._[0];
  if (!ifile) error("Missing an input file");

  var ifileInfo = Node.getFileInfo(ifile);
  if (!ifileInfo.exists) error("File not found (" + ifile + ")");
  if (ifileInfo.ext != 'shp') error("Input filename must match *.shp");

  opts.input_file = ifile;
  opts.input_format = "shapefile";
  opts.input_file_base = ifileInfo.base;
  opts.input_directory = ifileInfo.relative_dir;
  opts.input_path_base = Node.path.join(opts.input_directory, opts.input_file_base);
  return opts;
};

cli.validateOutputOpts = function(opts, argv) {
  // output format -- only shapefile for now
  if (argv.f && argv.f != "shapefile") error("Unsupported output format:", argv.f);
  opts.output_format = "shapefile";

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


MapShaper.importFromFile = function(fname) {
  var info = Node.getFileInfo(fname);
  if (!info.exists) error("File not found.");
  if (info.ext != 'shp') error("Expected *.shp file; found:", fname);

  // TODO: json importing
  // data = MapShaper.importJSON(JSON.parse(Node.readFile(fname, 'utf8')));
  return MapShaper.importShp(fname);
};

/*
MapShaper.importFromStream = function(sname) {
  assert("/dev/stdin", "[importFromStream()] requires /dev/stdin; received:", sname);
  var buf = Node.readFile(sname);
  if (buf.readUInt32BE(0) == 9994) {
    return MapShaper.importShpFromBuffer(buf);
  }
  var obj = JSON.parse(buf.toString());
  return MapShaper.importJSON(obj);
};
*/
