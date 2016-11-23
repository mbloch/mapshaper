/* @requires mapshaper-utils */

var api = {};
var MapShaper = {
  VERSION: VERSION, // export version
  LOGGING: false,
  TRACING: false,
  VERBOSE: false
};

new Float64Array(1); // workaround for https://github.com/nodejs/node/issues/6006

// in case running in browser and loading browserified modules separately
var Buffer = require('buffer').Buffer;

function error() {
  MapShaper.error.apply(null, utils.toArray(arguments));
}

// Handle an error caused by invalid input or misuse of API
function stop() {
  MapShaper.stop.apply(null, utils.toArray(arguments));
}

function APIError(msg) {
  var err = new Error(msg);
  err.name = 'APIError';
  return err;
}

function message() {
  MapShaper.message.apply(null, utils.toArray(arguments));
}

function verbose() {
  if (MapShaper.VERBOSE && MapShaper.LOGGING) {
    MapShaper.logArgs(arguments);
  }
}

function trace() {
  if (MapShaper.TRACING) {
    MapShaper.logArgs(arguments);
  }
}

function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

api.enableLogging = function() {
  MapShaper.LOGGING = true;
  return api;
};

api.printError = function(err) {
  var msg;
  if (utils.isString(err)) {
    err = new APIError(err);
  }
  if (MapShaper.LOGGING && err.name == 'APIError') {
    msg = err.message;
    if (!/Error/.test(msg)) {
      msg = "Error: " + msg;
    }
    message(msg);
    message("Run mapshaper -h to view help");
  } else {
    throw err;
  }
};

MapShaper.error = function() {
  var msg = Utils.toArray(arguments).join(' ');
  throw new Error(msg);
};

MapShaper.stop = function() {
  throw new APIError(MapShaper.formatLogArgs(arguments));
};

MapShaper.message = function() {
  if (MapShaper.LOGGING) {
    MapShaper.logArgs(arguments);
  }
};

MapShaper.formatLogArgs = function(args) {
  return utils.toArray(args).join(' ');
};

// Format an array of (preferably short) strings in columns for console logging.
MapShaper.formatStringsAsGrid = function(arr) {
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

MapShaper.logArgs = function(args) {
  if (utils.isArrayLike(args)) {
    (console.error || console.log).call(console, MapShaper.formatLogArgs(args));
  }
};

MapShaper.getWorldBounds = function(e) {
  e = utils.isFiniteNumber(e) ? e : 1e-10;
  return [-180 + e, -90 + e, 180 - e, 90 - e];
};

MapShaper.probablyDecimalDegreeBounds = function(b) {
  var world = MapShaper.getWorldBounds(-1), // add a bit of excess
      bbox = (b instanceof Bounds) ? b.toArray() : b;
  return containsBounds(world, bbox);
};

MapShaper.layerHasGeometry = function(lyr) {
  return MapShaper.layerHasPaths(lyr) || MapShaper.layerHasPoints(lyr);
};

MapShaper.layerHasPaths = function(lyr) {
  return (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') &&
    MapShaper.layerHasNonNullShapes(lyr);
};

MapShaper.layerHasPoints = function(lyr) {
  return lyr.geometry_type == 'point' && MapShaper.layerHasNonNullShapes(lyr);
};

MapShaper.layerHasNonNullShapes = function(lyr) {
  return utils.some(lyr.shapes || [], function(shp) {
    return !!shp;
  });
};

MapShaper.requireDataFields = function(table, fields, cmd) {
  var prefix = cmd ? '[' + cmd + '] ' : '';
  if (!table) {
    stop(prefix + "Missing attribute data");
  }
  var dataFields = table.getFields(),
      missingFields = utils.difference(fields, dataFields);
  if (missingFields.length > 0) {
    stop(prefix + "Table is missing one or more fields:\n",
        missingFields, "\nExisting fields:", '\n' + MapShaper.formatStringsAsGrid(dataFields));
  }
};

MapShaper.requirePolygonLayer = function(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polygon') stop(msg || "Expected a polygon layer");
};

MapShaper.requirePathLayer = function(lyr, msg) {
  if (!lyr || !MapShaper.layerHasPaths(lyr)) stop(msg || "Expected a polygon or polyline layer");
};
