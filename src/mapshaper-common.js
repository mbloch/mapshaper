
var api = {};
var MapShaper = api.internal = {};
var geom = api.geom = {};
var cli = api.cli = {};
var utils = api.utils = Utils.extend({}, Utils);

MapShaper.VERSION = '0.3.13';
MapShaper.LOGGING = false;
MapShaper.TRACING = false;
MapShaper.VERBOSE = false;
MapShaper.CLI = typeof cli != 'undefined';

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

function APIError(msg) {
  var err = new Error(msg);
  err.name = 'APIError';
  return err;
}

var warning = function() {
  message("Warning: " + MapShaper.formatLogArgs(arguments));
};

var message = function() {
  if (MapShaper.LOGGING) {
    MapShaper.logArgs(arguments);
  }
};

// alias for message; useful in web UI for sending some messages to the
// debugging console instead of the command line.
var consoleMessage = message;

var verbose = function() {
  if (MapShaper.VERBOSE && MapShaper.LOGGING) {
    MapShaper.logArgs(arguments);
  }
};

var trace = function() {
  if (MapShaper.TRACING) {
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

function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

utils.wildcardToRegExp = function(name) {
  var rxp = name.split('*').map(function(str) {
    return utils.regexEscape(str);
  }).join('.*');
  return new RegExp(rxp);
};

MapShaper.expandoBuffer = function(constructor, rate) {
  var capacity = 0,
      k = rate >= 1 ? rate : 1.2,
      buf;
  return function(size) {
    if (size > capacity) {
      capacity = Math.ceil(size * k);
      buf = new constructor(capacity);
    }
    return buf;
  };
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

MapShaper.extendBuffer = function(src, newLen, copyLen) {
  var len = Math.max(src.length, newLen);
  var n = copyLen || src.length;
  var dest = new src.constructor(len);
  MapShaper.copyElements(src, 0, dest, 0, n);
  return dest;
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

// Resolve name conflicts in field names by appending numbers
// @fields Array of field names
// @maxLen (optional) Maximum chars in name
//
MapShaper.getUniqFieldNames = function(fields, maxLen) {
  var used = {};
  return fields.map(function(name) {
    var i = 0,
        validName;
    do {
      validName = MapShaper.adjustFieldName(name, maxLen, i);
      i++;
    } while (validName in used);
    used[validName] = true;
    return validName;
  });
};

// Truncate and/or uniqify a name (if relevant params are present)
MapShaper.adjustFieldName = function(name, maxLen, i) {
  var name2, suff;
  maxLen = maxLen || 256;
  if (!i) {
    name2 = name.substr(0, maxLen);
  } else {
    suff = String(i);
    if (suff.length == 1) {
      suff = '_' + suff;
    }
    name2 = name.substr(0, maxLen - suff.length) + suff;
  }
  return name2;
};


// Similar to isFinite() but returns false for null
utils.isFiniteNumber = function(val) {
  return isFinite(val) && val !== null;
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

MapShaper.requirePolygonLayer = function(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polygon') stop(msg || "Expected a polygon layer");
};

MapShaper.requirePathLayer = function(lyr, msg) {
  if (!lyr || !MapShaper.layerHasPaths(lyr)) stop(msg || "Expected a polygon or polyline layer");
};
