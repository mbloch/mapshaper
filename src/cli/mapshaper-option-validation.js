/* @requires mapshaper-common */

//
//
MapShaper.validateCommands = function(commands) {
  commands.forEach(function(cmd) {
    var validator = MapShaper.commandValidators[cmd.name];
    if (validator) {
      validator(cmd.options, cmd._);
    }
  });
};


function validateInputOpts(o, _) {
  o.files = cli.validateInputFiles(_);

  if ("precision" in o && o.precision > 0 === false) {
    error("precision option should be a positive number");
  }

  if (o.encoding) {
    o.encoding = cli.validateEncoding(o.encoding);
  }
}

function validateSimplifyOpts(o, _) {
  var methods = ["visvalingam", "dp"];
  if (o.method) {
    if (!Utils.contains(methods, o.method)) {
      error(o.method, "is not a recognized simplification method; choos from:", methods);
    }
  }

  var pctStr = Utils.find(_, function(str) {
    return (/^[0-9.]+%$/.test(str));
  });
  if (pctStr) o.pct = parseFloat(pctStr) / 100;

  // if (o.cartesian) o.force2D = true; // TODO: just use cartesian

  if ("pct" in o && !(o.pct >= 0 && o.pct <= 1)) {
    error("-simplify pct expects a number in the range 0-1");
  }

  if ("interval" in o && o.interval >= 0 === false) {
    error("-simplify interval should be a non-negative number");
  }

  if (!("interval" in o || "pct" in o)) {
    error("-simplify requires an interval or pct");
  }

}

function validateJoinOpts(o, _) {
  if (_.length !== 1) {
    error("-join requires the name of a file to join");
  }
  o.file = _[0];

  if (Utils.some("shp,xls,xlsx".split(','), function(suff) {
    return Utils.endsWith(o.file, suff);
  })) {
    error("-join currently only supports dbf and csv files");
  }

  if (!o.keys) error("-join missing required keys option");
  o.keys = validateCommaSep(o.keys, 2);
  if (!o.keys) error("-join keys takes two comma-separated names, e.g.: FIELD1,FIELD2");

  if (o.fields) {
    o.fields =  validateCommaSep(fields);
    if (!o.fields) error("-join fields is a comma-sep. list of fields to join");
  }
}

function validateSplitOpts(o, _) {

}

function validateSplitOnGridOpts(o, _) {
  if (_.length == 1) {
    var tmp = _[0].split(',');
    o.cols = parseInt(tmp[0], 10);
    o.rows = parseInt(tmp[1], 10) || o.cols;
  }

  if (o.rows > 0 === false || o.cols > 0 === false) {
    error("-split-on-grids expects cols,rows");
  }
}

function validateLinesOpts(o, _) {
  if (_.length > 0) {
    error("-lines takes a comma-separated list of fields");
  } else if (_.length == 1) {
    o.fields = cli.validateCommaSepNames(_[0]);
  }
}

function validateInnerLines(o, _) {
  if (_.length > 0) {
    error("-innerlines takes no arguments");
  }
}

function validateSubdivideOpts(o, _) {
  if (_.length !== 1) {
    error("--subdivide option requires a JavaScript expression");
  }
  o.expression = _[0];
}

function validateFilterOpts(o, _) {  if (_.length !== 1) {
    error("--filter option requires a JavaScript expression");
  }
  o.expression = _[0];
}

function validateOutputOpts(o, _) {
  var odir, obase, oext, ofmt;
  if (_.length > 1) {
    error("-o takes one file or directory argument, received:", _);
  } else if (_.length == 1) {
    var ofileInfo = Node.getFileInfo(_[0]);
    if (ofileInfo.is_directory) {
      // odir = argv.o;
      o.output_dir = _[0];
    } else if (ofileInfo.relative_dir && !Node.dirExists(ofileInfo.relative_dir)) {
      error("Output directory not found:", ofileInfo.relative_dir);
    } else if (!ofileInfo.base) {
      error('Invalid output file:', _[0]);
    } else {
      if (ofileInfo.ext) {
        if (!cli.validateFileExtension(ofileInfo.file)) {
          error("Output file looks like an unsupported file type:", ofileInfo.file);
        }
        // use -o extension, if present
        // allows .topojson or .geojson instead of .json
        // override extension inferred from --format option
        // oext = ofileInfo.ext;
      }
      o.output_file = _[0];
      //obase = ofileInfo.base;
      //odir = ofileInfo.relative_dir || '.';
    }
  }
  /*
  if (odir) o.output_directory = odir;
  if (oext) o.output_extension = oext;
  if (obase) o.output_file_base = obase;
  */

  var supportedTypes = ["geojson", "topojson", "shapefile"];
  if (o.format) {
    o.format = o.format.toLowerCase();
    if (!Utils.contains(supportedTypes, o.format)) {
      error("Unsupported output format:", o.format);
    }
  }

  // topojson-specific
  if ("quantization" in o && o.quantization > 0 === false) {
    error("quantization option should be a nonnegative integer");
  }

  if ("topojson_resolution" in o && o.topojson_resolution > 0 === false) {
    error("topojson_resolution should be a nonnegative integet");
  }

}


MapShaper.commandValidators = {
  i: validateInputOpts,
  o: validateOutputOpts,
  simplify: validateSimplifyOpts,
  join: validateJoinOpts,
  "split-on-grid": validateSplitOnGridOpts,
  split: validateSplitOpts,
  subdivide: validateSubdivideOpts
};