/* @requires arrayutils, core.geo */

// TODO: adapt to run in browser
function stop(msg) {
  msg && trace(msg);
  process.exit(1);
}

var MapShaper = {};

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
    obj.ext = name.substr(i);
    obj.basename = name.substr(0, i);
  }
  obj.filename = name;
  return obj;
};

/*
    // TODO: give better output if fpath is a directory
    var info = {};
    var filename = Node.path.basename(fpath);
    if (filename.lastIndexOf('/') == filename.length - 1) {
      filename = filename.substr(0, filename.length-1);
    }
    info.file = filename;
    info.path = Node.path.resolve(fpath);
    info.ext = Node.path.extname(fpath).toLowerCase().slice(1);
    info.base = info.ext.length > 0 ? info.file.slice(0, -info.ext.length - 1) : info.file;
    info.directory = Node.path.dirname(info.path);
    info.relative_dir = Node.path.dirname(fpath);
    return info;
*/


MapShaper.extendPartCoordinates = function(xdest, ydest, xsrc, ysrc, reversed) {
  var len=xsrc.length;
  (!len || len < 2) && error("[MapShaper.extendShapePart()] invalid arc length:", len);
  if (reversed) {
    var inc = -1;
    var startId = len - 1;
    var stopId = -1;
  } else {
    inc = 1;
    startId = 0;
    stopId = len;
  }

  if (xdest.length > 0) {
    startId += inc; // skip first point of arc if part has been started
  }

  for (var i=startId; i!=stopId; i+=inc) {
    xdest.push(xsrc[i]);
    ydest.push(ysrc[i]);
  }
};

/*
MapShaper.calcArcBounds = function(arcs) {
  var arcCount = arcs.length,
      i = 0;
  var arr = new Float64Array(arcCount * 4);
  for (var arcId=0; arcId<arcCount; arcId++) {
    var arc = arcs[arcId];
    var xb = Utils.getArrayBounds(arc[0]);
    var yb = Utils.getArrayBounds(arc[1]);
    arr[i++] = xb.min;
    arr[i++] = yb.min;
    arr[i++] = xb.max;
    arr[i++] = yb.max;
  }
  return arr;
};

*/


MapShaper.calcXYBounds = function(xx, yy, bb) {
  if (!bb) bb = new BoundingBox();
  var xbounds = Utils.getArrayBounds(xx),
      ybounds = Utils.getArrayBounds(yy);
  if (xbounds.nan > 0 || ybounds.nan > 0) error("[calcXYBounds()] Data contains NaN; xbounds:", xbounds, "ybounds:", ybounds);
  bb.mergePoint(xbounds.min, ybounds.min);
  bb.mergePoint(xbounds.max, ybounds.max);
  return bb;
};

MapShaper.transposeXYCoords = function(arr) {
  var xx = arr[0],
      yy = arr[1],
      points = [];
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
      bounds = new BoundingBox();

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
      if (arc[0].length > 1) {
        MapShaper.extendPartCoordinates(xx, yy, arc[0], arc[1], reversed);
      }
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


