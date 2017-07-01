/* @requires mapshaper-common, mapshaper-file-types, mapshaper-option-parser */


function validateInputOpts(cmd) {
  var o = cmd.options,
      _ = cmd._;

  if (_[0] == '-' || _[0] == '/dev/stdin') {
    o.stdin = true;
  } else if (_.length > 0) {
    o.files = cli.expandInputFiles(_);
  }

  if ("precision" in o && o.precision > 0 === false) {
    error("precision= option should be a positive number");
  }

  if (o.encoding) {
    o.encoding = internal.validateEncoding(o.encoding);
  }
}

function validateSimplifyOpts(cmd) {
  var o = cmd.options,
      arg = cmd._[0];

  if (arg) {
    if (/^[0-9.]+%?$/.test(arg)) {
      o.percentage = utils.parsePercent(arg);
    } else {
      error("Unparsable option:", arg);
    }
  }

  var intervalStr = o.interval;
  if (intervalStr) {
    o.interval = Number(intervalStr);
    if (o.interval >= 0 === false) {
      error(utils.format("Out-of-range interval value: %s", intervalStr));
    }
  }

  if (isNaN(o.interval) && !utils.isNumber(o.percentage) && !o.resolution) {
    error("Command requires an interval, percentage or resolution parameter");
  }
}

function validateProjOpts(cmd) {
  var _ = cmd._,
      proj4 = [];

  // separate proj4 options
  _ = _.filter(function(arg) {
    if (/^\+[a-z]/i.test(arg)) {
      proj4.push(arg);
      return false;
    }
    return true;
  });

  if (proj4.length > 0) {
    cmd.options.projection = proj4.join(' ');
  } else if (_.length > 0) {
    cmd.options.projection = _.shift();
  }

  if (_.length > 0) {
    error("Received one or more unexpected parameters: " + _.join(', '));
  }

  if (!(cmd.options.projection  || cmd.options.match || cmd.options.from)) {
    stop("Missing projection data");
  }
}


function validateClipOpts(cmd) {
  var opts = cmd.options;
  // rename old option
  if (opts.cleanup) {
    delete opts.cleanup;
    opts.remove_slivers = true;
  }
  if (!opts.source && !opts.bbox) {
    error("Command requires a source file, layer id or bbox");
  }
}

function validateGridOpts(cmd) {
  var o = cmd.options;
  if (cmd._.length == 1) {
    var tmp = cmd._[0].split(',');
    o.cols = parseInt(tmp[0], 10);
    o.rows = parseInt(tmp[1], 10) || o.cols;
  }
}

function validateExpressionOpt(cmd) {
  if (!cmd.options.expression) {
    error("Command requires a JavaScript expression");
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
    o.directory = arg;
  } else if (arg) {
    if (pathInfo.directory) {
      o.directory = pathInfo.directory;
      cli.validateOutputDir(o.directory);
    }
    o.file = pathInfo.filename;
    if (internal.filenameIsUnsupportedOutputType(o.file)) {
      error("Output file looks like an unsupported file type:", o.file);
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
    if (!internal.isSupportedOutputFormat(o.format)) {
      error("Unsupported output format:", o.format);
    }
  }

  if (o.delimiter) {
    // convert "\t" '\t' \t to tab
    o.delimiter = o.delimiter.replace(/^["']?\\t["']?$/, '\t');
    if (!internal.isSupportedDelimiter(o.delimiter)) {
      error("Unsupported delimiter:", o.delimiter);
    }
  }

  if (o.encoding) {
    o.encoding = internal.validateEncoding(o.encoding);
  }

  // topojson-specific
  if ("quantization" in o && o.quantization > 0 === false) {
    error("quantization= option should be a nonnegative integer");
  }

  if ("topojson_precision" in o && o.topojson_precision > 0 === false) {
    error("topojson-precision= option should be a positive number");
  }
}
