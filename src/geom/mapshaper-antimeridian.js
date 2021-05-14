import { stop } from '../utils/mapshaper-logging';
import { getSphericalPathArea2 } from '../geom/mapshaper-polygon-geom';
import { PointIter } from '../paths/mapshaper-shape-iter';
import utils from '../utils/mapshaper-utils';

// Removes one or two antimeridian crossings from a circular ring
// TODO: handle more complicated rings, with any number of crosses.
// TODO: handle edge case: segment is collinear with antimeridian
// TODO: handle edge case: a single vertex touches the antimeridian without crossing
// TODO: handle edge case: path coordinates exceed the standard lat-long range
//
// ring: a path of [x,y] points.
// type: 'polygon' or 'polyline'
// 'polygon' Assumes a space-enclosing ring with CW winding.
// Returns MultiPolygon or MultiLineString coordinates array
export function removeAntimeridianCrosses(ring, type) {
  var parts = splitPathAtAntimeridian(ring);

  if (type == 'polyline') {
    return parts; // MultiLineString coords
  }

  // case: polygon does not intersect the antimeridian
  if (parts.length == 1 && !isAntimeridanPoint(parts[0][0])) {
    // TODO: this test should not be needed when processing small circles
    // (could affect performance when buffering many points)
    if (ringArea(ring) < 0) {
      // negative area: CCW ring, indicating a circle of >180 degrees
      //   that fully encloses both poles and the antimeridian.
      // need to add an enclosure around the entire sphere
      parts = [[[180, 90], [180, -90], [-180, -90], [-180, 90], [180, 90]], parts[0]];
    }
    return [parts];
  }

  // Now we can assume that the first and last point of the split-apart path is 180 or -180
  if (parts.length == 1) {
    return removeOneCross(parts);
  }
  if (parts.length == 2) {
    return removeTwoCrosses(parts, ringArea(ring));
  }
  stop('Unexpected geometry of an antimeridan-crossing polygon ring.');
}

function addSubPath(paths, path) {
  if (path.length > 1) paths.push(path);
}

export function reconnectSplitParts(parts) {
  var yy = getSortedIntersections(parts);

}

export function splitPathAtAntimeridian(path) {
  var parts = [];
  var part = [];
  var firstPoint = firstEl(path);
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

// Ring crosses twice...
// Returns one ring containing both poles or two rings split across
//   the antimeridian and including neither pole.
function removeTwoCrosses(parts, ringArea) {
  var a = lastEl(parts[0]),
      b = firstEl(parts[1]),
      c = lastEl(parts[1]),
      d = firstEl(parts[0]),
      y1 = a[1],
      y2 = c[1],
      x1 = a[0],
      x2 = b[0],
      ring, pole1, pole2;
  if (ringArea < 0) {
    parts[0].push(d);
    parts[1].push(b);
    return [[parts[0]], [parts[1]]];
  }
  if (y1 > y2) {
    pole1 = 90;
    pole2 = -90;
  } else {
    pole1 = -90;
    pole2 = 90;
  }
  ring = parts[0].concat(
    [[x1, pole1], [x2, pole1]], parts[1], [[x2, pole2], [x1, pole2], d]);
  return [[dedup(ring)]];
}

// duplicate points occur if a vertex is on the antimeridan
function dedup(ring) {
  return ring.reduce(function(memo, p, i) {
    var pp = memo.length > 0 ? memo[memo.length-1] : null;
    if (!pp || pp[0] != p[0] || pp[1] != p[1]) memo.push(p);
    return memo;
  }, []);
}

// Ring contains a pole.
// Returns one ring including n or s pole line.
function removeOneCross(parts) {
  var ring = parts[0];
  var lastX = lastEl(ring)[0];
  var firstX = firstEl(ring)[0];
  // lastX === -180: crosses antimeridian w->e, 180: e->w
  // if ring crosses w->e, go through n pole
  // (this assumes that ring has CW winding / is not a hole)
  var poleY = lastX === -180 ? 90 : -90;
  ring.push([lastX, poleY], [firstX, poleY], ring[0]);
  return [[ring]]; // multipolygon format
}

function lastEl(arr) {
  return arr[arr.length - 1];
}

function firstEl(arr) {
  return arr[0];
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
