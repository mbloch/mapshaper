
var api = {};
var MapShaper = api.internal = {};
var geom = api.geom = {};
var utils = api.utils = Utils.extend({}, Utils);

MapShaper.LOGGING = false;
MapShaper.TRACING = false;
MapShaper.VERBOSE = false;

api.enableLogging = function() {
  MapShaper.LOGGING = true;
  return api;
};

api.printError = function(err) {
  if (utils.isString(err)) {
    err = new APIError(err);
  }
  if (MapShaper.LOGGING && err.name == 'APIError') {
    message("Error: " + err.message);
    message("Run mapshaper -h to view help");
  } else {
    throw err;
  }
};

// Handle an error caused by invalid input or misuse of API
function stop() {
  var message = Utils.toArray(arguments).join(' ');
  var err = new APIError(message);
  throw err;
}

function APIError(msg) {
  var err = new Error(msg);
  err.name = 'APIError';
  return err;
}

var message = function() {
  if (MapShaper.LOGGING) {
    logArgs(arguments);
  }
};

var verbose = function() {
  if (MapShaper.VERBOSE && MapShaper.LOGGING) {
    logArgs(arguments);
  }
};

var trace = function() {
  if (MapShaper.TRACING) {
    logArgs(arguments);
  }
};

function logArgs(args) {
  if (Utils.isArrayLike(args)) {
    var arr = Utils.toArray(args);
    (console.error || console.log).apply(console, arr);
  }
}

function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

utils.wildcardToRegExp = function(name) {
  var rxp = name.split('*').map(function(str) {
    return utils.regexEscape(str);
  }).join('.*');
  return new RegExp(rxp);
};

utils.getPathSep = function(path) {
  // TODO: improve
  return path.indexOf('/') == -1 && path.indexOf('\\') != -1 ? '\\' : '/';
};

// Parse the path to a file without using Node
// Assumes: not a directory path
utils.parseLocalPath = function(path) {
  var obj = {},
      sep = utils.getPathSep(path),
      parts = path.split(sep),
      i;

  if (parts.length == 1) {
    obj.filename = parts[0];
    obj.directory = "";
  } else {
    obj.filename = parts.pop();
    obj.directory = parts.join(sep);
  }
  i = obj.filename.lastIndexOf('.');
  if (i > -1) {
    obj.extension = obj.filename.substr(i + 1);
    obj.basename = obj.filename.substr(0, i);
    obj.pathbase = path.substr(0, path.lastIndexOf('.'));
  } else {
    obj.extension = "";
    obj.basename = obj.filename;
    obj.pathbase = path;
  }
  return obj;
};

utils.getFileBase = function(path) {
  return utils.parseLocalPath(path).basename;
};

utils.getFileExtension = function(path) {
  return utils.parseLocalPath(path).extension;
};

utils.getPathBase = function(path) {
  return utils.parseLocalPath(path).pathbase;
};

MapShaper.guessFileType = function(file) {
  var ext = utils.getFileExtension(file).toLowerCase(),
      type = null;
  if (file == '/dev/stdin') {
    type = 'json';
  } else if (/json$/i.test(file)) {
    type = 'json';
  } else if (ext == 'shp' || ext == 'dbf' || ext == 'prj') {
    type = ext;
  }
  return type;
};

MapShaper.guessFileFormat = function(file, inputFormat) {
  var type = MapShaper.guessFileType(file),
      format = null;
  if (type == 'shp') {
    format = 'shapefile';
  } else if (type == 'json') {
    if (/geojson$/.test(file)) {
      format = 'geojson';
    } else if (/topojson$/.test(file) || inputFormat == 'topojson') {
      format = 'topojson';
    } else {
      format = 'geojson';
    }
  }
  return format;
};

MapShaper.copyElements = function(src, i, dest, j, n, rev) {
  if (src === dest && j > i) error ("copy error");
  var inc = 1,
      offs = 0;
  if (rev) {
    inc = -1;
    offs = n - 1;
  }
  for (var k=0; k<n; k++, offs += inc) {
    dest[k + j] = src[i + offs];
  }
};

MapShaper.extendBuffer = function(src, newLen, n) {
  if (newLen > src.length === false) {
    error("[extendBuffer()] invalid length:", newLen);
  }
  var dest = new src.constructor(newLen);
  n = n || newLen;
  MapShaper.copyElements(src, 0, dest, 0, n);
  return dest;
};

MapShaper.getCommonFileBase = function(names) {
  return names.reduce(function(memo, name, i) {
    if (i === 0) {
      memo = utils.getFileBase(name);
    } else {
      memo = MapShaper.mergeNames(memo, name);
    }
    return memo;
  }, "");
};

MapShaper.mergeNames = function(name1, name2) {
  var merged = "";
  if (name1 && name2) {
    merged = utils.findStringPrefix(name1, name2).replace(/[-_]$/, '');
  }
  return merged;
};

utils.findStringPrefix = function(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
};

// Similar to isFinite() but returns false for null
utils.isFiniteNumber = function(val) {
  return isFinite(val) && val !== null;
};

MapShaper.probablyDecimalDegreeBounds = function(b) {
  if (b instanceof Bounds) b = b.toArray();
  return containsBounds([-200, -91, 200, 91], b);
};

MapShaper.layerHasPaths = function(lyr) {
  return lyr.shapes && (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline');
};

MapShaper.layerHasPoints = function(lyr) {
  return lyr.shapes && lyr.geometry_type == 'point';
};

MapShaper.requirePolygonLayer = function(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polygon') stop(msg || "Expected a polygon layer");
};

MapShaper.requirePathLayer = function(lyr, msg) {
  if (!lyr || !MapShaper.layerHasPaths(lyr)) stop(msg || "Expected a polygon or polyline layer");
};
