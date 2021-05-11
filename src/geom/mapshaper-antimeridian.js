import { stop } from '../utils/mapshaper-logging';
import { getSphericalPathArea2 } from '../geom/mapshaper-polygon-geom';
import { PointIter } from '../paths/mapshaper-shape-iter';

// Removes one or two antimeridian crossings from a circular ring
// TODO: handle more complicated rings, with any number of crosses.
// TODO: handle edge case: segment is collinear with antimeridian
// TODO: handle edge case: a single vertex touches the antimeridian without crossing
// TODO: handle edge case: path coordinates exceed the standard lat-long range
//
// ring: a closed path of [x,y] points. Assumes a space-enclosing ring with CW winding.
// type: 'polygon' or 'polyline'
// Returns MultiPolygon or MultiLineString coordinates array
export function removeAntimeridianCrosses(ring, type) {
  var part = [];
  var parts = [part];
  var p, pp;

  for (var i=0, n=ring.length; i<n; i++) {
    p = ring[i];
    if (i>0 && Math.abs(pp[0] - p[0]) > 180) {
      parts.push(part = []);
    }
    part.push(p);
    pp = p;
  }
  if (type == 'polyline') {
    return dividePolylines(parts);
  }
  if (parts.length == 1) {
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
  if (parts.length == 2) {
    return removeOneCross(parts);
  }
  if (parts.length == 3) {
    return removeTwoCrosses(parts, ringArea(ring));
  }
  stop('Unexpected geometry of an antimeridan-crossing polygon ring.');
}

function ringArea(ring) {
  var iter = new PointIter(ring);
  return getSphericalPathArea2(iter);
}

function dividePolylines(parts) {
  var a, b, x1, x2, y;
  for (var i=1; i<parts.length; i++) {
    a = lastEl(parts[i-1]);
    b = firstEl(parts[i]);
    y = planarIntercept(a, b);
    x1 = a[0] < 0 ? -180 : 180;
    x2 = x1 < 0 ? 180 : -180;
    parts[i-1].push([x1, y]);
    parts[i].unshift([x2, y]);
  }
  if (parts.length > 1) {
    parts[0] = parts.pop().concat(parts[0]);
  }
  return parts;
}

// Ring crosses twice...
// Returns one ring containing both poles or two rings split across
//   the antimeridian and including neither pole.
function removeTwoCrosses(parts, ringArea) {
  var a = lastEl(parts[0]),
      b = firstEl(parts[1]),
      c = lastEl(parts[1]),
      d = firstEl(parts[2]),
      y1 = planarIntercept(a, b),
      y2 = planarIntercept(c, d),
      x1 = a[0] < 0 ? -180 : 180,
      x2 = x1 < 0 ? 180 : -180,
      ring1, ring2, pole1, pole2;
  if (ringArea < 1) {
    ring1 = parts[0].concat([[x1, y1], [x1, y2]], parts[2]);
    ring2 = parts[1].concat([[x2, y2], [x2, y1], b]);
    return [[dedup(ring1)], [dedup(ring2)]];
  }
  if (y1 > y2) {
    pole1 = 90;
    pole2 = -90;
  } else {
    pole1 = -90;
    pole2 = 90;
  }
  ring1 = parts[0].concat(
    [[x1, y1], [x1, pole1], [x2, pole1], [x2, y1]],
    parts[1],
    [[x2, y2], [x2, pole2], [x1, pole2], [x1, y2]],
    parts[2]);
  return [[dedup(ring1)]];
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
  var p1 = lastEl(parts[0]);
  var p2 = firstEl(parts[1]);
  var dx = p2[0] - p1[0]; // pos: crosses antimeridian w->e, neg: e->w
  var y = planarIntercept(p1, p2);
  // if ring crosses w->e, go through n pole
  // (this assumes that ring has CW winding / is not a hole)
  var ypole = dx > 0 ? 90 : -90;
  var coords = dx > 0 ?
    [[-180, y], [-180, ypole], [180, ypole], [180, y]] :
    [[180, y], [180, ypole], [-180, ypole], [-180, y]];
  var ring = parts[0].concat(coords, parts[1]);
  return [[dedup(ring)]]; // multipolygon format
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
