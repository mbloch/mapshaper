/* @requires mshp-common-lib */

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

api.stop = stop;

// TODO: adapt to run in browser
function stop() {
  var args = Utils.toArray(arguments);
  args.unshift('Error:');
  if (MapShaper.LOGGING) {
    message.apply(null, args);
    message("Run mapshaper -h to view help");
    process.exit(1);
  } else {
    error.apply(null, args);
  }
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
    console.log(arr.join(' '));
  }
}

function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

// Parse the path to a file
// Assumes: not a directory path
utils.parseLocalPath = function(path) {
  var obj = {},
      parts = path.split('/'), // TODO: fix
      i;

  if (parts.length == 1) {
    obj.filename = parts[0];
    obj.directory = "";
  } else {
    obj.filename = parts.pop();
    obj.directory = parts.join('/');
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
  if (/json$/i.test(file)) {
    type = 'json';
  } else if (ext == 'shp' || ext == 'dbf' || ext == 'prj') {
    type = ext;
  }
  return type;
};

MapShaper.guessFileFormat = function(str) {
  var type = null,
      name = str.toLowerCase();
  if (/topojson$/.test(name)) {
    type = 'topojson';
  } else if (/json$/.test(name)) {
    type = 'geojson';
  } else if (/shp$/.test(name)) {
    type = 'shapefile';
  }
  return type;
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
