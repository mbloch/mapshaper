import { stop, debug } from '../utils/mapshaper-logging';
import { getSphericalPathArea2 } from '../geom/mapshaper-polygon-geom';
import { PointIter } from '../paths/mapshaper-shape-iter';
import utils from '../utils/mapshaper-utils';
import { getStateVar } from '../mapshaper-state';

// Removes one or two antimeridian crossings from a circular ring
// TODO: handle edge case: segment is collinear with antimeridian
// TODO: handle edge case: path coordinates exceed the standard lat-long range
//
// path: a path of [x,y] points.
// type: 'polygon' or 'polyline'
// 'polygon' Assumes a closed ring with CCW winding for holes
// Returns MultiPolygon or MultiLineString coordinates array
export function removeAntimeridianCrosses(path, type, isHole) {
  var parts = splitPathAtAntimeridian(path);

  if (type == 'polyline') {
    return parts; // MultiLineString coords
  }

  // case: polygon does not intersect the antimeridian
  if (parts.length == 1 && !isAntimeridanPoint(parts[0][0])) {
    // TODO: the area test should not be needed when processing small circles
    // (could affect performance when buffering many points)
    if (ringArea(path) < 0 && !isHole) {
      // negative area: CCW ring, indicating a circle of >180 degrees
      //   that fully encloses both poles and the antimeridian.
      // need to add an enclosure around the entire sphere
      parts = [[[180, 90], [180, -90], [0, -90], [-180, -90], [-180, 90], [0, 90], [180, 90]], parts[0]];
    }
    return [parts];
  }

  // Now we can assume that the first and last point of the split-apart path is 180 or -180
  return reconnectSplitParts(parts);
}

function addSubPath(paths, path) {
  if (path.length > 1) paths.push(path);
}

export function reconnectSplitParts(parts) {
  var yy = getSortedIntersections(parts);
  var rings = [];
  var usedParts = [];
  var errors = 0;
  parts.forEach(function(part, i) {
    if (usedParts[i]) return;
    var ring = addPartToRing(part, []);
    if (ring) {
      rings.push([ring]); // multipolygon coords
    } else {
      errors++;
    }
  });

  return rings;

  function addPartToRing(part, ring) {
    var lastPoint = lastEl(part);
    var i = parts.indexOf(part);
    if (usedParts[i]) {
      debug('Tried to use a previously used path');
      return null;
    }
    usedParts[i] = true;
    ring = ring.concat(part);
    var nextPoint = findNextPoint(parts, lastPoint, yy);
    if (!nextPoint) {
      return null;
    }
    if (lastPoint[0] != nextPoint[0]) {
      // add polar line to switch from east to west or west to east
      // coming from east -> turn south
      // coming from west -> turn north
      var poleY = lastPoint[0] == 180 ? -90 : 90;
      // need a center point (lines longer than 90 degrees cause confusion when rotating)
      ring.push([lastPoint[0], poleY], [0, poleY], [nextPoint[0], poleY]);
    }
    var nextPart = findPartStartingAt(parts, nextPoint);
    if (!nextPart) {
      return null;
    }
    if (samePoint(ring[0], nextPart[0])) {
      // done!
      ring.push(ring[0]); // close the ring
      return ring;
    }
    return addPartToRing(nextPart, ring);
  }
}

// p: last point of previous part
function findNextPoint(parts, p, yy) {
  var x = p[0];
  var y = p[1];
  var i = yy.indexOf(y);
  var xOpp = x == -180 ? 180 : -180;
  var turnSouth = x == 180; // intersecting from the east -> turn south
  var iNext = turnSouth ? i - 1 : i + 1;
  var nextPoint;
  if (x != 180 && x != -180) {
    debug('Unexpected error');
    return null;
  }
  if (i == -1) {
    debug('Point missing from intersection table:', p);
    return null;
  }
  if (iNext < 0 || iNext >= yy.length) {
    // no path to traverse to along the antimeridian --
    // assume the path surrounds one of the poles
    // enclose south pole
    nextPoint = [xOpp, y];
  } else {
    nextPoint = [x, yy[iNext]];
  }
  return nextPoint;
}

function findPartStartingAt(parts, firstPoint) {
  for (var i=0; i<parts.length; i++) {
    if (samePoint(parts[i][0], firstPoint)) {
      return parts[i];
    }
  }
  return null;
}

export function splitPathAtAntimeridian(path) {
  var parts = [];
  var part = [];
  var firstPoint = path[0];
  var lastPoint = lastEl(path);
  var closed = samePoint(firstPoint, lastPoint);
  var p, pp, y;
  for (var i=0, n=path.length; i<n; i++) {
    p = path[i];
    if (i>0 && Math.abs(pp[0] - p[0]) > 180) {
      y = planarIntercept(pp, p);
      addIntersectionPoint(part, pp, y);
      addSubPath(parts, part);
      part = [];
      addIntersectionPoint(part, p, y);
    }
    part.push(p);
    pp = p;
  }
  addSubPath(parts, part);

  // join first and last parts of a split-apart ring, so that the first part
  // originates at the antimeridian
  if (closed && parts.length > 1 && !isAntimeridanPoint(firstPoint)) {
    part = parts.pop();
    part.pop(); // remove duplicate point
    parts[0] = part.concat(parts[0]);
  }
  return parts;
}

export function getSortedIntersections(parts) {
  var values = parts.map(function(p) {
    return p[0][1];
  });
  return utils.genericSort(values, true);
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function isAntimeridanPoint(p) {
  return p[0] == 180 || p[0] == -180;
}

function addIntersectionPoint(part, p, yint) {
  var xint = p[0] < 0 ? -180 : 180;
  if (!isAntimeridanPoint(p)) { // don't a point if p is already on the antimeridian
    part.push([xint, yint]);
  }
}

function ringArea(ring) {
  var iter = new PointIter(ring);
  return getSphericalPathArea2(iter);
}

// duplicate points occur if a vertex is on the antimeridan
function dedup(ring) {
  return ring.reduce(function(memo, p, i) {
    var pp = memo.length > 0 ? memo[memo.length-1] : null;
    if (!pp || pp[0] != p[0] || pp[1] != p[1]) memo.push(p);
    return memo;
  }, []);
}

function lastEl(arr) {
  return arr[arr.length - 1];
}

// p1, p2: two vertices on different sides of the antimeridian
// Returns y-intercept of the segment connecting p1, p2
// TODO: consider using the great-circle intersection, instead of
// the planar intersection.
// (Planar should be fine if p1 and p2 are close to lon. 180)
function planarIntercept(p1, p2) {
  var dx = p2[0] - p1[0]; // pos: crosses antimeridian w->e, neg: e->w
  var dx1, dx2;
  if (dx > 0) {
    dx1 = p1[0] + 180;
    dx2 = 180 - p2[0];
  } else {
    dx1 = 180 - p1[0];
    dx2 = p2[0] + 180;
  }
  return (dx2 * p1[1] + dx1 * p2[1]) / (dx1 + dx2);
}
