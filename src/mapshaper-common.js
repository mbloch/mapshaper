/* @requires mapshaper-utils, mapshaper-buffer */

var api = {};
var internal = {
  VERSION: VERSION, // export version
  LOGGING: false,
  DEBUG: false,
  QUIET: false,
  VERBOSE: false,
  T: T,
  defs: {}
};

new Float64Array(1); // workaround for https://github.com/nodejs/node/issues/6006

function error() {
  internal.error.apply(null, utils.toArray(arguments));
}

// Handle an error caused by invalid input or misuse of API
function stop() {
  internal.stop.apply(null, messageArgs(arguments));
}

function APIError(msg) {
  var err = new Error(msg);
  err.name = 'APIError';
  return err;
}

function messageArgs(args) {
  var arr = utils.toArray(args);
  if (internal.CURR_CMD) {
    arr.unshift('[' + internal.CURR_CMD + ']');
  }
  return arr;
}

function message() {
  internal.message.apply(null, messageArgs(arguments));
}

function verbose() {
  if (internal.VERBOSE) {
    internal.logArgs(arguments);
  }
}

function debug() {
  if (internal.DEBUG) {
    internal.logArgs(arguments);
  }
}
var trace = debug; // TODO: rename debug() calls

function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

api.enableLogging = function() {
  internal.LOGGING = true;
  return api;
};

api.printError = function(err) {
  var msg;
  if (utils.isString(err)) {
    err = new APIError(err);
  }
  if (internal.LOGGING && err.name == 'APIError') {
    msg = err.message;
    if (!/Error/.test(msg)) {
      msg = "Error: " + msg;
    }
    console.error(msg);
    message("Run mapshaper -h to view help");
  } else {
    throw err;
  }
};

internal.error = function() {
  var msg = Utils.toArray(arguments).join(' ');
  throw new Error(msg);
};

internal.stop = function() {
  throw new APIError(internal.formatLogArgs(arguments));
};

internal.message = function() {
  internal.logArgs(arguments);
};

internal.formatLogArgs = function(args) {
  return utils.toArray(args).join(' ');
};

// Format an array of (preferably short) strings in columns for console logging.
internal.formatStringsAsGrid = function(arr) {
  // TODO: variable column width
  var longest = arr.reduce(function(len, str) {
        return Math.max(len, str.length);
      }, 0),
      colWidth = longest + 2,
      perLine = Math.floor(80 / colWidth) || 1;
  return arr.reduce(function(memo, name, i) {
    var col = i % perLine;
    if (i > 0 && col === 0) memo += '\n';
    if (col < perLine - 1) { // right-pad all but rightmost column
      name = utils.rpad(name, colWidth - 2, ' ');
    }
    return memo +  '  ' + name;
  }, '');
};

internal.logArgs = function(args) {
  if (internal.LOGGING && !internal.QUIET && utils.isArrayLike(args)) {
    (console.error || console.log).call(console, internal.formatLogArgs(args));
  }
};

internal.getWorldBounds = function(e) {
  e = utils.isFiniteNumber(e) ? e : 1e-10;
  return [-180 + e, -90 + e, 180 - e, 90 - e];
};

internal.probablyDecimalDegreeBounds = function(b) {
  var world = internal.getWorldBounds(-1), // add a bit of excess
      bbox = (b instanceof Bounds) ? b.toArray() : b;
  return containsBounds(world, bbox);
};

internal.layerHasGeometry = function(lyr) {
  return internal.layerHasPaths(lyr) || internal.layerHasPoints(lyr);
};

internal.layerHasPaths = function(lyr) {
  return (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') &&
    internal.layerHasNonNullShapes(lyr);
};

internal.layerHasPoints = function(lyr) {
  return lyr.geometry_type == 'point' && internal.layerHasNonNullShapes(lyr);
};

internal.layerHasNonNullShapes = function(lyr) {
  return utils.some(lyr.shapes || [], function(shp) {
    return !!shp;
  });
};

internal.requireDataFields = function(table, fields) {
  if (!table) {
    stop("Missing attribute data");
  }
  var dataFields = table.getFields(),
      missingFields = utils.difference(fields, dataFields);
  if (missingFields.length > 0) {
    stop("Table is missing one or more fields:\n",
        missingFields, "\nExisting fields:", '\n' + internal.formatStringsAsGrid(dataFields));
  }
};

internal.requirePolygonLayer = function(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polygon') stop(msg || "Expected a polygon layer");
};

internal.requirePathLayer = function(lyr, msg) {
  if (!lyr || !internal.layerHasPaths(lyr)) stop(msg || "Expected a polygon or polyline layer");
};
