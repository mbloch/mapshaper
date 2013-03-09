/* requires mapshaper-common, mapshaper-geom */



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
  var thinned = MapShaper.thinArcsByInterval(arcs, thresholds, thresh, opts);
  T.stop("Thin arcs");
  return thinned;
};


// Strip interior points from an arc.
// @retained gives the number of interior points to leave in (retains those
//    with the highest thresholds)
//
MapShaper.stripArc = function(xx, yy, uu, retained) {
  var data = [],
      len = xx.length,
      min, u, xx2, yy2;
  if (len < 2) error("Invalid arc");

  if (retained > 0) {
    for (var i=1, lim=len-1; i<lim; i++) {
      u = uu[i];
      if (data.length < retained) {
        data.push({i:i, u:u});
      } else if ((min=data[0]).u < u) {
        min.u = u;
        min.i = i;
      }
      if (retained > 1) Utils.sortOn(data, 'u', true);
    }
    Utils.sortOn(data, 'i', true);
  }
  xx2 = [xx[0]];
  yy2 = [yy[0]];
  Utils.forEach(data, function(obj) {
    xx2.push(xx[obj.i]);
    yy2.push(yy[obj.i]);
  })
  xx2.push(xx[len-1]);
  yy2.push(yy[len-1]);
  return [xx2, yy2];
};


MapShaper.thinArcByInterval = function(xsrc, ysrc, uu, interval, retainedPoints) {
  var xdest = [],
      ydest = [],
      srcLen = xsrc.length,
      destLen;

  if (ysrc.length != srcLen || uu.length != srcLen || srcLen < 2)
    error("[thinArcByThreshold()] Invalid arc data");

  for (var i=0; i<srcLen; i++) {
    if (uu[i] > interval) {
      xdest.push(xsrc[i]);
      ydest.push(ysrc[i]);
    }
  }

  if (xdest.length < retainedPoints + 2) { // minInteriorPoints doesn't include endpoints
    var stripped = MapShaper.stripArc(xsrc, ysrc, uu, retainedPoints);
    xdest = stripped[0];
    ydest = stripped[1];
  }

  // remove island rings that have collapsed (i.e. fewer than 4 points)
  // TODO: make sure that other kinds of collapsed rings are handled
  //    (maybe during topology phase, via minPoints array)
  //
  destLen = xdest.length;
  if (destLen < 4 && xdest[0] == xdest[destLen-1] && ydest[0] == ydest[destLen-1]) {
    xdest = [];
    ydest = [];
  }

  return [xdest, ydest];
};


MapShaper.thinArcsByInterval = function(arcs, thresholds, interval, opts) {
  if (!Utils.isArray(arcs) || arcs.length != thresholds.length)
    error("[thinArcsByInterval()] requires matching arrays of arcs and thresholds");
  if (!Utils.isNumber(interval))
    error("[thinArcsByInterval()] requires an interval");

  var retainPoints = !!opts.minPoints;
  if (retainPoints && opts.minPoints.length != arcs.length)
    error("[thinArcsByInterval()] Retained point array doesn't match arc length");

  var thinned = [];
  for (var i=0, l=arcs.length; i<l; i++) {
    var arc = MapShaper.thinArcByInterval(arcs[i][0], arcs[i][1], thresholds[i], interval, retainPoints ? opts.minPoints[i] : 0);
    thinned.push(arc);
  }
  return thinned;
};


// Convert arrays of lng and lat coords (xsrc, ysrc) into 
// x, y, z coords on the surface of a sphere with radius 6378137
// (the radius of spherical Earth datum in meters)
//
MapShaper.convLngLatToSph = function(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180,
      r = 6378137;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var lng = xsrc[i] * deg2rad,
        lat = ysrc[i] * deg2rad,
        cosLat = Math.cos(lat);
    xbuf[i] = Math.cos(lng) * cosLat * r;
    ybuf[i] = Math.sin(lng) * cosLat * r;
    zbuf[i] = Math.sin(lat) * r;
  }
}

// Apply a simplification function to each arc in an array, return simplified arcs.
// 
// @simplify: function(xx:array, yy:array, [zz:array], [length:integer]):array
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

    MapShaper.convLngLatToSph(arc[0], arc[1], xbuf, ybuf, zbuf);
    return simplify(xbuf, ybuf, zbuf, arcLen);
  });
  return data;
};