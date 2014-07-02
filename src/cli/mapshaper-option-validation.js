/* @requires mapshaper-common */


function trapOldOpt(cmd) {
  error(Utils.format('The [%s] option was removed in v0.2.0.', cmd.name));
}

function validateInputOpts(cmd) {
  var o = cmd.options;
  o.files = cli.validateInputFiles(cmd._);

  if ("precision" in o && o.precision > 0 === false) {
    error("precision option should be a positive number");
  }

  if (o.encoding) {
    o.encoding = cli.validateEncoding(o.encoding);
  }
}

function validateSimplifyOpts(cmd) {
  var o = cmd.options;
  var methods = ["visvalingam", "dp"];
  if (o.method) {
    if (!Utils.contains(methods, o.method)) {
      error(o.method, "is not a recognized simplification method; choos from:", methods);
    }
  }

  var pctStr = Utils.find(cmd._, function(str) {
    return (/^[0-9.]+%$/.test(str));
  });
  if (pctStr) o.pct = parseFloat(pctStr) / 100;

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

function validateJoinOpts(cmd) {
  var o = cmd.options;
  o.source = o.source || cmd._[0];

  if (!o.source) {
    error("-join requires the name of a file to join");
  }

  if (Utils.some("shp,xls,xlsx".split(','), function(suff) {
    return Utils.endsWith(o.source, suff);
  })) {
    error("-join currently only supports dbf and csv files");
  }

  if (!cli.isFile(o.source)) {
    error("-join missing source file:", o.source);
  }

  if (!o.keys) error("-join missing required keys option");
  if (!isCommaSep(o.keys)) error("-join keys takes two comma-separated names, e.g.: FIELD1,FIELD2");

  if (o.fields && !isCommaSep(o.fields)) {
    error("-join fields is a comma-sep. list of fields to join");
  }
}

function isCommaSep(arr, count) {
  var ok = arr && Utils.isArray(arr);
  if (count) ok = ok && arr.length === count;
  return ok;
}

function validateSplitOpts(cmd) {
  if (cmd._.length == 1) {
    cmd.options.field = cmd._[0];
  } else if (cmd._.length > 1) {
    error("-split takes a single field name");
  }
}

function validateClip(cmd) {
  var src = cmd.options.source || cmd._[0];
  if (src) {
    cmd.options.source = src;
  } else {
    error("-" + cmd.name + " requires a source argument");
  }
}

function validateDissolveOpts(cmd) {
  var _= cmd._,
      o = cmd.options;
  if (_.length == 1) {
    o.field = _[0];
  } else if (_.length > 1) {
    error("-dissolve takes a single field name");
  }

  if (o.sum_fields && !isCommaSep(o.sum_fields)) error("-dissolve sum-fields takes a comma-sep. list");
  if (o.copy_fields && !isCommaSep(o.copy_fields)) error("-dissolve copy-fields takes a comma-sep. list");
}

function validateMergeLayersOpts(cmd) {
  if (cmd._.length > 0) error("-merge-layers unexpected option:", cmd._);
}

function validateSplitOnGridOpts(cmd) {
  var o = cmd.options;
  if (cmd._.length == 1) {
    var tmp = cmd._[0].split(',');
    o.cols = parseInt(tmp[0], 10);
    o.rows = parseInt(tmp[1], 10) || o.cols;
  }

  if (o.rows > 0 === false || o.cols > 0 === false) {
    error("-split-on-grids expects cols,rows");
  }
}

function validateLinesOpts(cmd) {
  try {
    var fields = validateCommaSepNames(cmd.options.fields || cmd._[0]);
    if (fields) cmd.options.fields = fields;
  } catch (e) {
    error("-lines takes a comma-separated list of fields");
  }
}

function validateInnerLinesOpts(cmd) {
  if (cmd._.length > 0) {
    error("-innerlines takes no arguments");
  }
}

function validateSubdivideOpts(cmd) {
  if (cmd._.length !== 1) {
    error("-subdivide option requires a JavaScript expression");
  }
  cmd.options.expression = cmd._[0];
}

function validateFilterFieldsOpts(cmd) {
  try {
    var fields = validateCommaSepNames(cmd._[0]);
    cmd.options.fields = fields || [];
  } catch(e) {
    error("-filter-fields option requires a comma-sep. list of fields");
  }
}


function validateLayersOpts(cmd) {
  try {
    cmd.options.layers = validateCommaSepNames(cmd._[0], 1);
  } catch (e) {
    error("-layers option requires a comma-sep. list of layer names");
  }
}

function validateFilterOpts(cmd) {
  if (cmd._.length !== 1) {
    error("-filter option requires a JavaScript expression");
  }
  cmd.options.expression = cmd._[0];
}

function validateOutputOpts(cmd) {
  var _ = cmd._,
      o = cmd.options,
      path = _[0] || "",
      pathInfo = utils.parseLocalPath(path),
      supportedTypes = ["geojson", "topojson", "shapefile"];

  if (_.length > 1) {
    error("-o takes one file or directory argument");
  }

  if (!path) {
    // no output file or dir
  } else if (!pathInfo.extension) {
    o.output_dir = path;
  } else {
    if (pathInfo.directory) o.output_dir = pathInfo.directory;
    o.output_file = pathInfo.filename;
  }

  if (o.output_file && !cli.validateFileExtension(o.output_file)) {
    error("Output file looks like an unsupported file type:", o.output_file);
  }

  if (o.output_dir && !cli.isDirectory(o.output_dir)) {
    if (!cli.isDirectory(o.output_dir)) {
      error("Output directory not found:", o.output_dir);
    }
  }

  /*
  if (Utils.contains(supportedTypes, o.output_file.toLowerCase())) {
    error("Use format=" + o.output_file + " to set output format");
  }
  */

  if (o.format) {
    o.format = o.format.toLowerCase();
    if (!Utils.contains(supportedTypes, o.format)) {
      error("Unsupported output format:", o.format);
    }
  }

  if (o.encoding) {
    o.encoding = cli.validateEncoding(o.encoding);
  }

  // topojson-specific
  if ("quantization" in o && o.quantization > 0 === false) {
    error("quantization option should be a nonnegative integer");
  }

  if ("topojson_precision" in o && o.topojson_precision > 0 === false) {
    error("topojson-precision should be a positive number");
  }

}

// Convert a comma-separated string into an array of trimmed strings
// Return null if list is empty
function validateCommaSepNames(str, min) {
  if (!min && !str) return null; // treat
  if (!Utils.isString(str)) {
    error ("Expected comma-separated list; found:", str);
  }
  var parts = str.split(',').map(Utils.trim).filter(function(s) {return !!s;});
  if (min && min > parts.length < min) {
    error(Utils.format("Expected a list of at least %d member%s; found: %s", min, 's?', str));
  }
  return parts.length > 0 ? parts : null;
}
