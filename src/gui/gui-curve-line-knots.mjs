// The knots of curves drawn with the curve tool (gui-curve-lines.mjs).
//
// A curve is stored as an ordinary line. The knots it was fitted through are
// not in the data, and nothing outside the tool knows about them: the tool
// keeps them here, for as long as the page is open, so that a curve can be
// reshaped by dragging its knots, including after the tool has been closed
// and opened again.
//
// Knots are found by geometry rather than by feature id. Each set of knots is
// kept with the path it produced, as read back from the layer, and a line has
// knots only while its path is exactly that path. Ids shift when features are
// deleted, and any command, or undo, can change a line; a line whose path has
// changed has no knots, rather than knots that would reshape it into something
// it no longer is. Undoing a knot drag restores the previous path, and with it
// the previous knots.
//
// The curve is fitted in display coordinates (see fitCurveThroughKnots()),
// but the cache keeps knots and paths in the layer's CRS, so that they stay
// where they belong when the display projection changes; the tool converts
// knots on the way in and out. A knot is [x, y], or [x, y, true] for a
// corner, where the curve turns sharply rather than passing smoothly through
// the knot. A closed curve's first knot is repeated at the end, and the two
// are corners together.

// The flattening tolerance of a curve, as a fraction of its size. The line is
// the curve's only record once the tool closes, so it is flattened more finely
// than the label tool's guide, which is redrawn from its knots.
var FLATTEN_RATIO = 0.0005;

// The oldest versions are dropped beyond this many. A curve flattens to about
// ten vertices per knot, kept as 16 bytes each, so a version of a ten-knot
// curve takes about 2.5 KB, knots included.
var MAX_KNOT_VERSIONS = 500;

export function createKnotCache() {
  return {versions: []};
}

// knots: [[x, y], ...] a closed curve repeats its first knot at the end
// coords: the line's path, [[x, y], ...], read back from the layer
export function addKnotVersion(cache, knots, coords) {
  var path;
  if (!knots || !coords || coords.length < 2) return;
  path = packPath(coords);
  // a path that was drawn before, e.g. by toggling a corner twice, is kept
  // once, with its newest knots
  cache.versions = cache.versions.filter(function(v) { return !samePath(v.path, coords); });
  cache.versions.push({knots: copyPoints(knots), path: path});
  if (cache.versions.length > MAX_KNOT_VERSIONS) {
    cache.versions.splice(0, cache.versions.length - MAX_KNOT_VERSIONS);
  }
}

// The knots of the curve whose path is @coords, or null
export function findKnotVersion(cache, coords) {
  if (!coords) return null;
  for (var i = cache.versions.length - 1; i >= 0; i--) {
    if (samePath(cache.versions[i].path, coords)) {
      return copyPoints(cache.versions[i].knots);
    }
  }
  return null;
}

export function getKnotVersionCount(cache) {
  return cache.versions.length;
}

function packPath(coords) {
  var path = new Float64Array(coords.length * 2);
  for (var i = 0; i < coords.length; i++) {
    path[i * 2] = coords[i][0];
    path[i * 2 + 1] = coords[i][1];
  }
  return path;
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

// Index of the end knot of an open curve nearest @p within @threshold (0 or
// the last index), or -1. A closed curve has no ends.
export function findCurveEndNear(knots, p, threshold) {
  var n = knots ? knots.length : 0;
  var d0, d1;
  if (n < 2 || !p || curveKnotsAreClosed(knots)) return -1;
  d0 = Math.hypot(knots[0][0] - p[0], knots[0][1] - p[1]);
  d1 = Math.hypot(knots[n - 1][0] - p[0], knots[n - 1][1] - p[1]);
  if (d1 <= d0 && d1 <= threshold) return n - 1;
  return d0 <= threshold ? 0 : -1;
}

export function knotIsCurveEnd(knots, index) {
  return !curveKnotsAreClosed(knots) && (index === 0 || index == knots.length - 1);
}

// The knots in the opposite order, which fit the same curve drawn the other
// way. A curve is extended from its last knot, so a curve extended from its
// first knot is reversed while it is extended, and reversed back after.
export function reverseCurveKnots(knots) {
  return copyPoints(knots).reverse();
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

// path: a packed path (see packPath()); coords: [[x, y], ...]
function samePath(path, coords) {
  if (path.length != coords.length * 2) return false;
  for (var i = 0; i < coords.length; i++) {
    if (path[i * 2] !== coords[i][0] || path[i * 2 + 1] !== coords[i][1]) return false;
  }
  return true;
}

function copyPoints(points) {
  return points.map(function(p) { return makeKnot(p, knotIsCorner(p)); });
}
