import { convertIntervalParam, convertDistanceParam } from '../geom/mapshaper-units';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { printSimplifyInfo } from '../simplify/mapshaper-simplify-info';
import { postSimplifyRepair } from '../simplify/mapshaper-post-simplify-repair';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import Visvalingam from '../simplify/mapshaper-visvalingam';
import DouglasPeucker from '../simplify/mapshaper-dp';
import { keepEveryPolygon } from '../simplify/mapshaper-keep-shapes';
import { getWorldBounds } from '../geom/mapshaper-latlon';

cmd.simplify = function(dataset, opts) {
  var arcs = dataset.arcs;
  if (!arcs || arcs.size() === 0) return; // removed in v0.4.125: stop("Missing path data");
  opts = getStandardSimplifyOpts(dataset, opts); // standardize options
  simplifyPaths(arcs, opts);

  // calculate and apply simplification interval
  if (opts.percentage || opts.percentage === 0) {
    arcs.setRetainedPct(utils.parsePercent(opts.percentage));
  } else if (opts.interval || opts.interval === 0) {
    arcs.setRetainedInterval(convertSimplifyInterval(opts.interval, dataset, opts));
  } else if (opts.resolution) {
    arcs.setRetainedInterval(convertSimplifyResolution(opts.resolution, arcs, opts));
  } else if (opts.presimplify) {
    return;
  } else {
    stop("Missing a simplification amount");
  }

  finalizeSimplification(dataset, opts);
};

export function finalizeSimplification(dataset, opts) {
  var arcs = dataset.arcs;
  if (opts.keep_shapes) {
    keepEveryPolygon(arcs, dataset.layers);
  }

  if (!opts.no_repair && arcs.getRetainedInterval() > 0) {
    postSimplifyRepair(arcs);
  }

  if (opts.stats) {
    printSimplifyInfo(arcs, opts);
  }

  // stash simplification options (used by gui settings dialog)
  dataset.info = utils.defaults({simplify: opts}, dataset.info);
}

export function getStandardSimplifyOpts(dataset, opts) {
  opts = opts || {};
  return utils.defaults({
    method: getSimplifyMethod(opts),
    spherical: useSphericalSimplify(dataset.arcs, opts)
  }, opts);
}

export function useSphericalSimplify(arcs, opts) {
  return !opts.planar && !arcs.isPlanar();
}

// Calculate simplification thresholds for each vertex of an arc collection
// (modifies @arcs ArcCollection in-place)
export function simplifyPaths(arcs, opts) {
  var simplifyPath = getSimplifyFunction(opts);
  arcs.setThresholds(new Float64Array(arcs.getPointCount())); // Create array to hold simplification data
  if (opts.spherical) {
    simplifyPaths3D(arcs, simplifyPath);
    protectWorldEdges(arcs);
  } else {
    simplifyPaths2D(arcs, simplifyPath);
  }
  if (opts.lock_box) {
    protectContentEdges(arcs);
  }
}

function simplifyPaths2D(arcs, simplify) {
  arcs.forEach3(function(xx, yy, kk, i) {
    simplify(kk, xx, yy);
  });
}

function simplifyPaths3D(arcs, simplify) {
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
}

export function getSimplifyMethod(opts) {
  var m = opts.method;
  if (!m || m == 'weighted' || m == 'visvalingam' && opts.weighting) {
    m =  'weighted_visvalingam';
  }
  return m;
}

function getSimplifyFunction(opts) {
  var f;
  if (opts.method == 'dp') {
    f = DouglasPeucker.calcArcData;
  } else if (opts.method == 'visvalingam') {
    f = Visvalingam.getEffectiveAreaSimplifier(opts.spherical);
  } else if (opts.method == 'weighted_visvalingam') {
    f = Visvalingam.getWeightedSimplifier(opts, opts.spherical);
  } else {
    stop('Unsupported simplify method:', opts.method);
  }
  return f;
}

function protectContentEdges(arcs) {
  var e = 1e-14;
  var bb = arcs.getBounds();
  bb.padBounds(-e, -e, -e, -e);
  limitSimplificationExtent(arcs, bb.toArray(), true);
}

// @hardLimit
//    true: never remove edge vertices
//    false: never remove before other vertices
function limitSimplificationExtent(arcs, bb, hardLimit) {
  var arcBounds = arcs.getBounds().toArray();
  // return if content doesn't reach edges
  if (geom.containsBounds(bb, arcBounds) === true) return;
  arcs.forEach3(function(xx, yy, zz) {
    var lockZ = hardLimit ? Infinity : 0,
    x, y;
    for (var i=0, n=zz.length; i<n; i++) {
      x = xx[i];
      y = yy[i];
      if (x >= bb[2] || x <= bb[0] || y <= bb[1] || y >= bb[3]) {
        if (lockZ === 0) {
          lockZ = findMaxThreshold(zz);
        }
        if (zz[i] !== Infinity) { // don't override lock value
          zz[i] = lockZ;
        }
      }
    }
  });
}

// Protect polar coordinates and coordinates at the prime meridian from
// being removed before other points in a path.
// Assume: coordinates are in decimal degrees
//
export function protectWorldEdges(arcs) {
  // Need to handle coords with rounding errors:
  // -179.99999999999994 in test/data/ne/ne_110m_admin_0_scale_rank.shp
  // 180.00000000000003 in ne/ne_50m_admin_0_countries.shp
  limitSimplificationExtent(arcs, getWorldBounds(1e-12), false);
}

// Return largest value in an array, ignoring Infinity (lock value)
//
function findMaxThreshold(zz) {
  var z, maxZ = 0;
  for (var i=0, n=zz.length; i<n; i++) {
    z = zz[i];
    if (z > maxZ && z < Infinity) {
      maxZ = z;
    }
  }
  return maxZ;
}

export function parseSimplifyResolution(raw) {
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
}

export function calcPlanarInterval(xres, yres, width, height) {
  var fitWidth = xres !== 0 && width / height > xres / yres || yres === 0;
  return fitWidth ? width / xres : height / yres;
}

// Calculate a simplification interval for unprojected data, given an output resolution
// (This is approximate, since we don't know how the data will be projected for display)
export function calcSphericalInterval(xres, yres, bounds) {
  // Using length of arc along parallel through center of bbox as content width
  // TODO: consider using great circle instead of parallel arc to calculate width
  //    (doesn't work if width of bbox is greater than 180deg)
  var width = geom.degreesToMeters(bounds.width()) * Math.cos(bounds.centerY() * geom.D2R);
  var height = geom.degreesToMeters(bounds.height());
  return calcPlanarInterval(xres, yres, width, height);
}

export function convertSimplifyInterval(param, dataset, opts) {
  var crs = getDatasetCRS(dataset);
  var interval;
  if (useSphericalSimplify(dataset.arcs, opts)) {
    interval = convertDistanceParam(param, crs);
  } else {
    interval = convertIntervalParam(param, crs);
  }
  return interval;
}

// convert resolution to an interval
export function convertSimplifyResolution(param, arcs, opts) {
  var res = parseSimplifyResolution(param);
  var bounds = arcs.getBounds();
  var interval;
  if (useSphericalSimplify(arcs, opts)) {
    interval = calcSphericalInterval(res[0], res[1], bounds);
  } else {
    interval = calcPlanarInterval(res[0], res[1], bounds.width(), bounds.height());
  }
  // scale interval to double the resolution (single-pixel resolution creates
  //  visible artifacts)
  interval *= 0.5;
  return interval;
}
