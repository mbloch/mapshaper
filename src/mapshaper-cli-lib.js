/* @requires
mapshaper-topology,
mapshaper-simplify,
mapshaper-shapes,
mapshaper-export,
mapshaper-import,
mapshaper-repair,
mapshaper-segments,
mapshaper-keep-shapes
*/

var cli = MapShaper.cli = {};

var usage = "" +
  "Usage: $ mapshaper [options] file\n\n" +
  "Example: Use Douglas-Peucker to remove all but 10% of points in a Shapefile.\n" +
  "$ mapshaper --dp -p 0.1 counties.shp\n\n" +
  "Example: Use Visvalingam to simplify a Shapefile to 1km resolution.\n" +
  "$ mapshaper --vis -i 1000 states.shp";

MapShaper.getOptionParser = function() {
  return require('optimist')
    .usage(usage)

    .options("o", {
      describe: "specify name of output file or directory",
    })

    .options("f", {
      alias: "format",
      describe: "output to a different format (shapefile|geojson|topojson)",
    })

    .options("p", {
      alias: "pct",
      describe: "proportion of points to retain (0-1)"
    })

    .options("i", {
      alias: "interval",
      describe: "amount of simplification in meters (or other projected units)"
    })

    .options("dp", {
      alias: "rdp",
      describe: "use Douglas-Peucker, a.k.a. Ramer–Douglas–Peucker",
      'boolean': true
    })

    .options("visvalingam", {
      alias: "vis",
      describe: "use Visvalingam's method for simplification",
      'boolean': true
    })

    .options("modified", {
      describe: "use a version of Visvalingam modified for smoothing (default)",
      'boolean': true
    })

    .options("modified-v1", {
      describe: "use the original modified Visvalingam method (deprecated)",
      'boolean': true
    })

    .options("keep-shapes", {
      describe: "prevent small shapes from disappearing",
      'boolean': true
    })

    .options("repair", {
      describe: "remove intersections introduced by simplification",
      'boolean': true
    })

    .options("precision", {
      describe: "increment for rounding coordinates, in source units"
    })

    .options("quantization", {
      describe: "override topojson resolution calculated by mapshaper"
    })

    .options("no-quantization", {
      describe: "export topojson without quantization",
      'boolean': true
    })

    .options("verbose", {
      describe: "print verbose processing messages",
      'boolean': true
    })

    .options("v", {
      alias: "version",
      describe: "print mapshaper version",
      'boolean': true
    })

    .options("h", {
      alias: "help",
      describe: "print this help message",
      'boolean': true
    });
  /*
    // TODO
    // prevent points along straight lines from being stripped away, to allow reprojection
    .options("min-segment", {
      describe: "min segment length (no. of segments in largest dimension)",
      default: 0
    })

    .options("remove-null", {
      describe: "remove null shapes",
      default: false
    })
    */
};

// Parse command line and return options object for bin/mapshaper
//
MapShaper.getOpts = function() {
  var optimist = MapShaper.getOptionParser(),
      opts, argv;

  argv = optimist.check(function(argv) {
    if (argv.h) {
      optimist.showHelp();
      process.exit(0);
    }
    if (argv.v) {
      console.log(getVersion());
      process.exit(0);
    }
    opts = MapShaper.validateArgs(argv, getSupportedArgs(optimist));
  }).argv;

  return opts;
};

// Test option parsing -- throws an error if a problem is found.
// @argv array of command line tokens
//
MapShaper.checkArgs = function(argv) {
  var optimist = MapShaper.getOptionParser();
  return MapShaper.validateArgs(optimist.parse(argv), getSupportedArgs(optimist));
};

// Return an array of all recognized cli arguments: ["f", "format", ...]
//
function getSupportedArgs(optimist) {
  return optimist.help().match(/-([a-z][0-9a-z-]*)/g).map(function(arg) {
    return arg.replace(/^-/, '');
  });
}

function getVersion() {
  var v;
  try {
    var packagePath = Node.resolvePathFromScript("../package.json"),
        obj = JSON.parse(Node.readFile(packagePath, 'utf-8'));
    v = obj.version;
  } catch(e) {}
  return v || "";
}

// Throw an error if @argv array contains an unsupported option
// @flags array of supported options
//
MapShaper.checkArgSupport = function(argv, flags) {
  var supportedOpts = flags.reduce(function(acc, opt) {
      acc[opt] = true;
      return acc;
    }, {'_': true, '$0': true});

  Utils.forEach(argv, function(val, arg) {
    if (arg in supportedOpts === false) {
      throw "Unsupported option: " + arg;
    }
  });
};

//
//
MapShaper.validateArgs = function(argv, supported) {
  MapShaper.checkArgSupport(argv, supported);

  // If an option is given multiple times, throw an error
  Utils.forEach(argv, function(val, arg) {
    if (Utils.isArray(val) && arg != '_') {
      throw new Error((arg.length == 1 ? '-' : '--') + arg + " option is repeated");
    }
  });

  var opts = cli.validateInputOpts(argv);
  Utils.extend(opts, cli.validateOutputOpts(argv, opts));
  Utils.extend(opts, cli.validateSimplifyOpts(argv));
  Utils.extend(opts, cli.validateTopologyOpts(argv));
  opts.verbose = !!argv.verbose;
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
    obj.extension = obj.extension || extension || "x"; // TODO: validate ext
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
  var type = MapShaper.guessFileType(path),
      valid = type == 'shp' || type == 'json';
  return valid;
};

cli.replaceFileExtension = function(path, ext) {
  var info = Node.parseFilename(path);
  return Node.path.join(info.relative_dir, info.base + "." + ext);
};

cli.validateInputOpts = function(argv) {
  var ifile = argv._[0],
      opts = {};

  if (!ifile) {
    error("Missing an input file");
  }
  if (!Node.fileExists(ifile)) {
    error("File not found (" + ifile + ")");
  }
  if (!cli.validateFileExtension(ifile)) {
     error("File has an unsupported extension:", ifile);
  }
  opts.input_file = ifile;
  return opts;
};

cli.validateOutputOpts = function(argv, inputOpts) {
  var supportedTypes = ["geojson", "topojson", "shapefile"],
      odir = ".",
      ifileInfo = Node.getFileInfo(inputOpts.input_file),
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
        if (!cli.validateFileExtension(ofileInfo.file)) {
          error("Output file looks like an unsupported file type:", ofileInfo.file);
        }
        // use -o extension, if present
        // allows .topojson or .geojson instead of .json
        // override extension inferred from --format option
        oext = ofileInfo.ext;

        // Infer output format from -o option extension when appropriate
        if (!ofmt &&
          MapShaper.guessFileFormat(oext) != MapShaper.guessFileFormat(ifileInfo.ext)) {
          ofmt =  MapShaper.guessFileFormat(oext);
        }
      }
      obase = ofileInfo.base;
      odir = ofileInfo.relative_dir || '.';
    }
  }

  return {
    output_extension: oext,
    output_directory: odir,
    output_file_base: obase,
    output_format: ofmt || null // inferred later if not found above
  };
};

cli.validateTopologyOpts = function(argv) {
  var opts = {};
  if (argv.precision) {
    if (!Utils.isNumber(argv.precision) || argv.precision <= 0) {
      error("--precision option should be a positive number");
    }
    opts.precision = argv.precision;
  }
  opts.repair = !!argv.repair;
  return opts;
};

cli.validateSimplifyOpts = function(argv) {
  var opts = {};
  if (argv.i) {
    if (!Utils.isNumber(argv.i) || argv.i < 0) error("-i (--interval) option should be a non-negative number");
    opts.simplify_interval = argv.i;
  }
  else if (argv.p) {
    if (!Utils.isNumber(argv.p) || argv.p <= 0 || argv.p >= 1)
      error("-p (--pct) option should be in the range (0,1)");
    opts.simplify_pct = argv.p;
  }

  if (argv.quantization) {
    if (!Utils.isInteger(argv.quantization) || argv.quantization < 0) {
      error("--quantization option should be a nonnegative integer");
    }
    opts.topojson_resolution = argv.quantization;
  } else if (argv.quantization === false || argv.quantization === 0) {
    opts.topojson_resolution = 0; // handle --no-quantization
  }

  opts.use_simplification = !!(opts.simplify_pct || opts.simplify_interval);

  if (opts.use_simplification) {
    opts.keep_shapes = !!argv['keep-shapes'];
    if (argv.dp)
      opts.simplify_method = "dp";
    else if (argv.visvalingam)
      opts.simplify_method = "vis";
    else if (argv['modified-v1'])
      opts.simplify_method = "mod1";
    else
      opts.simplify_method = "mod2";
  }
  return opts;
};

MapShaper.gc = function() {
  T.start();
  Node.gc();
  T.stop("gc()");
};

MapShaper.importFromFile = function(fname, opts) {
  var fileType = MapShaper.guessFileType(fname),
      content;
  if (fileType == 'shp') {
    content = Node.readFile(fname);
  } else if (fileType == 'json') {
    content = Node.readFile(fname, 'utf-8');
  } else {
    error("Unexpected input file:", fname);
  }
  return MapShaper.importContent(content, fileType, opts);
};

var api = Utils.extend(MapShaper, {
  Node: Node,
  Utils: Utils,
  Opts: Opts,
  trace: trace,
  error: error,
  C: C,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  Dbf: Dbf,
  Bounds: Bounds
});

module.exports = api;
C.VERBOSE = false;
