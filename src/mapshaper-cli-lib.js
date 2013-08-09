/* @requires
mapshaper-topology,
mapshaper-simplify,
mapshaper-shapes,
mapshaper-export,
mapshaper-import
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

MapShaper.getOutputPaths = function(files, dir, extension) {
  if (!files || !files.length) {
    console.log("No files to save");
    return;
  }
  // assign filenames
  Utils.forEach(files, function(obj) {
    obj.pathbase = Node.path.join(dir, obj.filebase);
    obj.extension = obj.extension || extension || "o"; // TODO: validate ext
  });

  // avoid naming conflicts
  var i = 0, suffix = "";
  while (cli.testFileCollision(files, suffix)) {
    i++;
    suffix = "-ms";
    if (i > 1) suffix += String(i);
  }

  // compose paths
  return Utils.map(files, function(obj) {
    return obj.pathbase + suffix + '.' + obj.extension;
  });
};


cli.testFileCollision = function(files, suff) {
  return Utils.some(files, function(obj) {
    var path = obj.pathbase + suff + '.' + obj.extension;
    return Node.fileExists(path);
  });
};

cli.validateFileExtension = function(path) {
  var type = MapShaper.guessFileType(path);
  return !!type;
};


cli.validateInputOpts = function(opts, argv) {
  var ifile = argv._[0];
  if (!ifile) error("Missing an input file");

  if (!Node.fileExists(ifile)) error("File not found (" + ifile + ")");
  var ftype = MapShaper.guessFileType(ifile);
  if (!ftype) {
     error("File has an unsupported extension:", ifile);
  }
  opts.input_file = ifile;
  return opts;
};

cli.validateOutputOpts = function(opts, argv) {
  var supportedTypes = ["geojson", "topojson", "shapefile"],
      odir = ".",
      ifileInfo = Node.getFileInfo(opts.input_file),
      obase = ifileInfo.base, // default to input file name
      oext = ifileInfo.ext,   // default to input file extension
      ofmt;

  // process --format option
  if (argv.f) {
    ofmt = argv.f.toLowerCase();
    // use default extension for output format
    oext = MapShaper.getDefaultFileExtension(ofmt);
    if (!Utils.contains(supportedTypes, ofmt)) {
      error("Unsupported output format:", argv.f);
    }
  }

  // process -o option
  if (argv.o) {
    if (!Utils.isString(argv.o)) {
      error("-o option needs a file name");
    }
    var ofileInfo = Node.getFileInfo(argv.o);
    if (ofileInfo.is_directory) {
      odir = argv.o;
    } else if (ofileInfo.relative_dir && !Node.dirExists(ofileInfo.relative_dir)) {
      error("Output directory not found:", ofileInfo.relative_dir);
    } else if (!ofileInfo.base) {
      error('Invalid output file:', argv.o);
    } else {
      if (ofileInfo.ext) {
        if (!cli.validateFileExtension(ofileInfo.ext)) {
          error("Output file looks like an unsupported file type:", ofileInfo.file);
        }
        // use -o extension, if present
        // allows .topojson or .geojson instead of .json
        // override extension inferred from --format option
        oext = ofileInfo.ext;
      }
      obase = ofileInfo.base;
      odir = ofileInfo.relative_dir || '.';
    }
  }

  opts.output_extension = oext;
  if (ofmt) opts.output_format = ofmt; // inferred later if not found above
  opts.output_directory = odir;
  opts.output_file_base = obase;
  return opts;
};

cli.validateSimplifyOpts = function(opts, argv) {
  if (argv.i) {
    if (!Utils.isNumber(argv.i) || argv.i < 0) error("-i (--interval) option should be a non-negative number");
    opts.simplify_interval = argv.i;
  }
  else if (argv.p) {
    if (!Utils.isNumber(argv.p) || argv.p <= 0 || argv.p >= 1)
      error("-p (--pct) option should be in the range (0,1)");
    opts.simplify_pct = argv.p;
  }

  if (argv.q) {
    if (!Utils.isInteger(argv.q) || argv.q <= 0) {
      error("-q (--quantize) option should be a nonnegative integer");
    }
    opts.topojson_resolution = argv.q;
  }

  opts.use_simplification = !!(opts.simplify_pct || opts.simplify_interval);

  if (opts.use_simplification) {
    opts.keep_shapes = !!argv.k;
    if (argv.dp)
      opts.simplify_method = "dp";
    else if (argv.vis)
      opts.simplify_method = "vis";
    else
      opts.simplify_method = "mod";
  }

  return opts;
};


MapShaper.gc = function() {
  T.start();
  Node.gc();
  T.stop("gc()");
};


MapShaper.importFromFile = function(fname) {
  var fileType = MapShaper.guessFileType(fname),
      content;
  if (fileType == 'shp') {
    content = Node.readFile(fname);
  } else if (fileType == 'json') {
    content = Node.readFile(fname, 'utf-8');
  } else {
    error("Unexpected input file:", fname);
  }
  return MapShaper.importContent(content, fileType);
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
