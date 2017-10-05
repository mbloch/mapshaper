/* @requires
mapshaper-visvalingam
mapshaper-dp
mapshaper-dataset-utils
mapshaper-post-simplify-repair
mapshaper-geom
mapshaper-simplify-info
*/

api.simplify = function(dataset, opts) {
  var arcs = dataset.arcs;
  if (!arcs) stop("Missing path data");
  // standardize options
  opts = internal.getStandardSimplifyOpts(dataset, opts);
  // stash simplifcation options (ufsed by gui settings dialog)
  dataset.info = utils.defaults({simplify: opts}, dataset.info);

  internal.simplifyPaths(arcs, opts);

  if (utils.isNonNegNumber(opts.percentage)) {
    arcs.setRetainedPct(utils.parsePercent(opts.percentage));
  } else if (utils.isNonNegNumber(opts.interval)) {
    arcs.setRetainedInterval(opts.interval);
  } else if (opts.resolution) {
    arcs.setRetainedInterval(internal.calcSimplifyInterval(arcs, opts));
  } else {
    stop("Missing a simplification amount");
  }

  if (opts.keep_shapes) {
    api.keepEveryPolygon(arcs, dataset.layers);
  }

  if (!opts.no_repair && arcs.getRetainedInterval() > 0) {
    internal.postSimplifyRepair(arcs);
  }

  if (opts.stats) {
    internal.printSimplifyInfo(arcs, opts);
  }
};

internal.getStandardSimplifyOpts = function(dataset, opts) {
  opts = opts || {};
  return utils.defaults({
    method: internal.getSimplifyMethod(opts),
    spherical: internal.useSphericalSimplify(dataset.arcs, opts)
  }, opts);
};

internal.useSphericalSimplify = function(arcs, opts) {
  return !opts.planar && !arcs.isPlanar();
};

// Calculate simplification thresholds for each vertex of an arc collection
// (modifies @arcs ArcCollection in-place)
internal.simplifyPaths = function(arcs, opts) {
  var simplifyPath = internal.getSimplifyFunction(opts);
  arcs.setThresholds(new Float64Array(arcs.getPointCount())); // Create array to hold simplification data
  if (opts.spherical) {
    internal.simplifyPaths3D(arcs, simplifyPath);
    internal.protectWorldEdges(arcs);
  } else {
    internal.simplifyPaths2D(arcs, simplifyPath);
  }
  if (opts.lock_box) {
    internal.protectContentEdges(arcs);
  }
};

internal.simplifyPaths2D = function(arcs, simplify) {
  arcs.forEach3(function(xx, yy, kk, i) {
    simplify(kk, xx, yy);
  });
};

internal.simplifyPaths3D = function(arcs, simplify) {
  var xbuf = utils.expandoBuffer(Float64Array),
      ybuf = utils.expandoBuffer(Float64Array),
      zbuf = utils.expandoBuffer(Float64Array);
  arcs.forEach3(function(xx, yy, kk, i) {
    var n = xx.length,
        xx2 = xbuf(n),
        yy2 = ybuf(n),
        zz2 = zbuf(n);
    geom.convLngLatToSph(xx, yy, xx2, yy2, zz2);
    simplify(kk, xx2, yy2, zz2);
  });
};

internal.getSimplifyMethod = function(opts) {
  var m = opts.method;
  if (!m || m == 'weighted' || m == 'visvalingam' && opts.weighting) {
    m =  'weighted_visvalingam';
  }
  return m;
};

internal.getSimplifyFunction = function(opts) {
  var f;
  if (opts.method == 'dp') {
    f = DouglasPeucker.calcArcData;
  } else if (opts.method == 'visvalingam') {
    f = Visvalingam.getEffectiveAreaSimplifier(opts.spherical);
  } else if (opts.method == 'weighted_visvalingam') {
    f = Visvalingam.getWeightedSimplifier(opts, opts.spherical);
  } else {
    stop('Unsupported simplify method:', method);
  }
  return f;
};

internal.protectContentEdges = function(arcs) {
  var e = 1e-14;
  var bb = arcs.getBounds();
  bb.padBounds(-e, -e, -e, -e);
  internal.limitSimplificationExtent(arcs, bb.toArray(), true);
};

// @hardLimit
//    true: never remove edge vertices
//    false: never remove before other vertices
internal.limitSimplificationExtent = function(arcs, bb, hardLimit) {
  var arcBounds = arcs.getBounds().toArray();
  // return if content doesn't reach edges
  if (containsBounds(bb, arcBounds) === true) return;
  arcs.forEach3(function(xx, yy, zz) {
    var lockZ = hardLimit ? Infinity : 0,
    x, y;
    for (var i=0, n=zz.length; i<n; i++) {
      x = xx[i];
      y = yy[i];
      if (x >= bb[2] || x <= bb[0] || y <= bb[1] || y >= bb[3]) {
        if (lockZ === 0) {
          lockZ = internal.findMaxThreshold(zz);
        }
        if (zz[i] !== Infinity) { // don't override lock value
          zz[i] = lockZ;
        }
      }
    }
  });
};

// Protect polar coordinates and coordinates at the prime meridian from
// being removed before other points in a path.
// Assume: coordinates are in decimal degrees
//
internal.protectWorldEdges = function(arcs) {
  // Need to handle coords with rounding errors:
  // -179.99999999999994 in test/test_data/ne/ne_110m_admin_0_scale_rank.shp
  // 180.00000000000003 in ne/ne_50m_admin_0_countries.shp
  internal.limitSimplificationExtent(arcs, internal.getWorldBounds(1e-12), false);
};

// Return largest value in an array, ignoring Infinity (lock value)
//
internal.findMaxThreshold = function(zz) {
  var z, maxZ = 0;
  for (var i=0, n=zz.length; i<n; i++) {
    z = zz[i];
    if (z > maxZ && z < Infinity) {
      maxZ = z;
    }
  }
  return maxZ;
};

internal.parseSimplifyResolution = function(raw) {
  var parts, w, h;
  if (utils.isNumber(raw)) {
    w = raw;
    h = raw;
  }
  else if (utils.isString(raw)) {
    parts = raw.split(/[x ,]/);
    w = Number(parts[0]) || 0;
    h = parts.length == 2 ? Number(parts[1]) || 0 : w;
  }
  if (!(w >= 0 && h >= 0 && w + h > 0)) {
    stop("Invalid simplify resolution:", raw);
  }
  return [w, h]; // TODO: validate;
};

internal.calcPlanarInterval = function(xres, yres, width, height) {
  var fitWidth = xres !== 0 && width / height > xres / yres || yres === 0;
  return fitWidth ? width / xres : height / yres;
};

// Calculate a simplification interval for unprojected data, given an output resolution
// (This is approximate, since we don't know how the data will be projected for display)
internal.calcSphericalInterval = function(xres, yres, bounds) {
  // Using length of arc along parallel through center of bbox as content width
  // TODO: consider using great circle instead of parallel arc to calculate width
  //    (doesn't work if width of bbox is greater than 180deg)
  var width = geom.degreesToMeters(bounds.width()) * Math.cos(bounds.centerY() * geom.D2R);
  var height = geom.degreesToMeters(bounds.height());
  return internal.calcPlanarInterval(xres, yres, width, height);
};

internal.calcSimplifyInterval = function(arcs, opts) {
  var res, interval, bounds;
  if (opts.interval) {
    interval = opts.interval;
  } else if (opts.resolution) {
    res = internal.parseSimplifyResolution(opts.resolution);
    bounds = arcs.getBounds();
    if (internal.useSphericalSimplify(arcs, opts)) {
      interval = internal.calcSphericalInterval(res[0], res[1], bounds);
    } else {
      interval = internal.calcPlanarInterval(res[0], res[1], bounds.width(), bounds.height());
    }
    // scale interval to double the resolution (single-pixel resolution creates
    //  visible artefacts)
    interval *= 0.5;
  }
  return interval;
};
