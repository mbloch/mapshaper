/* @requires
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
mapshaper-arc-dissolve,
mapshaper-split,
mapshaper-split-on-grid,
mapshaper-recombine,
mapshaper-field-calculator
mapshaper-subdivide
mapshaper-filter
*/
//mapshaper-explode,

var cli = MapShaper.cli = {};

var usage =
  "Usage: mapshaper [options] file\n\n" +

  "Example: fix minor topology errors, simplify to 10%, convert to geojson\n" +
  "$ mapshaper -p 0.1 --auto-snap --format geojson states.shp\n\n" +

  "Example: aggregate census tracts to counties\n" +
  "$ mapshaper -e 'CTY_FIPS=FIPS.substr(0, 5)' --dissolve CTY_FIPS tracts.shp";

MapShaper.getOptionParser = function() {
  var basic = MapShaper.getBasicOptionParser(),
      more = MapShaper.getExtraOptionParser(basic),
      all = MapShaper.getHiddenOptionParser(more);
  return all;
};

MapShaper.getBasicOptionParser = function() {
  return getOptimist()
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
      describe: "proportion of removable points to retain (0-1)"
    })

    .options("i", {
      alias: "interval",
      describe: "simplification resolution in linear units"
    })

    .options("cartesian", {
      describe: "simplify decimal degree coords in 2D space (default is 3D)"
    })

    .options("dp", {
      alias: "rdp",
      describe: "use Douglas-Peucker simplification",
      'boolean': true
    })

    .options("visvalingam", {
      // alias: "vis", // makes help message too wide
      describe: "use Visvalingam simplification",
      'boolean': true
    })

    .options("modified", {
      describe: "use a version of Visvalingam designed for mapping (default)",
      'boolean': true
    })

    .options("keep-shapes", {
      describe: "prevent small shapes from disappearing",
      'boolean': true
    })

    .options("auto-snap", {
      describe: "snap nearly identical points to fix minor topology errors",
      'boolean': true
    })

    .options("precision", {
      describe: "coordinate precision in source units (applied on import)"
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
    })

    .options("more", {
      describe: "print more options"
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

MapShaper.getHiddenOptionParser = function(optimist) {
  return (optimist || getOptimist())
    // These option definitions don't get printed by --help and --more
    // Validate them in validateExtraOpts()
  .options("modified-v1", {
    describe: "use the original modified Visvalingam method (deprecated)",
    'boolean': true
  });
};

MapShaper.getExtraOptionParser = function(optimist) {
  return (optimist || getOptimist())

  .options('filter ', {
    describe: "filter shapes with a boolean JavaScript expression"
  })

  .options("expression", {
    alias: "e",
    describe: "create/update/delete data fields with a JS expression"
  })

  /*
  // TODO: enable this when holes are handled correctly
  .options("explode", {
    describe: "divide each multi-part shape into several single-part shapes"
  })
  */

  .options("split", {
    describe: "split shapes on a data field"
  })

  .options("subdivide", {
    describe: "Recursively divide a layer with a boolean JS expression"
  })

  .options("dissolve", {
    describe: "dissolve polygons; takes optional comma-sep. list of fields"
  })

  .options("sum-fields", {
    describe: "fields to sum when dissolving  (comma-sep. list)"
  })

  .options("copy-fields", {
    describe: "fields to copy when dissolving (comma-sep. list)"
  })

  .options("recombine", {
    describe: "merge split-apart layers back into a single layer",
    'boolean': true
  })

  .options("split-on-grid", {
    describe: "split layer into cols,rows  e.g. --split-on-grid 12,10"
  })

  .options("snap-interval", {
    describe: "specify snapping distance in source units"
  })

  .options("quantization", {
    describe: "specify TopoJSON quantization (auto-set by default)"
  })

  .options("no-quantization", {
    describe: "export TopoJSON without quantization",
    'boolean': true
  })

  .options("no-repair", {
    describe: "don't remove intersections introduced by simplification",
    'boolean': true
  })
  ;
};

// Parse command line and return options object for bin/mapshaper
//
MapShaper.getOpts = function() {
  var optimist = MapShaper.getOptionParser(),
      argv = optimist.argv,
      opts;

  if (argv.help) {
    MapShaper.getBasicOptionParser().showHelp();
    process.exit(0);
  }
  if (argv.more) {
    console.log( "More " + MapShaper.getExtraOptionParser().help());
    process.exit(0);
  }
  if (argv.version) {
    console.log(getVersion());
    process.exit(0);
  }

  // validate args against basic option parser so standard help message is shown
  var dummy = MapShaper.getBasicOptionParser().check(function() {
    opts = MapShaper.validateArgs(argv, getSupportedArgs());
  }).argv;

  C.VERBOSE = argv.verbose;
  return opts;
};

// Test option parsing -- throws an error if a problem is found.
// @argv array of command line tokens
//
MapShaper.checkArgs = function(argv) {
  var optimist = MapShaper.getOptionParser();
  return MapShaper.validateArgs(optimist.parse(argv), getSupportedArgs());
};

function getOptimist() {
  delete require.cache[require.resolve('optimist')];
  return require('optimist');
}

// Return an array of all recognized cli arguments: ["f", "format", ...]
//
function getSupportedArgs() {
  var optimist = MapShaper.getOptionParser(),
      args = optimist.help().match(/-([a-z][0-9a-z-]*)/g).map(function(arg) {
        return arg.replace(/^-/, '');
      });
  return args;
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
    // If --no-somearg is defined, also accept --somearg (optimist workaround)
    if (arg in supportedOpts === false && ("no-" + arg in supportedOpts) === false) {
      throw "Unsupported option: " + arg;
    }
  });
};

// Return an array of options objects, one for each input file
//
MapShaper.validateArgs = function(argv, supported) {
  MapShaper.checkArgSupport(argv, supported);

  // If an option is given multiple times, throw an error
  Utils.forEach(argv, function(val, arg) {
    if (Utils.isArray(val) && arg != '_') {
      throw new Error((arg.length == 1 ? '-' : '--') + arg + " option is repeated");
    }
  });

  var opts = {};
  Utils.extend(opts, cli.validateSimplifyOpts(argv));
  Utils.extend(opts, cli.validateTopologyOpts(argv));
  Utils.extend(opts, cli.validateExtraOpts(argv));

  var optsArr = Utils.map(argv._, function(ifile) {
    var fileOpts = {};
    Utils.extend(fileOpts, cli.validateInputOpts(ifile, argv));
    Utils.extend(fileOpts, cli.validateOutputOpts(argv, fileOpts));
    return Utils.extend(fileOpts, opts);
  });

  if (optsArr.length === 0) {
    error("Missing an input file");
  }
  return optsArr;
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

cli.validateInputOpts = function(ifile, argv) {
  var opts = {};
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

cli.validateCommaSepNames = function(str) {
  if (!Utils.isString(str)) {
    error ("Expected comma-separated list; found:", str);
  }
  var parts = Utils.map(str.split(','), Utils.trim);
  return parts;
};

cli.validateExtraOpts = function(argv) {
  var opts = {},
      tmp;

  if ('split-on-grid' in argv) {
    var rows = 4, cols = 4;
    tmp = argv['split-on-grid'];
    if (Utils.isString(tmp)) {
      tmp = tmp.split(',');
      cols = parseInt(tmp[0], 10);
      rows = parseInt(tmp[1], 10);
      if (rows <= 0 || cols <= 0) {
        error ("--split-on-grid expects columns,rows");
      }
    } else if (Utils.isInteger(tmp) && tmp > 0) {
      cols = tmp;
      rows = tmp;
    }
    opts.split_rows = rows;
    opts.split_cols = cols;
  }

  if (Utils.isString(argv.dissolve) || argv.dissolve === true) {
    opts.dissolve = argv.dissolve || true; // empty string -> true
  }

  if ('snap-interval' in argv) {
    opts.snap_interval = argv['snap-interval'];
    if (opts.snap_interval > 0) {
      opts.snapping = true;
    }
  }

  if (argv['sum-fields']) {
    opts.sum_fields = cli.validateCommaSepNames(argv['sum-fields']);
  }

  if (argv['copy-fields']) {
    opts.copy_fields = cli.validateCommaSepNames(argv['copy-fields']);
  }

  if (argv.split) {
    if (!Utils.isString(argv.split)) {
      error("--split option requires the name of a field to split on");
    }
    opts.split = argv.split;
  }

  if (argv.recombine) {
    opts.recombine = argv.recombine;
  }

  if (argv.expression) {
    opts.expression = argv.expression;
  }

  if (argv.subdivide) {
    if (!Utils.isString(argv.subdivide)) {
      error("--subdivide option requires a JavaScript expression");
    }
    opts.subdivide = argv.subdivide;
  }

  if (argv.filter) {
    if (!Utils.isString(argv.filter)) {
      error("--filter option requires a JavaScript expression");
    }
    opts.filter = argv.filter;
  }

  return opts;
};

cli.validateTopologyOpts = function(argv) {
  var opts = {};
  if (argv.precision) {
    if (!Utils.isNumber(argv.precision) || argv.precision <= 0) {
      error("--precision option should be a positive number");
    }
    opts.precision = argv.precision;
  }
  opts.repair = argv.repair !== false;
  opts.snapping = !!argv['auto-snap'];
  return opts;
};

cli.validateSimplifyOpts = function(argv) {
  var opts = {};
  if (argv.i) {
    if (!Utils.isNumber(argv.i) || argv.i < 0) error("-i (--interval) option should be a non-negative number");
    opts.simplify_interval = argv.i;
  }
  else if ('p' in argv) {
    if (!Utils.isNumber(argv.p) || argv.p < 0 || argv.p > 1)
      error("-p (--pct) expects a number in the range 0-1");
    if (argv.p < 1) {
      opts.simplify_pct = argv.p;
    }
  }

  if (argv.cartesian) {
    opts.force2D = true;
  }

  if (argv.quantization) {
    if (!Utils.isInteger(argv.quantization) || argv.quantization < 0) {
      error("--quantization option should be a nonnegative integer");
    }
    opts.topojson_resolution = argv.quantization;
  } else if (argv.quantization === false || argv.quantization === 0) {
    opts.topojson_resolution = 0; // handle --no-quantization
  }

  opts.use_simplification = Utils.isNumber(opts.simplify_pct) || Utils.isNumber(opts.simplify_interval);

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

cli.printRepairMessage = function(info, opts) {
  if (info.pre > 0 || opts.verbose) {
    console.log(Utils.format(
        "Repaired %'i intersection%s; unable to repair %'i intersection%s.",
        info.repaired, "s?", info.post, "s?"));
    if (info.post > 10) {
      if (!opts.snapping) {
        console.log("Tip: use --auto-snap to fix minor topology errors.");
      }
    }
  }
};

// Force v8 to perform a complete gc cycle.
// To enable, run node with --expose_gc
// Timing gc() gives a crude indication of number of objects in memory.
//
MapShaper.gc = function() {
  if (global.gc) {
    T.start();
    global.gc();
    T.stop("gc()");
  }
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
  Dbf: Dbf,
  C: C,
  Bounds: Bounds
});

module.exports = api;
C.VERBOSE = false;
