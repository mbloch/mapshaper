/* @requires mapshaper-common, mapshaper-file-types */


function validateHelpOpts(cmd) {
  var commands = validateCommaSepNames(cmd._[0]);
  if (commands) {
    cmd.options.commands = commands;
  }
}

function validateInputOpts(cmd) {
  var o = cmd.options,
      _ = cmd._;

  if (_[0] == '-' || _[0] == '/dev/stdin') {
    o.stdin = true;
  } else if (_.length > 0) {
    o.files = _;
  }

  if ("precision" in o && o.precision > 0 === false) {
    error("precision= option should be a positive number");
  }

  if (o.encoding) {
    o.encoding = MapShaper.validateEncoding(o.encoding);
  }
}

function validateSimplifyOpts(cmd) {
  var o = cmd.options,
      _ = cmd._;

  var pctStr = o.pct || "";
  if (_.length > 0) {
    if (/^[0-9.]+%?$/.test(_[0])) {
      pctStr = _.shift();
    }
    if (_.length > 0) {
      error("Unparsable option:", _.join(' '));
    }
  }

  if (pctStr) {
    var isPct = pctStr.indexOf('%') > 0;
    if (isPct) {
      o.pct = Number(pctStr.replace('%', '')) / 100;
    } else {
      o.pct = Number(pctStr);
    }
    if (!(o.pct >= 0 && o.pct <= 1)) {
      error(utils.format("Out-of-range pct value: %s", pctStr));
    }
  }

  var intervalStr = o.interval;
  if (intervalStr) {
    o.interval = Number(intervalStr);
    if (o.interval >= 0 === false) {
      error(utils.format("Out-of-range interval value: %s", intervalStr));
    }
  }

  if (isNaN(o.interval) && isNaN(o.pct) && !o.resolution) {
    error("Command requires an interval, pct or resolution parameter");
  }
}

function validateJoinOpts(cmd) {
  var o = cmd.options;
  o.source = o.source || cmd._[0];
  if (!o.source) {
    error("Command requires the name of a layer or file to join");
  }
}

function validateSplitOpts(cmd) {
  if (cmd._.length == 1) {
    cmd.options.field = cmd._[0];
  } else if (cmd._.length > 1) {
    error("Command takes a single field name");
  }
}

function validateClipOpts(cmd) {
  var opts = cmd.options;
  if (cmd._[0]) {
    opts.source = cmd._[0];
  }
  if (opts.bbox) {
    // assume comma-sep bbox has been parsed into array of strings
    opts.bbox = opts.bbox.map(parseFloat);
  }
  if (!opts.source && !opts.bbox) {
    error("Command requires a source file, layer id or bbox");
  }
  if (!opts.no_cleanup) {
    // Remove unused arcs after clipping/erasing by default.
    opts.cleanup = true;
  }
}

function validateDissolveOpts(cmd) {
  var _= cmd._,
      o = cmd.options;
  if (_.length == 1) {
    o.field = _[0];
  } else if (_.length > 1) {
    error("Command takes a single field name");
  }
}

function validateMergeLayersOpts(cmd) {
  if (cmd._.length > 0) error("Unexpected option:", cmd._);
}

function validateRenameLayersOpts(cmd) {
  cmd.options.names = validateCommaSepNames(cmd._[0]) || null;
}

function validateSplitOnGridOpts(cmd) {
  var o = cmd.options;
  if (cmd._.length == 1) {
    var tmp = cmd._[0].split(',');
    o.cols = parseInt(tmp[0], 10);
    o.rows = parseInt(tmp[1], 10) || o.cols;
  }

  if (o.rows > 0 === false || o.cols > 0 === false) {
    error("Command expects cols,rows");
  }
}

function validateLinesOpts(cmd) {
  try {
    var fields = validateCommaSepNames(cmd.options.fields || cmd._[0]);
    if (fields) cmd.options.fields = fields;
  } catch (e) {
    error("Command takes a comma-separated list of fields");
  }
}


function validateInnerLinesOpts(cmd) {
  if (cmd._.length > 0) {
    error("Command takes no arguments");
  }
}

function validateSubdivideOpts(cmd) {
  if (cmd._.length !== 1) {
    error("Command requires a JavaScript expression");
  }
  cmd.options.expression = cmd._[0];
}

function validateFilterFieldsOpts(cmd) {
  try {
    var fields = validateCommaSepNames(cmd._[0]);
    cmd.options.fields = fields || [];
  } catch(e) {
    error("Command requires a comma-sep. list of fields");
  }
}

function validateExpressionOpts(cmd) {
  if (cmd._.length == 1) {
    cmd.options.expression = cmd._[0];
  } else if (cmd._.length > 1) {
    error("Unparsable arguments:", cmd._);
  }
}

function validateOutputOpts(cmd) {
  var _ = cmd._,
      o = cmd.options,
      arg = _[0] || "",
      pathInfo = utils.parseLocalPath(arg);

  if (_.length > 1) {
    error("Command takes one file or directory argument");
  }

  if (arg == '-' || arg == '/dev/stdout') {
    o.stdout = true;
  } else if (arg && !pathInfo.extension) {
    if (!cli.isDirectory(arg)) {
      error("Unknown output option:", arg);
    }
    o.output_dir = arg;
  } else if (arg) {
    if (pathInfo.directory) {
      o.output_dir = pathInfo.directory;
      cli.validateOutputDir(o.output_dir);
    }
    o.output_file = pathInfo.filename;
    if (MapShaper.filenameIsUnsupportedOutputType(o.output_file)) {
      error("Output file looks like an unsupported file type:", o.output_file);
    }
  }

  if (o.format) {
    o.format = o.format.toLowerCase();
    if (o.format == 'csv') {
      o.format = 'dsv';
      o.delimiter = o.delimiter || ',';
    } else if (o.format == 'tsv') {
      o.format = 'dsv';
      o.delimiter = o.delimiter || '\t';
    }
    if (!MapShaper.isSupportedOutputFormat(o.format)) {
      error("Unsupported output format:", o.format);
    }
  }

  if (o.delimiter) {
    // convert "\t" '\t' \t to tab
    o.delimiter = o.delimiter.replace(/^["']?\\t["']?$/, '\t');
    if (!MapShaper.isSupportedDelimiter(o.delimiter)) {
      error("Unsupported delimiter:", o.delimiter);
    }
  }

  if (o.encoding) {
    o.encoding = MapShaper.validateEncoding(o.encoding);
  }

  // topojson-specific
  if ("quantization" in o && o.quantization > 0 === false) {
    error("quantization= option should be a nonnegative integer");
  }

  if ("topojson_precision" in o && o.topojson_precision > 0 === false) {
    error("topojson-precision= option should be a positive number");
  }

}

// Convert a comma-separated string into an array of trimmed strings
// Return null if list is empty
function validateCommaSepNames(str, min) {
  if (!min && !str) return null; // treat
  if (!utils.isString(str)) {
    error ("Expected a comma-separated list; found:", str);
  }
  var parts = str.split(',').map(utils.trim).filter(function(s) {return !!s;});
  if (min && min > parts.length < min) {
    error(utils.format("Expected a list of at least %d member%s; found: %s", min, utils.pluralSuffix(min), str));
  }
  return parts.length > 0 ? parts : null;
}
