/* @requires mapshaper-common, mapshaper-geom */

// TODO; calculate pct based on distinct points in the dataset
// TODO: pass number of points as a parameter instead of calculating it
MapShaper.getThresholdByPct = function(arr, retainPct) {
  if (retainPct <= 0 || retainPct >= 1) error("Invalid simplification pct:", retainPct);
  var tmp = MapShaper.getInnerThresholds(arr, 2);
  var k = Math.floor((1 - retainPct) * tmp.length);
  return Utils.findValueByRank(tmp, k + 1); // rank start at 1
};

// Receive: array of arrays of simplification thresholds arcs[vertices[]]
// Return: one array of all thresholds, sorted in ascending order
//
MapShaper.getDescendingThresholds = function(arr, skip) {
  var merged = MapShaper.getInnerThresholds(arr, skip);
  Utils.quicksort(merged, false);
  return merged;
};

MapShaper.countInnerPoints = function(arr, skip) {
  var count = 0,
      nth = skip || 1;
  for (var i=0, n = arr.length; i<n; i++) {
    count += Math.ceil((arr[i].length - 2) / nth);
  }
  return count;
};

MapShaper.getInnerThresholds = function(arr, skip) {
  var nth = skip || 1,
      count = MapShaper.countInnerPoints(arr, skip),
      tmp = new Float64Array(count),
      idx = 0;
  for (i=0, n=arr.length; i<n; i++) {
    var thresholds = arr[i];
    for (var j=1, lim=thresholds.length - 1; j < lim; j+= nth) {
      tmp[idx++] = thresholds[j];
    }
  }
  if (idx != count) error("Counting error");
  return tmp;
};


MapShaper.protectRingsFromCollapse = function(thresholds, lockCounts) {
  var n;
  for (var i=0, len=thresholds.length; i<len; i++) {
    n = lockCounts[i];
    if (n > 0) {
      MapShaper.lockMaxThresholds(thresholds[i], n);
    }
  }
};

// Protect polar coordinates and coordinates at the prime meridian from
// being removed before other points in a path.
// Assume: coordinates are in decimal degrees
//
MapShaper.protectWorldEdges = function(arcs, thresholds, bounds) {
  Utils.forEach(arcs, function(arc, i) {
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

    if (containsBounds([l, b, r, t], bounds) == false) return; // content doesn't reach edges

    for (var i=0, n=zz.length; i<n; i++) {
      maxZ = 0;
      x = xx[i];
      y = yy[i];
      if (x > r || x < l || y < b || y > t) {
        if (maxZ == 0) {
          maxZ = MapShaper.findMaxThreshold(zz);
        }
        if (zz[i] !== Infinity) { // don't override lock value
          zz[i] = maxZ;
        }
      }
    }
  })
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
        maxVal = z
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
}

// Apply a simplification function to each arc in an array, return simplified arcs.
//
// @simplify: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifyArcs = function(arcs, simplify, opts) {
  T.start();
  var arcs;
  if (opts && opts.spherical) {
    arcs = MapShaper.simplifyArcsSph(arcs, simplify);
  } else {
    arcs = Utils.map(arcs, function(arc) {
      return simplify(arc[0], arc[1]);
    });
  }
  T.stop("Calculate simplification data");
  return arcs
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