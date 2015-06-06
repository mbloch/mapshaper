/* @requires
mapshaper-visvalingam
mapshaper-dp
mapshaper-dataset-utils
mapshaper-repair
mapshaper-geom
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

// Calculate simplification thresholds for each vertex of an arc collection
// (modifies @arcs ArcCollection in-place)
MapShaper.simplifyPaths = function(arcs, opts) {
  var use3D = !opts.cartesian && !arcs.isPlanar();
  var simplifyPath = MapShaper.getSimplifyFunction(opts.method || 'mapshaper', use3D);
  arcs.setThresholds(new Float64Array(arcs.getPointCount())); // Create array to hold simplification data
  if (use3D) {
    MapShaper.simplifyPaths3D(arcs, simplifyPath);
    MapShaper.protectWorldEdges(arcs);
  } else {
    MapShaper.simplifyPaths2D(arcs, simplifyPath);
  }
};

MapShaper.simplifyPaths2D = function(arcs, simplify) {
  arcs.forEach3(function(xx, yy, kk, i) {
    simplify(kk, xx, yy);
  });
};

MapShaper.simplifyPaths3D = function(arcs, simplify) {
  var xbuf = MapShaper.expandoBuffer(Float64Array),
      ybuf = MapShaper.expandoBuffer(Float64Array),
      zbuf = MapShaper.expandoBuffer(Float64Array);
  arcs.forEach3(function(xx, yy, kk, i) {
    var n = xx.length,
        xx2 = xbuf(n),
        yy2 = ybuf(n),
        zz2 = zbuf(n);
    geom.convLngLatToSph(xx, yy, xx2, yy2, zz2);
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
MapShaper.protectWorldEdges = function(arcs) {
  // Need to handle coords with rounding errors:
  // -179.99999999999994 in test/test_data/ne/ne_110m_admin_0_scale_rank.shp
  // 180.00000000000003 in ne/ne_50m_admin_0_countries.shp
  var bb1 = MapShaper.getWorldBounds(1e-12),
      bb2 = arcs.getBounds().toArray();
  if (containsBounds(bb1, bb2) === true) return; // return if content doesn't reach edges
  arcs.forEach3(function(xx, yy, zz) {
    var maxZ = 0,
    x, y;
    for (var i=0, n=zz.length; i<n; i++) {
      x = xx[i];
      y = yy[i];
      if (x > bb1[2] || x < bb1[0] || y < bb1[1] || y > bb1[3]) {
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
