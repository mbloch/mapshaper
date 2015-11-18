/* @requires
mapshaper-visvalingam
mapshaper-dp
mapshaper-dataset-utils
mapshaper-repair
mapshaper-geom
mapshaper-simplify-info
*/

api.simplify = function(dataset, opts) {
  var arcs = dataset.arcs;
  if (!arcs) stop("[simplify] Missing path data");
  T.start();
  MapShaper.simplifyPaths(arcs, opts);

  if (utils.isNumber(opts.pct)) {
    arcs.setRetainedPct(opts.pct);
  } else if (utils.isNumber(opts.interval)) {
    arcs.setRetainedInterval(opts.interval);
  } else if (opts.resolution) {
    arcs.setRetainedInterval(MapShaper.calcSimplifyInterval(arcs, opts));
  } else {
    stop("[simplify] missing pct, interval or resolution parameter");
  }
  T.stop("Calculate simplification");

  if (opts.keep_shapes) {
    api.keepEveryPolygon(arcs, dataset.layers);
  }

  if (!opts.no_repair) {
    api.findAndRepairIntersections(arcs);
  }

  if (opts.stats) {
    MapShaper.printSimplifyInfo(arcs, opts);
  }
};

MapShaper.useSphericalSimplify = function(arcs, opts) {
  return !opts.cartesian && !arcs.isPlanar();
};

// Calculate simplification thresholds for each vertex of an arc collection
// (modifies @arcs ArcCollection in-place)
MapShaper.simplifyPaths = function(arcs, opts) {
  var use3D = MapShaper.useSphericalSimplify(arcs, opts);
  var method = MapShaper.getSimplifyMethod(opts);
  var simplifyPath = MapShaper.getSimplifyFunction(method, use3D, opts);
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

MapShaper.getSimplifyMethod = function(opts) {
  var m = opts.method;
  if (!m || m == 'weighted' || m == 'visvalingam' && opts.weighting) {
    m =  'weighted_visvalingam';
  }
  return m;
};


MapShaper.getSimplifyFunction = function(method, use3D, opts) {
  var f;
  if (method == 'dp') {
    f = DouglasPeucker.calcArcData;
  } else if (method == 'visvalingam') {
    f = Visvalingam.getEffectiveAreaSimplifier(use3D);
  } else if (method == 'weighted_visvalingam') {
    f = Visvalingam.getWeightedSimplifier(opts, use3D);
  } else {
    stop('[simplify] Unsupported simplify method:', method);
  }
  return f;
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

MapShaper.parseSimplifyResolution = function(raw) {
  var parts, w, h;
  if (utils.isNumber(raw)) {
    w = raw;
    h = raw;
  }
  else if (utils.isString(raw)) {
    parts = raw.split('x');
    w = Number(parts[0]) || 0;
    h = parts.length == 2 ? Number(parts[1]) || 0 : w;
  }
  if (!(w >= 0 && h >= 0 && w + h > 0)) {
    stop("Invalid simplify resolution:", raw);
  }
  return [w, h]; // TODO: validate;
};

MapShaper.calcPlanarInterval = function(xres, yres, width, height) {
  var fitWidth = xres !== 0 && width / height > xres / yres || yres === 0;
  return fitWidth ? width / xres : height / yres;
};

// Calculate a simplification interval for unprojected data, given an output resolution
// (This is approximate, since we don't know how the data will be projected for display)
MapShaper.calcSphericalInterval = function(xres, yres, bounds) {
  // Using length of arc along parallel through center of bbox as content width
  // TODO: consider using great circle instead of parallel arc to calculate width
  //    (doesn't work if width of bbox is greater than 180deg)
  var width = geom.degreesToMeters(bounds.width()) * Math.cos(bounds.centerY() * geom.D2R);
  var height = geom.degreesToMeters(bounds.height());
  return MapShaper.calcPlanarInterval(xres, yres, width, height);
};

MapShaper.calcSimplifyInterval = function(arcs, opts) {
  var res, interval, bounds;
  if (opts.interval) {
    interval = opts.interval;
  } else if (opts.resolution) {
    res = MapShaper.parseSimplifyResolution(opts.resolution);
    bounds = arcs.getBounds();
    if (MapShaper.useSphericalSimplify(arcs, opts)) {
      interval = MapShaper.calcSphericalInterval(res[0], res[1], bounds);
    } else {
      interval = MapShaper.calcPlanarInterval(res[0], res[1], bounds.width(), bounds.height());
    }
    // scale interval to double the resolution (single-pixel resolution creates
    //  visible artefacts)
    interval *= 0.5;
  }
  return interval;
};
