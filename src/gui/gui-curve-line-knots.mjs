// The knots of curves drawn with the curve tool (gui-curve-lines.mjs).
//
// A curve is stored as an ordinary line. The knots it was fitted through are
// not in the data, and nothing outside the tool knows about them: the tool
// keeps them here while it is open, so that a curve can be reshaped by
// dragging its knots, and forgets them when it closes.
//
// Knots are found by geometry rather than by feature id. Each set of knots is
// kept with the path it produced, as read back from the layer, and a line has
// knots only while its path is exactly that path. Ids shift when features are
// deleted, and any command, or undo, can change a line; a line whose path has
// changed has no knots, rather than knots that would reshape it into something
// it no longer is. Undoing a knot drag restores the previous path, and with it
// the previous knots.
//
// Knots are in display coordinates, where the curve is fitted (see
// fitCurveThroughKnots()); paths are in the layer's CRS. A knot is [x, y], or
// [x, y, true] for a corner, where the curve turns sharply rather than
// passing smoothly through the knot. A closed curve's first knot is repeated
// at the end, and the two are corners together.

// The flattening tolerance of a curve, as a fraction of its size. The line is
// the curve's only record once the tool closes, so it is flattened more finely
// than the label tool's guide, which is redrawn from its knots.
var FLATTEN_RATIO = 0.0005;

export function createKnotCache() {
  return {versions: []};
}

// knots: [[x, y], ...] a closed curve repeats its first knot at the end
// coords: the line's path, [[x, y], ...], read back from the layer
export function addKnotVersion(cache, knots, coords) {
  if (!knots || !coords || coords.length < 2) return;
  cache.versions.push({knots: copyPoints(knots), coords: coords});
}

// The knots of the curve whose path is @coords, or null
export function findKnotVersion(cache, coords) {
  if (!coords) return null;
  for (var i = cache.versions.length - 1; i >= 0; i--) {
    if (samePath(cache.versions[i].coords, coords)) {
      return copyPoints(cache.versions[i].knots);
    }
  }
  return null;
}

// The vertices of a line with a single part, or null. A curve is drawn as one
// part, so a line with more than one cannot be a curve's.
export function getLinePathCoords(shp, arcs) {
  var iter, coords;
  if (!shp || shp.length != 1 || !arcs) return null;
  iter = arcs.getShapeIter(shp[0]);
  coords = [];
  while (iter.hasNext()) {
    coords.push([iter.x, iter.y]);
  }
  return coords;
}

// The knots after knot @index is moved to @p, or null if @p is closer than
// @minDistance to another knot, which would leave the fitter a zero-length
// chord. A closed curve's first knot is repeated at the end, and the two move
// together.
export function moveCurveKnot(knots, index, p, minDistance) {
  var n = knots.length;
  var closed = curveKnotsAreClosed(knots);
  var loopLen = closed ? n - 1 : n;
  var i = closed && index == n - 1 ? 0 : index;
  var min2 = minDistance * minDistance;
  var out, dx, dy, j;
  if (!(i >= 0 && i < loopLen)) return null;
  for (j = 0; j < loopLen; j++) {
    if (j == i) continue;
    dx = knots[j][0] - p[0];
    dy = knots[j][1] - p[1];
    if (dx * dx + dy * dy < min2) return null;
  }
  out = copyPoints(knots);
  out[i] = makeKnot(p, knotIsCorner(knots[i]));
  if (closed && i === 0) out[n - 1] = out[0].slice();
  return out;
}

export function makeKnot(p, corner) {
  return corner ? [p[0], p[1], true] : [p[0], p[1]];
}

export function knotIsCorner(knot) {
  return !!knot && knot[2] === true;
}

// The knots after knot @index is switched between a corner and a smooth knot,
// or null for an end of an open curve, which a corner would not change
export function toggleCurveKnotCorner(knots, index) {
  var n = knots.length;
  var closed = curveKnotsAreClosed(knots);
  var i = closed && index == n - 1 ? 0 : index;
  var out;
  if (!(closed ? i >= 0 : i > 0 && i < n - 1)) return null;
  out = copyPoints(knots);
  out[i] = makeKnot(knots[i], !knotIsCorner(knots[i]));
  if (closed && i === 0) out[n - 1] = out[0].slice();
  return out;
}

// The corners argument of fitCurveThroughKnots(), or null if there are none
export function getKnotCorners(knots) {
  var corners = knots.map(knotIsCorner);
  return corners.indexOf(true) > -1 ? corners : null;
}

export function curveKnotsAreClosed(knots) {
  var n = knots ? knots.length : 0;
  return n > 3 && knots[0][0] === knots[n - 1][0] && knots[0][1] === knots[n - 1][1];
}

export function getCurveFlattenTolerance(knots) {
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  var span, i;
  for (i = 0; i < knots.length; i++) {
    if (knots[i][0] < xmin) xmin = knots[i][0];
    if (knots[i][0] > xmax) xmax = knots[i][0];
    if (knots[i][1] < ymin) ymin = knots[i][1];
    if (knots[i][1] > ymax) ymax = knots[i][1];
  }
  span = Math.max(xmax - xmin, ymax - ymin);
  return span > 0 ? span * FLATTEN_RATIO : 0;
}

function samePath(a, b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

function copyPoints(points) {
  return points.map(function(p) { return makeKnot(p, knotIsCorner(p)); });
}
