import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';
import { findPolylabelPoint } from './mapshaper-polylabel';
import { simplifyPolygonFast } from '../simplify/mapshaper-simplify-fast';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { verbose } from '../utils/mapshaper-logging';

// Find an interior point for label or symbol placement. The default method
// finds a pole of inaccessibility, then moves toward the centroid while
// retaining at least 90% of the pole's clearance.
export function findAnchorPoint(shp, arcs, opts) {
  var method = opts && opts.method || 'centroid2';
  var p;
  if (method != 'legacy') {
    p = findPolylabelPoint(shp, arcs, opts);
    if (p) return p;
  }
  return findLegacyAnchorPoint(shp, arcs);
}

// Legacy sampled-ray method:
// - get the largest ring of the polygon
// - get an array of x-values distributed along the horizontal extent of the ring
// - for each x:
//     intersect a vertical line with the polygon at x
//     find midpoints of each intersecting segment
// - for each midpoint:
//     adjust point vertically to maximize weighted distance from polygon edge
// - return the adjusted point having the maximum weighted distance from the edge
//
// (distance is weighted to slightly favor points near centroid)
export function findLegacyAnchorPoint(shp, arcs) {
  var maxPath = shp && geom.getMaxPath(shp, arcs),
      pathBounds = maxPath && arcs.getSimpleShapeBounds(maxPath),
      thresh, simple;
  if (!pathBounds || !pathBounds.hasBounds() || pathBounds.area() === 0) {
    return null;
  }
  // Optimization: quickly simplify using a relatively small distance threshold.
  // (testing multiple candidate points can be very slow for large and detailed
  //   polgons; simplification alleviates this)
  // Caveat: In rare cases this could cause poor point placement, e.g. if
  //   simplification causes small holes to be removed.
  thresh = Math.sqrt(pathBounds.area()) * 0.01;
  simple = simplifyPolygonFast(shp, arcs, thresh);
  if (!simple.shape) {
    return null; // collapsed shape
  }
  return findAnchorPoint2(simple.shape, simple.arcs);
}

// Assumes: shp is a polygon with at least one space-enclosing ring
function findAnchorPoint2(shp, arcs) {
  var maxPath = geom.getMaxPath(shp, arcs);
  var pathBounds = arcs.getSimpleShapeBounds(maxPath);
  var centroid = geom.getPathCentroid(maxPath, arcs);
  var weight = getPointWeightingFunction(centroid, pathBounds);
  var area = geom.getPlanarPathArea(maxPath, arcs);
  var hrange, lbound, rbound, focus, htics, hstep, p, p2;

  // Limit test area if shape is simple and squarish
  if (shp.length == 1 && area * 1.2 > pathBounds.area()) {
    htics = 5;
    focus = 0.2;
  } else if (shp.length == 1 && area * 1.7 > pathBounds.area()) {
    htics = 7;
    focus = 0.4;
  } else {
    htics = 11;
    focus = 0.5;
  }
  hrange = pathBounds.width() * focus;
  lbound = centroid.x - hrange / 2;
  rbound = lbound + hrange;
  hstep = hrange / htics;

  // Find a best-fit point
  p = probeForBestAnchorPoint(shp, arcs, lbound, rbound, htics, weight);
  if (!p) {
    verbose("[points inner] failed, falling back to centroid");
   p = centroid;
  } else {
    // Look for even better fit close to best-fit point
    p2 = probeForBestAnchorPoint(shp, arcs, p.x - hstep / 2,
        p.x + hstep / 2, 2, weight);
    // The refinement can come back empty even though the coarse sweep did not,
    // because it samples only two x-values inside a narrow band. On a ring that
    // encloses no real area -- a collapsed sliver that runs out to a point and
    // back along itself, which a polygon buffer readily produces -- a ray at
    // either of those two can enclose no interval at all. The coarse result
    // already in hand stands in that case.
    if (p2 && p2.distance > p.distance) {
      p = p2;
    }
  }
  return p;
}

function getPointWeightingFunction(centroid, pathBounds) {
  // Get a factor for weighting a candidate point
  // Points closer to the centroid are slightly preferred
  var referenceDist = Math.max(pathBounds.width(), pathBounds.height()) / 2;
  return function(x, y) {
    var offset = geom.distance2D(centroid.x, centroid.y, x, y);
    return 1 - Math.min(0.6 * offset / referenceDist, 0.25);
  };
}

function findAnchorPointCandidates(shp, arcs, xx) {
  var ymin = arcs.getBounds().ymin - 1;
  return xx.reduce(function(memo, x) {
    var cands = findHitCandidates(x, ymin, shp, arcs);
    return memo.concat(cands);
  }, []);
}

function probeForBestAnchorPoint(shp, arcs, lbound, rbound, htics, weight) {
  var tics = getInnerTics(lbound, rbound, htics);
  var interval = (rbound - lbound) / htics;
  // Get candidate points, distributed along x-axis
  var candidates = findAnchorPointCandidates(shp, arcs, tics);
  var bestP, adjustedP, candP;

  // Sort candidates so points at the center of longer segments are tried first
  candidates.forEach(function(p) {
    p.interval *= weight(p.x, p.y);
  });
  candidates.sort(function(a, b) {
    return b.interval - a.interval;
  });

  for (var i=0; i<candidates.length; i++) {
    candP = candidates[i];
    // Optimization: Stop searching if weighted half-segment length of remaining
    //   points is less than the weighted edge distance of the best candidate
    if (bestP && bestP.distance > candP.interval) {
      break;
    }
    adjustedP = getAdjustedPoint(candP.x, candP.y, shp, arcs, interval, weight);

    if (!bestP || adjustedP.distance > bestP.distance) {
      bestP = adjustedP;
    }
  }
  return bestP;
}

// [x, y] is a point assumed to be inside a polygon @shp
// Try to move the point farther from the polygon edge
function getAdjustedPoint(x, y, shp, arcs, vstep, weight) {
  var p = {
    x: x,
    y: y,
    distance: geom.getPointToShapeDistance(x, y, shp, arcs) * weight(x, y)
  };
  scanForBetterPoint(p, shp, arcs, vstep, weight); // scan up
  scanForBetterPoint(p, shp, arcs, -vstep, weight); // scan down
  return p;
}

// Ceiling on the vertical scan below, which is otherwise unbounded: the scan
// walks its chord in steps of vstep, so it runs for roughly the shape's height
// over vstep, and nothing constrains that ratio. A tall hairline sliver -- the
// kind a buffer mosaic produces between two nearly-coincident arcs -- makes it
// astronomical.
//
// Truncating is safe rather than free: the scan only replaces p when it finds a
// strictly better point, so stopping early keeps the best point so far, which
// is still inside the polygon -- but on a shape thin enough to need more steps
// than this, that point can differ from the one an unbounded scan would reach
// (measured on a 1.1m x 111km rectangle: same polygon, ~12% less clearance).
// The ceiling does bind on real data -- two of the -clean fixtures reach
// ~180,000 steps here -- yet cutting every scan off at 10,000 left all 744
// buffer fixture cases byte-identical, because the long tail is usually a
// plateau the scan walks without improving on.
var MAX_SCAN_STEPS = 10000;

// Try to find a better-fit point than @p by scanning vertically
// Modify p in-place
function scanForBetterPoint(p, shp, arcs, vstep, weight) {
  var x = p.x,
      y = p.y,
      dmax = p.distance,
      d, y2;

  for (var i = 0; i < MAX_SCAN_STEPS; i++) {
    y2 = y + vstep;
    // Stop when the step cannot move the point at all. vstep is the width of
    // the probe band, and on a shape narrower than the floating-point spacing
    // at its own coordinates that band collapses to nothing (see the
    // refinement probe in findAnchorPoint2), leaving y + vstep === y. Every
    // iteration would then retest the same point forever: a collapsed mosaic
    // tile 20nm wide, at longitude -119, hung here indefinitely rather than
    // merely running slowly.
    if (y2 === y) break;
    y = y2;
    d = geom.getPointToShapeDistance(x, y, shp, arcs) * weight(x, y);
    // overcome vary small local minima
    if (d > dmax * 0.90 && geom.testPointInPolygon(x, y, shp, arcs)) {
      if (d > dmax) {
        p.distance = dmax = d;
        p.y = y;
      }
    } else {
      break;
    }
  }
}

// Return array of points at the midpoint of each line segment formed by the
//   intersection of a vertical ray at [x, y] and a polygon shape
function findHitCandidates(x, y, shp, arcs) {
  var yy = findRayShapeIntersections(x, y, shp, arcs);
  var cands = [], y1, y2, interval;

  // sorting by y-coord organizes y-intercepts into interior segments
  utils.genericSort(yy);
  for (var i=0; i<yy.length; i+=2) {
    y1 = yy[i];
    y2 = yy[i+1];
    interval = (y2 - y1) / 2;
    if (interval > 0) {
      cands.push({
        y: (y1 + y2) / 2,
        x: x,
        interval: interval
      });
    }
  }
  return cands;
}

// Return array of y-intersections between vertical ray with origin at [x, y]
//   and a polygon
function findRayShapeIntersections(x, y, shp, arcs) {
  if (!shp) return [];
  return shp.reduce(function(memo, path) {
    var yy = findRayRingIntersections(x, y, path, arcs);
    return memo.concat(yy);
  }, []);
}

// Return array of y-intersections between vertical ray and a polygon ring
function findRayRingIntersections(x, y, path, arcs) {
  var yints = [];
  forEachSegmentInPath(path, arcs, function(a, b, xx, yy) {
    var result = geom.getRayIntersection(x, y, xx[a], yy[a], xx[b], yy[b]);
    if (result > -Infinity) {
      yints.push(result);
    }
  });
  // Ignore odd number of intersections -- probably caused by a ray that touches
  //   but doesn't cross the ring
  // TODO: improve method to handle edge case with two touches and no crosses.
  if (yints.length % 2 === 1) {
    yints = [];
  }
  return yints;
}

// TODO: find better home + name for this
function getInnerTics(min, max, steps) {
  var range = max - min,
      step = range / (steps + 1),
      arr = [];
  for (var i = 1; i<=steps; i++) {
    arr.push(min + step * i);
  }
  return arr;
}
