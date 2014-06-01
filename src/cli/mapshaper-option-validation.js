/* @requires mapshaper-common */


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
  o.source = o.source || _[0];

  if (!o.source) {
    error("-join requires the name of a file to join");
  }

  if (Utils.some("shp,xls,xlsx".split(','), function(suff) {
    return Utils.endsWith(o.source, suff);
  })) {
    error("-join currently only supports dbf and csv files");
  }

  if (!Node.fileExists(o.source)) {
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

function validateSplitOpts(o, _) {
  if (_.length == 1) {
    o.field = _[0];
  } else if (_.length > 1) {
    error("-split takes a single field name");
  }
}

function validateDissolveOpts(o, _) {
  if (_.length == 1) {
    o.field = _[0];
  } else if (_.length > 1) {
    error("-dissolve takes a single field name");
  }

  if (o.sum_fields && !isCommaSep(o.sum_fields)) error("-dissolve sum-fields takes a comma-sep. list");
  if (o.copy_fields && !isCommaSep(o.copy_fields)) error("-dissolve copy-fields takes a comma-sep. list");
}

function validateMergeLayersOpts(o, _) {
  if (_.length > 0) error("-merge-layers unexpected option:", _);
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
  if (!o.fields && _.length == 1) {
    o.fields = cli.validateCommaSepNames(_[0]);
  }

  if (o.fields && o.fields.length === 0 || _.length > 1) {
    error("-lines takes a comma-separated list of fields");
  }
}

function validateInnerLinesOpts(o, _) {
  if (_.length > 0) {
    error("-innerlines takes no arguments");
  }
}

function validateSubdivideOpts(o, _) {
  if (_.length !== 1) {
    error("-subdivide option requires a JavaScript expression");
  }
  o.expression = _[0];
}

function validateFieldsOpts(o, _) {
  var fields = validateCommaSep(_[0]);
  if (!fields || fields.length > 0 === false) {
    error("-fields option requires a comma-sep. list of fields");
  }
  o.fields = fields;
}

function validateLayersOpts(o, _) {
  var layers = validateCommaSep(_[0]);
  if (!layers || layers.length > 0 === false) {
    error("-layers option requires a comma-sep. list of layer names");
  }
  o.layers = layers;
}

function validateFilterOpts(o, _) {
  if (_.length !== 1) {
    error("-filter option requires a JavaScript expression");
  }
  o.expression = _[0];
}

function validateOutputOpts(o, _) {
  var odir, obase, oext, ofmt;
  if (_.length > 1) {
    error("-o takes one file or directory argument, received:", _);
  }
  if (_.length == 1) {
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
      }
      o.output_file = _[0];
    }
  }

  var supportedTypes = ["geojson", "topojson", "shapefile"];
  if (o.output_file && Utils.contains(supportedTypes, o.output_file)) {
    error("Use format=" + o.output_file + " to set output format");
  }

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
