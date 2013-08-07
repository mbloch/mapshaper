/* @requires mapshaper-visvalingam, mapshaper-dp */


MapShaper.protectRingsFromCollapse = function(thresholds, lockCounts) {
  var n;
  for (var i=0, len=thresholds.length; i<len; i++) {
    n = lockCounts[i];
    if (n > 0) {
      MapShaper.lockMaxThresholds(thresholds[i], n);
    }
  }
};

// TODO: test this function
// Protect polar coordinates and coordinates at the prime meridian from
// being removed before other points in a path.
// Assume: coordinates are in decimal degrees
//
MapShaper.protectWorldEdges = function(arcs, thresholds, bounds) {
  Utils.forEach(arcs, function(arc) {
    var zz = thresholds[i],
        xx = arcs[i][0],
        yy = arcs[i][1],
        // -179.99999999999994 rounding error
        // found in test/test_data/ne/ne_110m_admin_0_scale_rank.shp
        err = 1e-12,
        l = -180 + err,
        r = 180 - err,
        t = 90 - err,
        b = -90 + err,
        maxZ, x, y;

    // return if content doesn't reach edges
    if (containsBounds([l, b, r, t], bounds) === false) return;

    for (var i=0, n=zz.length; i<n; i++) {
      maxZ = 0;
      x = xx[i];
      y = yy[i];
      if (x > r || x < l || y < b || y > t) {
        if (maxZ === 0) {
          maxZ = MapShaper.findMaxThreshold(zz);
        }
        if (zz[i] !== Infinity) { // don't override lock value
          zz[i] = maxZ;
        }
      }
    }
  });
};

// Return largest value in an array, ignoring Infinity (lock value)
//
MapShaper.findMaxThreshold = function(zz) {
  var z, maxZ = 0;
  for (var i=0, n=zz.length; i<n; i++) {
    z = zz[i];
    if (z > maxZ && z < Infinity) {
      maxZ = z;
    }
  }
  return maxZ;
};


MapShaper.replaceValue = function(arr, value, replacement) {
  var count = 0, k;
  for (var i=0, n=arr.length; i<n; i++) {
    if (arr[i] === value) {
      arr[i] = replacement;
      count++;
    }
  }
  return count;
};

// Protect the highest-threshold interior vertices in an arc from removal by
// setting their removal thresholds to Infinity
//
MapShaper.lockMaxThresholds = function(zz, numberToLock) {
  var lockVal = Infinity,
      target = numberToLock | 0,
      lockedCount, maxVal, replacements, z;
  do {
    lockedCount = 0;
    maxVal = 0;
    for (var i=1, len = zz.length - 1; i<len; i++) { // skip arc endpoints
      z = zz[i];
      if (z === lockVal) {
        lockedCount++;
      } else if (z > maxVal) {
        maxVal = z;
      }
    }
    if (lockedCount >= numberToLock) break;
    replacements = MapShaper.replaceValue(zz, maxVal, lockVal);
  } while (lockedCount < numberToLock && replacements > 0);
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
};

// Apply a simplification function to each path in an array, return simplified path.
//
MapShaper.simplifyPaths = function(paths, method, bounds) {
  var decimalDegrees = probablyDecimalDegreeBounds(bounds);
  var simplifyPath = MapShaper.simplifiers[method] || error("Unknown method:", method),
      data;

  T.start();
  if (decimalDegrees) {
    data = MapShaper.simplifyPathsSph(paths, simplifyPath);
  } else {
    data = Utils.map(paths, function(path) {
      return simplifyPath(path[0], path[1]);
    });
  }

  if (decimalDegrees) {
    MapShaper.protectWorldEdges(paths, data, bounds);
  }
  T.stop("Calculate simplification data");
  return data;
};

// Path simplification functions
// Signature: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifiers = {
  vis: Visvalingam.getArcCalculator(Visvalingam.standardMetric, Visvalingam.standardMetric3D, 0.65),
  mod: Visvalingam.getArcCalculator(Visvalingam.specialMetric, Visvalingam.specialMetric3D, 0.65),
  dp: DouglasPeucker.calcArcData
};

MapShaper.simplifyPathsSph = function(arcs, simplify) {
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