/* @requires arrayutils, core.geo */

var MapShaper = {};

MapShaper.sortThresholds = function(arr) {
  var thresholds = [];
  var len = arr.length;
  var skipCount = 10; // only use every nth point, for speed
  for (var i=0; i<len; i++) {
    var src = arr[i];
    for (var j=1, maxj=src.length-2; j<=maxj; j+= skipCount) {
      thresholds.push(src[j]);
    }
  }

  Utils.sortNumbers(thresholds, false);
  return thresholds;
};

MapShaper.getThresholdByPct = function(arr, retainedPct) {
  assert(Utils.isArray(arr) && Utils.isNumber(retainedPct), "Invalid argument types; expected [Array], [Number]");
  assert(retainedPct >= 0 && retainedPct < 1, "Invalid pct:", retainedPct);

  var thresholds = MapShaper.sortThresholds(arr);
  var idx = Utils.clamp(Math.round(thresholds.length * retainedPct), 0, thresholds.length);
  return retainedPct >= 1 ? 0 : thresholds[idx];
};

MapShaper.thinArcsByPct = function(arcs, thresholds, retainedPct, opts) {
  assert(Utils.isArray(arcs) && Utils.isArray(thresholds) && arcs.length == thresholds.length
      && Utils.isNumber(retainedPct), "Invalid arguments; expected [Array], [Array], [Number]");
  T.start();
  var thresh = MapShaper.getThresholdByPct(thresholds, retainedPct);
  T.stop("getThresholdByPct()");

  T.start();
  var thinned = MapShaper.thinArcsByInterval(arcs, thresholds, thresh);
  T.stop("Thin arcs");
  return thinned;
};

// Strip interior points from an arc, retaining only 0-2 vertices
//   with the highest simplification thesholds.
//
function mshpStripArc(xx, yy, uu, retained) {
  if (!(retained >= 0 && retained <= 2)) {
    error("mshpStripArc() retains 0-2 points");
  }
  var max = -Infinity,
      next = -Infinity,
      maxId = -1,
      nextId = -1,
      arcLen = xx.length;

  var xdest = [xx[0]],
      ydest = [yy[0]];

  if (retained > 0) {
    for (var i=1, n=arcLen-1; i<n; i++) {
      var u = uu[i];
      if (u >= max) {
        next = max;
        nextId = maxId;
        max = u;
        maxId = i;
      } else if (u >= next) {
        next = u;
        nextId = i;
      }
    }

    if (maxId == -1) {
      // no intermediate points to thin
    }
    else if (nextId == -1 || retained == 1) {
      xdest.push(xx[maxId]);
      ydest.push(yy[maxId]);
    }
    else { // retained == 2
      if (maxId < nextId) {
        xdest.push(xx[maxId]);
        ydest.push(yy[maxId]);
        xdest.push(xx[nextId]);
        ydest.push(yy[nextId]);
      }
      else {
        xdest.push(xx[nextId]);
        ydest.push(yy[nextId]);
        xdest.push(xx[maxId]);
        ydest.push(yy[maxId]);
      }
    }
  }

  xdest.push(xx[arcLen-1]);
  ydest.push(yy[arcLen-1]);
  return [xdest, ydest];
}

MapShaper.thinArcsByInterval= function(arcs, thresholds, interval, opts) {
  assert(Utils.isArray(arcs) && Utils.isArray(thresholds) && arcs.length == thresholds.length
      && Utils.isNumber(interval), "Invalid arguments; expected [Array], [Array], [Number]");

  var retainPoints = !!opts.minPoints;
  if (retainPoints && opts.minPoints.length != arcs.length) error("[thinArcsByInterval()] Retained point array doesn't match arc length");

  var arcs2 = [],
    originalPoints = 0,
    thinnedPoints = 0;

  for (var i=0, l=arcs.length; i<l; i++) {
    var arc = arcs[i],
      xsrc = arc[0],
      ysrc = arc[1],
      uu = thresholds[i],
      len = uu.length,
      xdest = [],
      ydest = [];

    (xsrc.length == len && ysrc.length == len && len > 1) || error("[thinArcsByThreshold()] Invalid arc length:", len);

    for (var j=0; j<len; j++) {
      if (uu[j] >= interval) {
        xdest.push(xsrc[j]);
        ydest.push(ysrc[j]);
      }
    }

    if (retainPoints && xdest.length < opts.minPoints[i] + 2) { // minPoints sdoesn't include endpoints
      var stripped = mshpStripArc(xsrc, ysrc, uu, opts.minPoints[i]);
      xdest = stripped[0];
      ydest = stripped[1];
    }

    // remove island rings that have collapsed (i.e. fewer than 4 points)
    // TODO: make sure that other kinds of collapsed rings are handled
    //    (maybe during topology phase, via minPoints array)
    //
    var len2 = xdest.length;
    if (len2 < 4 && xdest[0] == xdest[len2-1] && ydest[0] == ydest[len2-1]) {
      xdest = [];
      ydest = [];
    }

    // TODO: report this somehow
    originalPoints += xsrc.length;
    thinnedPoints += xdest.length;

    arcs2.push([xdest, ydest]);
  }
  return arcs2;
};


// Convert arrays of lng and lat coords (xsrc, ysrc) into 
// x, y, z coords on the surface of a sphere with radius 6378137
// (the radius of Earth sphere in meters)
//
MapShaper.calcXYZ = function(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180,
      r = 6378137;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var theta = xsrc[i] * deg2rad,
        lat = ysrc[i],
        phi = (lat > 0 ? 90 - lat : -90 - lat) * deg2rad;
        sinPhi = Math.sin(phi);

    xbuf[i] = sinPhi * Math.cos(theta) * r;
    ybuf[i] = sinPhi * Math.sin(theta) * r;
    zbuf[i] = Math.cos(phi) * r;
  }
}

// Apply a simplification function to each arc in an array, return simplified arcs.
// 
// @simplify has signature: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifyArcs = function(arcs, simplify, opts) {
  if (opts && opts.spherical) {
    return MapShaper.simplifyArcsSph(arcs, simplify);
  }
  var data = Utils.map(arcs, function(arc) {
    return simplify(arc[0], arc[1]);
  });

  return data;  
};

MapShaper.simplifyArcsSph = function(arcs, simplify) {
  var bufSize = 0,
      xbuf, ybuf, zbuf;

  var data = Utils.map(arcs, function(arc) {
    var arcLen = arc[0].length;
    if (bufSize < arcLen) {
      bufSize = Math.round(arcLen * 1.2);
      xbuf = new Float64Array(bufSize);
      ybuf = new Float64Array(bufSize);
      zbuf = new Float64Array(bufSize);
    }

    MapShaper.calcXYZ(arc[0], arc[1], xbuf, ybuf, zbuf);
    return simplify(xbuf, ybuf, zbuf, arcLen);
  });
  return data;
};


MapShaper.importFromFile = function(fname) {
  var info = Node.getFileInfo(fname);
  assert(info.exists, "File not found.");
  assert(info.ext == 'shp' || info.ext == 'json', "Expected *.shp or *.json file; found:", fname);

  if (info.ext == 'json') {
    return MapShaper.importJSON(JSON.parse(Node.readFile(fname, 'utf8')));
  }
  return MapShaper.importShpFromBuffer(Node.readFile(fname));
};

// assumes Shapefile, TopoJSON or GeoJSON
//
MapShaper.importFromStream = function(sname) {
  assert("/dev/stdin", "[importFromStream()] requires /dev/stdin; received:", sname);
  var buf = Node.readFile(sname);
  if (buf.readUInt32BE(0) == 9994) {
    return MapShaper.importShpFromBuffer(buf);
  }
  var obj = JSON.parse(buf.toString());
  return MapShaper.importJSON(obj);
};


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

MapShaper.calcXYBounds = function(xx, yy, bb) {
  if (!bb) bb = new BoundingBox();
  var xbounds = Utils.getArrayBounds(xx),
      ybounds = Utils.getArrayBounds(yy);
  assert(xbounds.nan == 0 && ybounds.nan == 0, "[calcXYBounds()] Data contains NaN; xbounds:", xbounds, "ybounds:", ybounds);
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
MapShaper.convertTopoShape = function(shape, arcs) {
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
    if (xx.length > 0) {
      parts.push([xx, yy]);
      pointCount += xx.length;
      MapShaper.calcXYBounds(xx, yy, bounds);
    }
  }

  return {parts: parts, bounds: bounds, pointCount: pointCount, partCount: parts.length};
};
