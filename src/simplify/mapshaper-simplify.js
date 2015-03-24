/* @requires
mapshaper-visvalingam
mapshaper-dp
mapshaper-dataset-utils
mapshaper-repair
*/

api.simplify = function(arcs, opts) {
  if (!arcs) stop("[simplify] Missing path data");
  T.start();
  MapShaper.simplifyPaths(arcs, opts);

  if (utils.isNumber(opts.pct)) {
    arcs.setRetainedPct(opts.pct);
  } else if (utils.isNumber(opts.interval)) {
    arcs.setRetainedInterval(opts.interval);
  } else {
    stop("[simplify] missing pct or interval parameter");
  }
  T.stop("Calculate simplification");

  if (!opts.no_repair) {
    var info = api.findAndRepairIntersections(arcs);
    cli.printRepairMessage(info);
  }
};

// @paths ArcCollection object
MapShaper.simplifyPaths = function(paths, opts) {
  var use3D = !opts.cartesian && MapShaper.probablyDecimalDegreeBounds(paths.getBounds());
  var simplifyPath = MapShaper.getSimplifyFunction(opts.method || 'mapshaper', use3D);
  paths.setThresholds(new Float64Array(paths.getPointCount())); // Create array to hold simplification data
  if (use3D) {
    MapShaper.simplifyPaths3D(paths, simplifyPath);
    MapShaper.protectWorldEdges(paths);
  } else {
    MapShaper.simplifyPaths2D(paths, simplifyPath);
  }
};

MapShaper.simplifyPaths2D = function(paths, simplify) {
  paths.forEach3(function(xx, yy, kk, i) {
    simplify(kk, xx, yy);
  });
};

MapShaper.simplifyPaths3D = function(paths, simplify) {
  var xbuf = MapShaper.expandoBuffer(Float64Array),
      ybuf = MapShaper.expandoBuffer(Float64Array),
      zbuf = MapShaper.expandoBuffer(Float64Array);
  paths.forEach3(function(xx, yy, kk, i) {
    var n = xx.length,
        xx2 = xbuf(n),
        yy2 = ybuf(n),
        zz2 = zbuf(n);
    MapShaper.convLngLatToSph(xx, yy, xx2, yy2, zz2);
    simplify(kk, xx2, yy2, zz2);
  });
};

MapShaper.getSimplifyFunction = function(method, use3D) {
  if (method == 'dp') {
    return DouglasPeucker.calcArcData;
  } else { // assuming Visvalingam simplification
    return Visvalingam.getPathSimplifier(method, use3D);
  }
};

// Protect polar coordinates and coordinates at the prime meridian from
// being removed before other points in a path.
// Assume: coordinates are in decimal degrees
//
MapShaper.protectWorldEdges = function(paths) {
  // Need to handle coords with rounding errors:
  // -179.99999999999994 in test/test_data/ne/ne_110m_admin_0_scale_rank.shp
  // 180.00000000000003 in ne/ne_50m_admin_0_countries.shp
  var err = 1e-12,
      l = -180 + err,
      r = 180 - err,
      t = 90 - err,
      b = -90 + err;

  // return if content doesn't reach edges
  var bounds = paths.getBounds().toArray();
  if (containsBounds([l, b, r, t], bounds) === true) return;

  paths.forEach3(function(xx, yy, zz) {
    var maxZ = 0,
    x, y;
    for (var i=0, n=zz.length; i<n; i++) {
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
