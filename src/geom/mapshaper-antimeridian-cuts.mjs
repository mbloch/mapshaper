import { stop, debug, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { R2D, D2R } from '../geom/mapshaper-basic-geom';
import {
  samePoint,
  lastEl,
  isClosedPath,
  isEdgePoint,
  isEdgeSegment,
  touchesEdge
} from '../paths/mapshaper-coordinate-utils';

// Remove segments that belong solely to cut points
// TODO: verify that antimeridian crosses have matching y coords
// TODO: stitch together split-apart polygons ?
//
export function removeCutSegments(coords) {
  if (!touchesEdge(coords)) return coords;
  var coords2 = [];
  var a, b, c, x, y;
  var skipped = false;
  coords.pop(); // remove duplicate point
  a = coords[coords.length-1];
  b = coords[0];
  for (var ci=1, n=coords.length; ci <= n; ci++) {
    c = ci == n ? coords2[0] : coords[ci];
    if (!c) continue; // undefined c could occur in a defective path
    if ((skipped || isEdgeSegment(a, b)) && isEdgeSegment(b, c)) {
      // skip b
      // console.log("skipping b:", ci, a, b, c)
      skipped = true;
    } else {
      if (skipped === true) {
        skipped = false;
      }
      coords2.push(b);
      a = b;
    }
    b = c;
  }
  if (coords2.length > 0) {
    coords2.push(coords2[0].concat()); // close the path
  }
  // TODO: handle runs that are split at the array boundary
  return coords2;
}


export function removePolylineCrosses(path) {
  return splitPathAtAntimeridian(path);
}

function isAntimeridianPoint(p) {
  // return p[0] <= L || p[0] >= R;
  return p[0] == -180 || p[0] == 180;
}

// Removes antimeridian crossings from an array of polygon rings
// TODO: handle edge case: segment is collinear with antimeridian
// TODO: handle edge case: path coordinates exceed the standard lat-long range
//
// rings: array of rings of [x,y] points.
// Returns array of split-apart rings
export function removePolygonCrosses(rings) {
  var rings2 = [];
  var splitRings = [];
  var ring;
  for (var i=0; i<rings.length; i++) {
    ring = rings[i];
    if (!isClosedPath(ring)) {
      error('Received an open path');
    }
    if (countCrosses(ring) === 0) {
      rings2.push(ring);
    } else {
      splitRings = splitRings.concat(splitPathAtAntimeridian(ring));
    }
  }
  if (splitRings.length > 0) {
    rings2 = rings2.concat(reconnectSplitParts(splitRings));
  }
  return rings2;
}

// Stitch an array of split-apart paths into coordinate rings
// Assumes that the first and last point of each split-apart path is 180 or -180
// parts: array of paths that have been split at the antimeridian
export function reconnectSplitParts(parts) {
  var yy = getSortedIntersections(parts);
  var rings = [];
  var usedParts = [];
  var errors = 0;
  parts.forEach(function(part, i) {
    if (usedParts[i]) return;
    if (!isValidSplitPart(part)) {
      error('Geometry error');
    }
    var ring = addPartToRing(part, []);
    if (ring) {
      if (!isClosedPath(ring)) {
        error('Generated an open ring');
      }
      rings.push(ring);
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

function addSubPath(paths, path) {
  if (path.length > 1) paths.push(path);
}

function isValidSplitPart(part) {
  var lastX = lastEl(part)[0];
  var firstX = part[0][0];
  return (lastX == 180 || lastX == -180) && (firstX == 180 || firstX == -180);
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

export function countCrosses(path) {
  var c = 0, pp, p;
  for (var i=0, n=path.length; i<n; i++) {
    p = path[i];
    if (i>0 && Math.abs(pp[0] - p[0]) > 180) {
      c++;
    }
    pp = p;
  }
  return c;
}

export function splitPathAtAntimeridian(path) {
  var parts = [];
  var part = [];
  var firstPoint = path[0];
  var lastPoint = lastEl(path);
  var closed = samePoint(firstPoint, lastPoint);
  var p, pp, y, y2;
  for (var i=0, n=path.length; i<n; i++) {
    p = path[i];
    if (i>0 && segmentCrossesAntimeridian(pp, p)) {
      // y = sphericalIntercept(pp, p);
      y = planarIntercept(pp, p);
      addIntersectionPoint(part, pp, y);
      addSubPath(parts, part);
      part = [];
      addIntersectionPoint(part, p, y);
      // console.log(y, y2)
    }
    part.push(p);
    pp = p;
  }
  addSubPath(parts, part);

  // join first and last parts of a split-apart ring, so that the first part
  // originates at the antimeridian
  if (closed && parts.length > 1 && !isAntimeridianPoint(firstPoint)) {
    part = parts.pop();
    part.pop(); // remove duplicate point
    parts[0] = part.concat(parts[0]);
  }
  return parts;
}

export function segmentCrossesAntimeridian(a, b) {
  return Math.abs(a[0] - b[0]) > 180;
}

export function getSortedIntersections(parts) {
  var values = parts.map(function(p) {
    return p[0][1];
  });
  return utils.genericSort(values, true);
}


function addIntersectionPoint(part, p, yint) {
  var xint = p[0] < 0 ? -180 : 180;
  if (!isAntimeridianPoint(p)) { // don't a point if p is already on the antimeridian
    part.push([xint, yint]);
  }
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
  // avoid fp rounding error if a point is on antimeridian
  if (dx1 === 0) return p1[1];
  if (dx2 === 0) return p2[1];
  return (dx2 * p1[1] + dx1 * p2[1]) / (dx1 + dx2);
}

// From: https://github.com/d3/d3-geo/blob/master/src/clip/antimeridian.js
function sphericalIntercept(p1, p2) {
  var lam1 = p1[0] * D2R,
      phi1 = p1[1] * D2R,
      lam2 = p2[0] * D2R,
      phi2 = p2[1] * D2R,
      sinLam1Lam2 = Math.sin(lam1 - lam2),
      cosPhi2 = Math.cos(phi2),
      cosPhi1 = Math.cos(phi1),
      phi;
  if (Math.abs(sinLam1Lam2) > 1e-6) {
    phi = Math.atan((Math.sin(phi1) * cosPhi2 * Math.sin(lam2) -
      Math.sin(phi2) * cosPhi1) * Math.sin(lam1)) / (cosPhi1 * cosPhi2 * sinLam1Lam2);
  } else {
    phi = (phi1 + phi2) / 2;
  }
  return phi * R2D;
}
