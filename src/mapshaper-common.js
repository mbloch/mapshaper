/* @requires mshp-common-lib */

var MapShaper = {};

// TODO: adapt to run in browser
function stop() {
  var argArr = Utils.toArray(arguments);
  if (MapShaper.LOGGING) {
    message.apply(null, argArr);
    process.exit(1);
  } else {
    error.apply(null, argArr);
  }
}

function message() {
  var msg = Utils.toArray(arguments).join(' ');
  if (MapShaper.LOGGING && msg) {
    console.log(msg);
  }
}

MapShaper.absArcId = function(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
};

MapShaper.parseLocalPath = function(path) {
  var obj = {
    ext: '',
    directory: '',
    filename: '',
    basename: ''
  };
  var parts = path.split('/'),
      name, i;

  if (parts.length == 1) {
    name = parts[0];
  } else {
    name = parts.pop();
    obj.directory = parts.join('/');
  }
  i = name.lastIndexOf('.');
  if (i > -1) {
    obj.ext = name.substr(i + 1); // omit '.'
    obj.basename = name.substr(0, i);
    obj.pathbase = path.substr(0, i);
  } else {
    obj.basename = name;
    obj.pathbase = path;
  }
  obj.filename = name;
  return obj;
};

MapShaper.guessFileType = function(file) {
  var info = MapShaper.parseLocalPath(file),
      ext = info.ext.toLowerCase(),
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


MapShaper.extendPartCoordinates = function(xdest, ydest, xsrc, ysrc, reversed) {
  var srcLen = xsrc.length,
      destLen = xdest.length,
      prevX = destLen === 0 ? Infinity : xdest[destLen-1],
      prevY = destLen === 0 ? Infinity : ydest[destLen-1],
      x, y, inc, startId, stopId;

  if (reversed) {
    inc = -1;
    startId = srcLen - 1;
    stopId = -1;
  } else {
    inc = 1;
    startId = 0;
    stopId = srcLen;
  }

  for (var i=startId; i!=stopId; i+=inc) {
    x = xsrc[i];
    y = ysrc[i];
    if (x !== prevX || y !== prevY) {
      xdest.push(x);
      ydest.push(y);
      prevX = x;
      prevY = y;
    }
  }
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

MapShaper.calcXYBounds = function(xx, yy, bb) {
  if (!bb) bb = new Bounds();
  var xbounds = Utils.getArrayBounds(xx),
      ybounds = Utils.getArrayBounds(yy);
  if (xbounds.nan > 0 || ybounds.nan > 0) error("[calcXYBounds()] Data contains NaN; xbounds:", xbounds, "ybounds:", ybounds);
  bb.mergePoint(xbounds.min, ybounds.min);
  bb.mergePoint(xbounds.max, ybounds.max);
  return bb;
};

MapShaper.transposeXYCoords = function(xx, yy) {
  var points = [];
  for (var i=0, len=xx.length; i<len; i++) {
    points.push([xx[i], yy[i]]);
  }
  return points;
};

// Convert a topological shape to a non-topological format
// (for exporting)
//
MapShaper.convertTopoShape = function(shape, arcs, closed) {
  var parts = [],
      pointCount = 0,
      bounds = new Bounds();

  for (var i=0; i<shape.length; i++) {
    var topoPart = shape[i],
        xx = [],
        yy = [];
    for (var j=0; j<topoPart.length; j++) {
      var arcId = topoPart[j],
          reversed = false;
      if (arcId < 0) {
        arcId = -1 - arcId;
        reversed = true;
      }
      var arc = arcs[arcId];
      MapShaper.extendPartCoordinates(xx, yy, arc[0], arc[1], reversed);
    }
    var pointsInPart = xx.length,
        validPart = !closed && pointsInPart > 0 || pointsInPart > 3;
    // TODO: other validation:
    // self-intersection test? test rings have non-zero area? rings follow winding rules?

    if (validPart) {
      parts.push([xx, yy]);
      pointCount += xx.length;
      MapShaper.calcXYBounds(xx, yy, bounds);
    }
  }

  return {parts: parts, bounds: bounds, pointCount: pointCount, partCount: parts.length};
};

MapShaper.getUniqueLayerNames = function(names) {
  if (names.length <= 1) return names; // name of single layer guaranteed unique
  var counts = Utils.countValues(names);

  // assign unique name to each layer
  var index = {};
  return names.map(function(name) {
    var count = counts[name],
        i;
    if (count > 1 || name in index) {
      // naming conflict, need to find a unique name
      name = name || 'layer'; // use layer1, layer2, etc as default
      i = 1;
      while ((name + i) in index) {
        i++;
      }
      name = name + i;
    }
    index[name] = true;
    return name;
  });
};
