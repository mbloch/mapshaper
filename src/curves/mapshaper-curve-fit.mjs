import { pointSegDistSq2, distance2D } from '../geom/mapshaper-basic-geom';

// Fits an interpolating spline through a sequence of knots and flattens it to
// a polyline. Used to derive a label path from the knots stored as a label's
// multipoint geometry (see docs/development/label-tool-design.md).
//
// The curve passes through every knot -- knots are not Bezier handles. This is
// the behavior of Illustrator's Curvature tool, and it is what lets a curve be
// re-edited by moving the points the user originally clicked.
//
// The fit is Hobby's algorithm: John Hobby, "Smooth, Easy to Compute
// Interpolating Splines", Stanford CS-TR-85-1047 (1985) / Discrete &
// Computational Geometry 1 (1986). It is the spline Metafont, MetaPost and
// TikZ draw, chosen here because it was designed for the aesthetics of the
// result rather than for analytic tidiness.
//
// Hobby picks a tangent direction at each knot such that "mock curvature" -- a
// first-order approximation of curvature that keeps the system linear -- is
// equal on both sides of the knot. The curve is therefore near enough to
// curvature-continuous to look it, where an earlier centripetal Catmull-Rom
// fit here was only tangent-continuous and visibly kinked at every knot: its
// curvature jumped by 55% to 220% of the curve's mean curvature at each one.
//
// Two properties of the method matter to the label tool. The solve is a single
// tridiagonal system rather than an iteration, so the fit is deterministic and
// the GUI preview and the CLI export cannot drift apart. And the curves are
// invariant under translation, rotation and scaling (Hobby 1986), which is
// what lets the tool fit in display coordinates while storing knots in map
// coordinates.
//
// Left alone, the method bulges: a hard turn followed by a much shorter
// segment throws the long segment into a wide arc, several times the length of
// the short one. Two limits below hold that in, MAX_HANDLE and
// MAX_CHORD_RATIO. Both are inert on a path whose chords are of comparable
// length, so an ordinary label path is fitted exactly as Hobby describes.

// Curl controls how the curve behaves at the two ends of a run. At 0 it
// approaches a straight line there; at 1 (Metafont's default) it approaches a
// circular arc, which on a path that turns hard near its end throws the curve
// into a wide loop beyond the last knot. Label paths are short enough that the
// end segments are most of the curve, so they want a much flatter end than
// Metafont does.
var DEFAULT_CURL = 0.15;
var curl = DEFAULT_CURL;

// Temporary knob for judging the end behavior by eye; see
// window.mapshaper.setLabelCurveCurl() in the GUI. Expected to be retired once
// a default is settled on.
export function setCurveCurl(val) {
  curl = val >= 0 ? +val : DEFAULT_CURL;
  return curl;
}

export function getCurveCurl() {
  return curl;
}

// Cap on subdivision levels per curve segment, bounding output at 2^8 = 256
// vertices per segment if a pathological input (e.g. knots far enough apart to
// exhaust float precision) never satisfies the flatness test.
var MAX_SUBDIVIDE_DEPTH = 8;

// Relative accuracy of the arc-length estimate, and a matching depth cap. The
// bracket between a cubic's chord and its control polygon narrows by roughly a
// factor of four per subdivision, so this converges in well under ten levels.
var LENGTH_TOLERANCE = 1e-5;
var MAX_LENGTH_DEPTH = 16;

// knots: array of [x, y] in a single coordinate space
// tolerance: max deviation of the output polyline from the true curve, in the
//   same units as the knots
// Returns an array of [x, y] starting at the first knot, ending at the last,
//   and passing through every knot in between.
export function fitCurveThroughKnots(knots, tolerance) {
  var pts = dedupeKnots(knots || []),
      segments, out, i;
  if (pts.length < 2) return pts;
  if (tolerance > 0 === false) {
    // with no usable tolerance there is nothing to flatten against; the knots
    // are the curve at its coarsest
    return pts;
  }
  segments = fitRun(pts);
  out = [pts[0].slice()];
  for (i = 0; i < segments.length; i++) {
    flattenCubic(segments[i].p0, segments[i].c1, segments[i].c2,
      segments[i].p3, tolerance, 0, out);
    out.push([segments[i].p3[0], segments[i].p3[1]]);
  }
  return out;
}

// Returns the curve's control points as cubic Bezier segments, without
// flattening. Kept separate from the flattening so that SVG export can emit
// true curves rather than a densified polyline.
// Returns [{p0, c1, c2, p3}, ...], one per knot interval.
export function getCurveSegments(knots) {
  var pts = dedupeKnots(knots || []);
  if (pts.length < 2) return [];
  return fitRun(pts);
}

// Arc length of the fitted curve, in the same units as the knots. Export uses
// this to decide whether a label's text fits its path, so it is measured on the
// true curve rather than on a flattened approximation of it -- a flattening
// tolerance tight enough to be accurate in output pixels would be meaningless
// if the knots were in degrees or metres, and this estimate is scale-free.
export function getCurveLength(knots) {
  var segments = getCurveSegments(knots);
  var len = 0, i;
  for (i = 0; i < segments.length; i++) {
    len += getCubicLength(segments[i], 0);
  }
  return len;
}

// Hobby's velocity function constants (Hobby 1986, eq. 11), the approximation
// Metafont uses in place of the transcendental form.
var VEL_A = Math.SQRT2,
    VEL_B = 1 / 16,
    VEL_C = (3 - Math.sqrt(5)) / 2;

// Longest a control point may sit from its knot, as a fraction of the chord
// length that handleLimit() works out for it. See "Bulge" in the design doc: a
// hard turn followed by a short segment otherwise throws the long segment into
// a wide arc, which during editing is most of the time, because a short
// segment is what a half-dragged knot leaves behind.
//
// The value is a floor, not a preference. Four points on a circle want 0.3905,
// which is the roundest any sensible path asks for, so a limit just above it
// never touches a curve that was not already misbehaving.
var MAX_HANDLE = 0.4;

// How much longer one chord may be than its neighbour *for the purposes of the
// solve*. Hobby equalizes mock curvature across each knot, and a short chord
// carries a lot of curvature, so without this a short segment dictates a wide
// arc to a long one. Capping the ratio limits how far that reaches without
// moving any knot or touching the curve where the chords are even.
var MAX_CHORD_RATIO = 1.5;

// Fits a run of knots, returning a cubic per interval.
function fitRun(pts) {
  var n = pts.length - 1, // segment count
      dd = [], om = [], psi = [], segments = [],
      theta, phi, i;
  if (n < 1) return [];
  // two knots have no interior knot to bend around
  if (n === 1) return [straightSegment(pts[0], pts[1])];
  for (i = 0; i < n; i++) {
    dd.push(distance2D(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    om.push(Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]));
  }
  // psi[i] is how far the polyline turns at knot i
  psi.push(0);
  for (i = 1; i < n; i++) psi.push(wrapAngle(om[i] - om[i - 1]));

  theta = solveDepartureAngles(evenOutChords(dd, n), psi, n);
  phi = getArrivalAngles(theta, psi, n);

  for (i = 0; i < n; i++) {
    segments.push(buildSegment(pts[i], pts[i + 1], dd[i], om[i],
      theta[i], phi[i + 1],
      handleLimit(dd[i], i > 0 ? dd[i - 1] : Infinity),
      handleLimit(dd[i], i < n - 1 ? dd[i + 1] : Infinity)));
  }
  return segments;
}

// Longest a handle may be at one end of a segment whose own chord is @own and
// whose neighbour across that knot is @neighbor. (At the first and last knot
// of a run there is no neighbour, and the segment's own chord is the measure.)
//
// The scale is the geometric mean of the two, rather than the shorter of them.
// Measuring against the shorter alone holds the bulge down just as well, but
// it makes a long segment meeting a short one spend nearly all of its shape at
// its far end: on a 490-unit arm meeting a 50-unit leg the two handles came
// out 9.8:1, so the arm ran almost straight and then hooked hard into the
// knot, and the curvature either side of that knot differed by a factor of 14.
// The geometric mean gives the long segment a handle in proportion to how
// lopsided the pair actually is, which brings the same case to 3.1:1 and the
// curvature to within a factor of 1.4 -- about what Hobby's mock curvature
// leaves on an ordinary path anyway -- for two points of extra bulge.
function handleLimit(own, neighbor) {
  return MAX_HANDLE * Math.sqrt(own * Math.min(own, neighbor));
}

// The chord lengths the solve sees, with the ratio between neighbours held to
// MAX_CHORD_RATIO. Each length becomes the smallest that any chord permits it
// to be, allowing for a factor of MAX_CHORD_RATIO per step -- a forward pass
// and a backward pass compute that exactly, so this needs no iteration.
//
// Only the tangent directions are affected. The curve is still built on the
// true chord lengths.
function evenOutChords(dd, n) {
  var out = dd.concat(), i;
  for (i = 1; i < n; i++) {
    if (out[i] > out[i - 1] * MAX_CHORD_RATIO) out[i] = out[i - 1] * MAX_CHORD_RATIO;
  }
  for (i = n - 2; i >= 0; i--) {
    if (out[i] > out[i + 1] * MAX_CHORD_RATIO) out[i] = out[i + 1] * MAX_CHORD_RATIO;
  }
  return out;
}

// The tridiagonal system of Hobby's mock-curvature conditions, in the
// departure angle at each knot measured from the chord leaving it. Written for
// unit tension throughout; the general form carries a tension per knot, which
// the label tool has no use for.
//
// The interior rows come from equalizing mock curvature across knot i; the
// first and last rows are the curl conditions that close the system at the
// ends of an open run.
function solveDepartureAngles(dd, psi, n) {
  var lo = [], di = [], up = [], r = [], i;
  lo.push(0);
  di.push(2 + curl);
  up.push(1 + 2 * curl);
  r.push(-(1 + 2 * curl) * psi[1]);
  for (i = 1; i < n - 1; i++) {
    lo.push(dd[i]);
    di.push(2 * (dd[i] + dd[i - 1]));
    up.push(dd[i - 1]);
    r.push(-2 * dd[i] * psi[i] - dd[i - 1] * psi[i + 1]);
  }
  if (n > 1) {
    lo.push(dd[n - 1]);
    di.push(2 * (dd[n - 1] + dd[n - 2]) -
      dd[n - 2] * (1 + 2 * curl) / (2 + curl));
    up.push(0);
    r.push(-2 * dd[n - 1] * psi[n - 1]);
  }
  return solveTridiagonal(lo, di, up, r);
}

// The angle at which the curve arrives at each knot, again measured from the
// chord. At an interior knot the departure and arrival angles have to account
// between them for the whole turn in the polyline; at the far end of the run
// the curl condition fixes it.
function getArrivalAngles(theta, psi, n) {
  var phi = [0], i;
  for (i = 1; i < n; i++) phi.push(-psi[i] - theta[i]);
  phi.push((1 + 2 * curl) * theta[n - 1] / (2 + curl));
  return phi;
}

// Turns a pair of angles into a cubic, by way of Hobby's velocity functions --
// how far along each tangent the control point sits, as a multiple of a third
// of the chord -- with each distance held to the caller's limit.
//
// Shortening a handle leaves its direction alone, so the tangent the two
// segments share at a knot is untouched and the curve stays smooth through it.
// What it gives up is Hobby's mock-curvature match across that knot, and only
// at a knot lopsided enough for the limit to bite.
function buildSegment(p0, p1, d, om, theta, phi, maxOut, maxIn) {
  var alpha = VEL_A * (Math.sin(theta) - VEL_B * Math.sin(phi)) *
        (Math.sin(phi) - VEL_B * Math.sin(theta)) *
        (Math.cos(theta) - Math.cos(phi)),
      rho = (2 + alpha) /
        (1 + (1 - VEL_C) * Math.cos(theta) + VEL_C * Math.cos(phi)),
      sigma = (2 - alpha) /
        (1 + (1 - VEL_C) * Math.cos(phi) + VEL_C * Math.cos(theta)),
      out = d * rho / 3,
      arr = d * sigma / 3;
  if (out > maxOut) out = maxOut;
  if (arr > maxIn) arr = maxIn;
  return {
    p0: p0,
    c1: [p0[0] + out * Math.cos(theta + om),
         p0[1] + out * Math.sin(theta + om)],
    c2: [p1[0] - arr * Math.cos(om - phi),
         p1[1] - arr * Math.sin(om - phi)],
    p3: p1
  };
}

// A cubic that is exactly its chord, with the control points at the thirds --
// the degenerate case of the above when both angles are zero.
function straightSegment(a, b) {
  return {
    p0: a,
    c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
    c2: [a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3],
    p3: b
  };
}

// Thomas algorithm. Hobby shows the system is diagonally dominant, so this
// needs no pivoting.
function solveTridiagonal(lo, di, up, r) {
  var n = di.length,
      cp = [], dp = [], x = new Array(n), i, m;
  cp.push(up[0] / di[0]);
  dp.push(r[0] / di[0]);
  for (i = 1; i < n; i++) {
    m = di[i] - lo[i] * cp[i - 1];
    cp.push(up[i] / m);
    dp.push((r[i] - lo[i] * dp[i - 1]) / m);
  }
  x[n - 1] = dp[n - 1];
  for (i = n - 2; i >= 0; i--) {
    x[i] = dp[i] - cp[i] * x[i + 1];
  }
  return x;
}

// Into (-PI, PI], so that a turn is measured the short way round.
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

// A cubic's arc length is bracketed below by its chord and above by its control
// polygon. Subdividing narrows the bracket; the midpoint of a narrow one is the
// length. (Gravesen's method.)
function getCubicLength(seg, depth) {
  var chord = distance2D(seg.p0[0], seg.p0[1], seg.p3[0], seg.p3[1]);
  var poly = distance2D(seg.p0[0], seg.p0[1], seg.c1[0], seg.c1[1]) +
      distance2D(seg.c1[0], seg.c1[1], seg.c2[0], seg.c2[1]) +
      distance2D(seg.c2[0], seg.c2[1], seg.p3[0], seg.p3[1]);
  var halves;
  if (poly === 0 || depth >= MAX_LENGTH_DEPTH ||
      poly - chord <= LENGTH_TOLERANCE * poly) {
    return (chord + poly) / 2;
  }
  halves = subdivideCubic(seg.p0, seg.c1, seg.c2, seg.p3);
  return getCubicLength(halves.left, depth + 1) +
    getCubicLength(halves.right, depth + 1);
}

// Removes non-finite and consecutively duplicated knots. A duplicate spans a
// zero-length chord, which would leave the direction of the polyline there
// undefined -- and double-clicking to finish a path is an easy way to make one.
function dedupeKnots(knots) {
  var points = [], i, p, prev;
  for (i = 0; i < knots.length; i++) {
    p = knots[i];
    if (!p || p.length < 2 || !isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) continue;
    if (prev && p[0] === prev[0] && p[1] === prev[1]) continue;
    points.push([p[0], p[1]]);
    prev = p;
  }
  return points;
}

// Recursively subdivides a cubic until its control points lie within
// @tolerance of its chord, emitting only the vertices strictly inside the
// curve -- the caller adds the endpoint.
//
// Testing the control points is conservative: a cubic's greatest deviation
// from its chord is at most 3/4 of the greater control point distance, so the
// flattened path stays within 0.75 * tolerance of the true curve.
function flattenCubic(p0, c1, c2, p3, tolerance, depth, out) {
  var tolSq = tolerance * tolerance;
  var halves;
  if (depth >= MAX_SUBDIVIDE_DEPTH) return;
  if (pointSegDistSq2(c1[0], c1[1], p0[0], p0[1], p3[0], p3[1]) <= tolSq &&
      pointSegDistSq2(c2[0], c2[1], p0[0], p0[1], p3[0], p3[1]) <= tolSq) {
    return; // flat enough -- the chord stands in for the curve
  }
  halves = subdivideCubic(p0, c1, c2, p3);
  flattenCubic(halves.left.p0, halves.left.c1, halves.left.c2, halves.left.p3,
    tolerance, depth + 1, out);
  out.push([halves.left.p3[0], halves.left.p3[1]]); // curve midpoint
  flattenCubic(halves.right.p0, halves.right.c1, halves.right.c2, halves.right.p3,
    tolerance, depth + 1, out);
}

// de Casteljau split at t = 0.5
function subdivideCubic(p0, c1, c2, p3) {
  var a = mid(p0, c1),
      b = mid(c1, c2),
      c = mid(c2, p3),
      d = mid(a, b),
      e = mid(b, c),
      m = mid(d, e);
  return {
    left: {p0: p0, c1: a, c2: d, p3: m},
    right: {p0: m, c1: e, c2: c, p3: p3}
  };
}

function mid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function isFiniteNumber(n) {
  return typeof n == 'number' && isFinite(n);
}
