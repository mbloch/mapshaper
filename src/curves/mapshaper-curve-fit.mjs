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

// Tension, applied uniformly at every knot.
// Higher values pull the curve toward the polyline between the knots; 1 is
// Metafont's default.
var DEFAULT_TENSION = 1;
var MIN_TENSION = 0.75;
var tension = DEFAULT_TENSION;

// Temporary knob, like setCurveCurl(); see window.mapshaper.setLabelCurveTension().
export function setCurveTension(val) {
  tension = val >= MIN_TENSION ? +val : DEFAULT_TENSION;
  return tension;
}

export function getCurveTension() {
  return tension;
}

// Extra tension at knots where the path doubles back, so that a hairpin turns
// tightly while a loop of three or four evenly placed knots stays round. A
// knot's tension rises from the base tension above to hairpinTension as the
// angle between the path's two arms at the knot closes from hairpinAngle to 0
// degrees, following a smoothstep so that dragging a knot through the band
// changes the curve gradually. A square's arms meet at 90 degrees, outside the
// ramp; an equilateral triangle's meet at 60, just inside it, where the
// smoothstep has barely begun to rise. Ends of an open run keep the base
// tension; they have no angle.
var DEFAULT_HAIRPIN_TENSION = 3;
var DEFAULT_HAIRPIN_ANGLE = 70;
var hairpinTension = DEFAULT_HAIRPIN_TENSION;
var hairpinAngle = DEFAULT_HAIRPIN_ANGLE;

// Temporary knobs, like setCurveCurl(); see
// window.mapshaper.setLabelCurveHairpin() in the GUI.
export function setCurveHairpinTension(val) {
  hairpinTension = val >= MIN_TENSION ? +val : DEFAULT_HAIRPIN_TENSION;
  return hairpinTension;
}

export function setCurveHairpinAngle(deg) {
  hairpinAngle = deg > 0 && deg <= 180 ? +deg : DEFAULT_HAIRPIN_ANGLE;
  return hairpinAngle;
}

export function getCurveHairpinTension() {
  return hairpinTension;
}

export function getCurveHairpinAngle() {
  return hairpinAngle;
}

// Tension at a knot where the polyline turns by @psi radians, so that its
// arms meet at PI - |psi|
function getKnotTension(psi) {
  var start = hairpinAngle * Math.PI / 180,
      x = (start - (Math.PI - Math.abs(psi))) / start;
  if (x <= 0) return tension;
  if (x > 1) x = 1;
  return tension + (hairpinTension - tension) * x * x * (3 - 2 * x);
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

// A curve is closed when its last knot repeats its first exactly, as a GeoJSON
// ring does, and it has at least three distinct knots. Fewer can't enclose
// anything: A,B,A is drawn as the straight segment A,B.
export function curveIsClosed(knots) {
  var n = knots ? knots.length : 0;
  return n > 3 && samePoint(knots[0], knots[n - 1]) &&
    getLoopKnots(dedupeKnots(knots)).length >= 3;
}

// knots: array of [x, y] in a single coordinate space
// tolerance: max deviation of the output polyline from the true curve, in the
//   same units as the knots
// closed: fit a closed loop (see curveIsClosed()) rather than an open run
// corners: (optional) an array of booleans, one per knot: true for a knot
//   where the curve turns sharply rather than passing smoothly through it
// Returns an array of [x, y] starting at the first knot, ending at the last,
//   and passing through every knot in between.
export function fitCurveThroughKnots(knots, tolerance, closed, corners) {
  var pts = dedupeKnots(knots || [], corners),
      segments, out, i;
  if (pts.length < 2) return pts;
  if (tolerance > 0 === false) {
    // with no usable tolerance there is nothing to flatten against; the knots
    // are the curve at its coarsest
    return pts;
  }
  segments = fitKnots(pts, closed);
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
// Returns [{p0, c1, c2, p3}, ...], one per knot interval. A closed curve's
// last segment ends at its first knot.
export function getCurveSegments(knots, closed, corners) {
  var pts = dedupeKnots(knots || [], corners);
  if (pts.length < 2) return [];
  return fitKnots(pts, closed);
}

// @pts: deduplicated knots, with any corners as pts.corners
function fitKnots(pts, closed) {
  var corners = pts.corners, loop;
  if (closed) {
    loop = getLoopKnots(pts);
    if (loop.length < 3) return fitRun(loop);
    if (!corners) return fitLoop(loop);
    // the knot that closes the loop is the first knot
    corners = corners.slice(0, loop.length);
    corners[0] = corners[0] || pts.corners[pts.length - 1];
    return fitLoopWithCorners(loop, corners);
  }
  return corners ? fitRunsBetweenCorners(pts, corners) : fitRun(pts);
}

// A corner ends one run of knots and starts the next, so the curve turns
// there instead of passing smoothly through, and each run is fitted on its
// own, with the ends of a run as it would have at the ends of a curve. Two
// corners side by side are joined by a straight segment, since a run of two
// knots is straight. A corner at either end of the curve changes nothing.
function fitRunsBetweenCorners(pts, corners) {
  var segments = [], start = 0, i;
  for (i = 1; i < pts.length; i++) {
    if (corners[i] || i == pts.length - 1) {
      segments = segments.concat(fitRun(pts.slice(start, i + 1)));
      start = i;
    }
  }
  return segments;
}

// A loop with a corner is a run from the corner round to it again. The
// segments are rotated back to start at the loop's first knot, as fitLoop()'s
// do.
function fitLoopWithCorners(loop, corners) {
  var n = loop.length;
  var c = corners.indexOf(true);
  var pts = loop.slice(c).concat(loop.slice(0, c), [loop[c]]);
  var flags = corners.slice(c).concat(corners.slice(0, c), [true]);
  var segments = fitRunsBetweenCorners(pts, flags);
  var k = (n - c) % n;
  return segments.slice(k).concat(segments.slice(0, k));
}

// A closed curve's knots without the repeated last one
function getLoopKnots(pts) {
  var n = pts.length;
  return n > 1 && samePoint(pts[0], pts[n - 1]) ? pts.slice(0, n - 1) : pts;
}

// Fits a closed loop through @pts (the first knot not repeated at the end),
// returning a cubic per interval, the last one ending at the first knot.
//
// Every knot is an interior knot of a loop, so each row of the system is the
// mock-curvature condition of fitRun()'s interior rows, with indices taken
// round the loop. The rows that wrap make the matrix cyclic tridiagonal.
function fitLoop(pts) {
  var n = pts.length, // segment count = knot count
      dd = [], om = [], psi = [], lo = [], di = [], up = [], r = [],
      tau = [], segments = [], ee, theta, phi, i, prev, next, j;
  for (i = 0; i < n; i++) {
    j = (i + 1) % n;
    dd.push(distance2D(pts[i][0], pts[i][1], pts[j][0], pts[j][1]));
    om.push(Math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]));
  }
  for (i = 0; i < n; i++) {
    psi.push(wrapAngle(om[i] - om[(i + n - 1) % n]));
  }
  ee = evenOutLoopChords(dd, n);
  for (i = 0; i < n; i++) tau.push(getKnotTension(psi[i]));
  for (i = 0; i < n; i++) {
    prev = (i + n - 1) % n;
    next = (i + 1) % n;
    pushCurvatureRow(lo, di, up, r, ee[prev], ee[i], 1 / tau[prev],
      1 / tau[next], psi[i], psi[next]);
  }
  theta = solveCyclicTridiagonal(lo, di, up, r);
  phi = [];
  for (i = 0; i < n; i++) phi.push(-psi[i] - theta[i]);
  for (i = 0; i < n; i++) {
    j = (i + 1) % n;
    segments.push(buildSegment(pts[i], pts[j], dd[i], om[i], theta[i], phi[j],
      tau[i], tau[j],
      handleLimit(dd[i], dd[(i + n - 1) % n]),
      handleLimit(dd[i], dd[j])));
  }
  return segments;
}

// evenOutChords() round a loop. A pass in each direction settles an open run;
// round a loop a chord's limit can come from either side, so the passes repeat
// until nothing changes -- n passes at most, since each settles a chord.
function evenOutLoopChords(dd, n) {
  var out = dd.concat(), changed = true, passes = 0, i, j, max;
  while (changed && passes++ <= n) {
    changed = false;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      max = out[i] * MAX_CHORD_RATIO;
      if (out[j] > max) { out[j] = max; changed = true; }
      max = out[j] * MAX_CHORD_RATIO;
      if (out[i] > max) { out[i] = max; changed = true; }
    }
  }
  return out;
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

// The point @dist along the fitted curve from its first knot, clamped to the
// curve's ends, or null if the knots collapse to a single point.
export function getPointAtCurveLength(knots, dist) {
  var segments = getCurveSegments(knots);
  var seg, len, i;
  if (segments.length === 0) return null;
  for (i = 0; i < segments.length; i++) {
    seg = segments[i];
    len = getCubicLength(seg, 0);
    if (dist <= len) return getPointAtCubicLength(seg, Math.max(dist, 0));
    dist -= len;
  }
  return [seg.p3[0], seg.p3[1]];
}

// Walks a flattening of the segment, which is shorter than the true curve by
// a negligible amount at this many steps.
function getPointAtCubicLength(seg, dist) {
  var steps = 64;
  var prev = seg.p0, p, d, k, i;
  for (i = 1; i <= steps; i++) {
    p = getCubicPoint(seg, i / steps);
    d = distance2D(prev[0], prev[1], p[0], p[1]);
    if (d > 0 && d >= dist) {
      k = dist / d;
      return [prev[0] + (p[0] - prev[0]) * k, prev[1] + (p[1] - prev[1]) * k];
    }
    dist -= d;
    prev = p;
  }
  return [seg.p3[0], seg.p3[1]];
}

function getCubicPoint(seg, t) {
  var mt = 1 - t;
  var a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [
    a * seg.p0[0] + b * seg.c1[0] + c * seg.c2[0] + d * seg.p3[0],
    a * seg.p0[1] + b * seg.c1[1] + c * seg.c2[1] + d * seg.p3[1]
  ];
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
      dd = [], om = [], psi = [], tau = [], segments = [],
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
  tau.push(tension);
  for (i = 1; i < n; i++) tau.push(getKnotTension(psi[i]));
  tau.push(tension);

  theta = solveDepartureAngles(evenOutChords(dd, n), psi, tau, n);
  phi = getArrivalAngles(theta, psi, tau, n);

  for (i = 0; i < n; i++) {
    segments.push(buildSegment(pts[i], pts[i + 1], dd[i], om[i],
      theta[i], phi[i + 1], tau[i], tau[i + 1],
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
// departure angle at each knot measured from the chord leaving it, with a
// tension per knot (@tau) shared by both sides of the knot. This is mf.web
// §274-§295 with each knot's left and right tensions equal; the label tool
// has no use for asymmetric ones (see "Bulging" in the design doc).
//
// The interior rows come from equalizing mock curvature across knot i; the
// first and last rows are the curl conditions that close the system at the
// ends of an open run.
function solveDepartureAngles(dd, psi, tau, n) {
  var lo = [], di = [], up = [], r = [],
      c = getCurlRatio(1 / tau[0], 1 / tau[1]), i;
  lo.push(0);
  di.push(c.den);
  up.push(c.num);
  r.push(-c.num * psi[1]);
  for (i = 1; i < n; i++) {
    pushCurvatureRow(lo, di, up, r, dd[i - 1], dd[i], 1 / tau[i - 1],
      1 / tau[i + 1], psi[i], i < n - 1 ? psi[i + 1] : 0);
  }
  // the last row's next angle is fixed by the curl condition at the end
  c = getCurlRatio(1 / tau[n], 1 / tau[n - 1]);
  di[n - 1] -= up[n - 1] * c.num / c.den;
  up[n - 1] = 0;
  return solveTridiagonal(lo, di, up, r);
}

// The mock-curvature condition at a knot, in the departure angles at it and
// its two neighbours, scaled by the product of the chords either side of it
// (@dPrev arriving, @dNext leaving). @aPrev and @aNext are the reciprocal
// tensions at the neighbours; the knot's own tension cancels out of its row,
// and acts only through its neighbours' rows and its handle lengths. At unit
// tension the coefficients are Hobby's 1, 2, 2, 1 times the chord lengths.
function pushCurvatureRow(lo, di, up, r, dPrev, dNext, aPrev, aNext, psi, psiNext) {
  lo.push(aPrev * dNext);
  di.push((3 - aPrev) * dNext + (3 - aNext) * dPrev);
  up.push(aNext * dPrev);
  r.push(-(3 - aPrev) * dNext * psi - aNext * dPrev * psiNext);
}

// Metafont's curl_ratio(): at the end knot of a run, whose reciprocal tension
// is @a, with its neighbour's being @b, the angle on the far side of the end
// segment is num / den times the angle at the end. At unit tension this is
// (1 + 2 * curl) / (2 + curl).
function getCurlRatio(a, b) {
  return {
    num: curl * a * a * (3 - a) + b * b * b,
    den: curl * a * a * a + (3 - b) * b * b
  };
}

// The angle at which the curve arrives at each knot, again measured from the
// chord. At an interior knot the departure and arrival angles have to account
// between them for the whole turn in the polyline; at the far end of the run
// the curl condition fixes it.
function getArrivalAngles(theta, psi, tau, n) {
  var c = getCurlRatio(1 / tau[n], 1 / tau[n - 1]),
      phi = [0], i;
  for (i = 1; i < n; i++) phi.push(-psi[i] - theta[i]);
  phi.push(c.num * theta[n - 1] / c.den);
  return phi;
}

// Turns a pair of angles into a cubic, by way of Hobby's velocity functions --
// how far along each tangent the control point sits, as a multiple of a third
// of the chord, divided by the tension -- with each distance held to the
// caller's limit.
//
// Shortening a handle leaves its direction alone, so the tangent the two
// segments share at a knot is untouched and the curve stays smooth through it.
// What it gives up is Hobby's mock-curvature match across that knot, and only
// at a knot lopsided enough for the limit to bite.
function buildSegment(p0, p1, d, om, theta, phi, tauOut, tauIn, maxOut, maxIn) {
  var alpha = VEL_A * (Math.sin(theta) - VEL_B * Math.sin(phi)) *
        (Math.sin(phi) - VEL_B * Math.sin(theta)) *
        (Math.cos(theta) - Math.cos(phi)),
      rho = (2 + alpha) /
        (1 + (1 - VEL_C) * Math.cos(theta) + VEL_C * Math.cos(phi)),
      sigma = (2 - alpha) /
        (1 + (1 - VEL_C) * Math.cos(phi) + VEL_C * Math.cos(theta)),
      out = d * rho / (3 * tauOut),
      arr = d * sigma / (3 * tauIn);
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

// A tridiagonal system whose first row also couples to the last unknown (by
// lo[0]) and whose last row couples to the first (by up[n-1]), solved with the
// Sherman-Morrison formula: as an ordinary tridiagonal system with a rank-one
// correction. Needs n >= 3.
function solveCyclicTridiagonal(lo, di, up, r) {
  var n = di.length,
      alpha = up[n - 1], // last row, first column
      beta = lo[0],      // first row, last column
      gamma = -di[0],
      bb = di.concat(), u = [], lo2 = lo.concat(), up2 = up.concat(),
      x, z, fact, i;
  bb[0] = di[0] - gamma;
  bb[n - 1] = di[n - 1] - alpha * beta / gamma;
  lo2[0] = 0;
  up2[n - 1] = 0;
  for (i = 0; i < n; i++) u.push(0);
  u[0] = gamma;
  u[n - 1] = alpha;
  x = solveTridiagonal(lo2, bb, up2, r);
  z = solveTridiagonal(lo2, bb, up2, u);
  fact = (x[0] + beta * x[n - 1] / gamma) /
    (1 + z[0] + beta * z[n - 1] / gamma);
  for (i = 0; i < n; i++) x[i] -= fact * z[i];
  return x;
}

function samePoint(a, b) {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
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
// With @corners, the result's corners property has a flag per point kept, and
// a removed duplicate of a corner leaves the knot it duplicates a corner. With
// no corners, there is no corners property.
function dedupeKnots(knots, corners) {
  var points = [], flags = [], i, p, prev;
  for (i = 0; i < knots.length; i++) {
    p = knots[i];
    if (!p || p.length < 2 || !isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) continue;
    if (prev && p[0] === prev[0] && p[1] === prev[1]) {
      if (corners && corners[i]) flags[flags.length - 1] = true;
      continue;
    }
    points.push([p[0], p[1]]);
    flags.push(!!(corners && corners[i]));
    prev = p;
  }
  if (flags.indexOf(true) > -1) points.corners = flags;
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
