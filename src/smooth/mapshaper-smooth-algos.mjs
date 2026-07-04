import geom from '../geom/mapshaper-geom';
import { getCornerParams, findInteriorCorners, isStructuralRun, bordersStraightRun, bordersStraightRingSpan } from './mapshaper-smooth-corners';

// Scale-aware line smoothing primitives, shared by the -smooth command.
//
// The smoother treats a path as coordinate signals parameterized by arc length s
// and applies a length-scaled low-pass filter. The user-facing distance is
// calibrated so that it approximates the maximum displacement of the smoothed
// line from the original at high-displacement features (e.g. acute bends): finer
// detail is removed and larger features pass through progressively less changed.
// In frequency terms the kernel's half-amplitude (-6 dB) wavelength sits at
// roughly KERNEL_STRENGTH * distance, so detail a few times finer than the
// distance is strongly attenuated. The distance is not a strict deviation
// bound -- a tall, narrow sub-resolution spike can still be displaced by an
// amount comparable to its own amplitude (inherent to convolution smoothers).
//
// The filter is a local second-degree polynomial fit whose quadratic term
// corrects the inward shrinkage that plain weighted averaging causes on curved
// features. The weight kernel selects the method (see smoothPoint):
//  - 'gaussian' (default, the only documented method): Gaussian kernel
//    e^(-t^2/2sigma^2), i.e. a Savitzky-Golay smoother.
//  - 'paek': exponential kernel e^(-|t|/d) (Bodansky et al. 2002, the kernel
//    ArcGIS's PAEK uses). Kept as an undocumented alternative; with the quadratic
//    correction it differs only slightly from the gaussian method.
//
// The smoother works on a list of coordinate "channels": planar data is
// smoothed in 2D (x, y); unprojected lng/lat data is converted to geocentric
// x, y, z and smoothed in 3D Cartesian on the sphere (then converted back).
// Averaging lng/lat directly would shear shapes toward the poles (a degree of
// longitude shrinks with cos(lat)); the geocentric representation is isotropic
// and handles the antimeridian and poles without special cases, mirroring how
// -simplify treats spherical coordinates. The kernel scale stays in true ground
// distance because arc length is measured with great-circle distance.
//
// KERNEL_FROM_DISTANCE maps the user distance onto the internal reference scale
// (tol) that keys corner detection, output sampling and densification. The kernel
// itself is then widened by KERNEL_STRENGTH (below), so the distance approximates
// the maximum displacement at sharp features and the -6 dB wavelength sits near
// KERNEL_STRENGTH * distance. The remaining calibration constants are expressed
// relative to the internal scale and map it onto kernel widths and output
// sampling; they are collected here so the mapping can be retuned in one place.
// See docs/reference.md.
var KERNEL_FROM_DISTANCE = 1.2;   // internal kernel scale = distance * this
// Base smoothing strength baked into the default: the low-pass kernel scale is
// this * tol (before the user's `strength` multiplier and the ring cap). It is
// calibrated so the distance parameter approximates the maximum displacement of
// the smoothed line from the original at high-displacement features (e.g. acute
// bends) -- a markedly stronger, more intuitive effect than the raw -6 dB
// mapping (which displaced the line far less than the distance). ONLY the kernel
// scale is affected; tol -- and therefore corner detection, output sampling, the
// prefilter and island dropping -- stays keyed to the raw distance.
var KERNEL_STRENGTH = 5;
var GAUSSIAN_SIGMA_FACTOR = 0.4;  // gaussian sigma = internal scale * this
var PAEK_SCALE_FACTOR = 0.4;      // exponential kernel scale d = internal scale * this
var WINDOW_RADIUS_FACTOR = 1.2;   // window half-length = internal scale * this
var SOURCE_SPACING_FACTOR = 0.25; // densify source to <= tolerance * this before smoothing
var MAX_OUTPUT_FACTOR = 8;        // cap output (and source) vertices at inputCount * this
var MIN_CLOSED_SEGMENTS = 16;     // floor on segments for closed rings (so they resolve)
// A closed ring cannot be smoothed at a resolution coarser than the ring itself:
// once the kernel window (radius = internal scale * WINDOW_RADIUS_FACTOR)
// reaches half the ring's perimeter, every output point averages over the whole
// loop and the ring degenerates toward a point (a circle once re-inflated). So
// for a closed ring the internal scale is capped just below that threshold,
// which is factor 1/(2*WINDOW_RADIUS_FACTOR) ~ 0.42. Up to the threshold the
// ring keeps its shape (elongated stays elongated, and detail is rounded as much
// as the ring's own size allows); the enclosed area it loses to curve-shortening
// on the way is restored afterward by restoreRingArea() (a similarity rescale
// about the centroid), so a small island is rounded at close to the full
// requested scale without shrinking. The cap only binds when the requested
// distance nears the ring's own size; large rings (perimeter >> distance) smooth
// gently, lose negligible area and are effectively unaffected by either step.
var MAX_RING_SCALE_FACTOR = 0.42;

// Output resampling. The smoothed curve is a continuous function of arc length;
// we sample it densely at a uniform step and then thin that dense polyline with a
// single O(n) forward pass that keeps a vertex only where the curve has bent
// enough since the last kept vertex. Filtering on accumulated bend angle (rather
// than chord deviation, as Douglas-Peucker does) bounds the angle between
// consecutive output segments *by construction*, so joins stay smooth with no
// separate tangent test. This works cleanly because the filter consumes the
// already-smoothed (denoised) curve, where per-vertex turning is small and
// well-behaved. Density follows curvature for free: bends accumulate angle
// quickly and keep many vertices; straight or gently-curving runs accumulate
// slowly and collapse to long segments.
//
// Accumulated angle alone does not bound *absolute* deviation: a very gentle but
// very long bend accumulates angle so slowly that its chord can bow far from the
// curve before reaching the angle threshold. A sagitta guard handles that --
// chord * accumulatedTurn / 8 estimates the bow of a circular arc, and we also
// cut when it exceeds a fraction of the tolerance. Both tests are O(1) per dense
// vertex, so the pass stays O(n).
var DENSE_STEP_FACTOR = 0.033;      // dense sampling step = tolerance * this at the
                                    // default bend angle. Must resolve the sharpest
                                    // smoothed feature (radius ~ the kernel scale)
                                    // finely enough that the angle filter can reach
                                    // the bend-angle joins: one dense segment turns
                                    // ~ this/0.4 radians there, kept well under the
                                    // bend angle so the discrete accumulation barely
                                    // overshoots the threshold. For a smaller-than-
                                    // default bend angle the step is refined in
                                    // proportion so the threshold stays reachable.
var DEFAULT_BEND_ANGLE = 8 * Math.PI / 180; // keep a vertex after this much accumulated
                                    // turn (max turn between consecutive output
                                    // segments); user-overridable via max-bend-angle
var DEVIATION_FACTOR = 0.1;         // sagitta guard: also cut a gentle bend that bows
                                    // more than tolerance * this from its chord

// Smooth a single arc's coordinates.
// @xx, @yy: coordinate arrays (may be typed-array subarrays) for one arc.
// @opts: {tolerance, method, spherical, closed, keepCorners, gain, maxBendAngle}
// Returns {xx: [], yy: []} with the smoothed coordinates. Endpoints of open
// arcs are preserved exactly (so shared topology nodes stay put); closed arcs
// are smoothed cyclically and returned closed (first point repeated at the end).
// With keepCorners, structural corners (where long straight/low-curvature runs
// meet) are detected and pinned, and the runs themselves are kept verbatim;
// only the spans between corners are smoothed.
// Resolve the curvature-correction gain (default 1 = fully corrected). gain=0
// leaves the plain weighted moving average; negative values are clamped to 0.
function resolveGain(opts) {
  var g = opts.gain;
  if (g === undefined || g === null) return 1;
  return g >= 0 ? g : 0;
}

// Resolve the output bend-angle threshold from the user option (in degrees) to
// radians. It caps the turn between consecutive output segments: a larger angle
// keeps fewer vertices (coarser joins), a smaller one keeps more (smoother joins).
// Non-positive or missing values fall back to the default.
function resolveBendAngle(opts) {
  var deg = opts.maxBendAngle;
  if (deg === undefined || deg === null || !(deg > 0)) return DEFAULT_BEND_ANGLE;
  return deg * Math.PI / 180;
}

// Resolve the corner-detection bias (default 0 = neutral). This is the raw
// user-facing value; getCornerParams / cornerBiasScale convert it into the
// multiplier on detection resolution. A positive bias keeps more corners, a
// negative bias fewer. Missing/null falls back to neutral.
function resolveCornerBias(opts) {
  var b = opts.cornerBias;
  return (b === undefined || b === null) ? 0 : b;
}

// Resolve the smoothing-strength multiplier (default 1). It scales only the
// low-pass kernel (window radius and sigma) relative to the distance, so a value
// > 1 smooths more strongly (wider kernel, larger divergence from the original)
// and < 1 more gently. Everything else keyed to the distance -- corner detection,
// output sampling, the prefilter and island dropping -- is left unchanged.
// Non-positive or missing values fall back to 1.
//
// By design, curve exaggeration (gain > 1) scales WITH strength: gain multiplies
// the quadratic curvature correction (a0 - mean) in smoothPoint, and that term is
// measured over the strength-scaled kernel window, so a wider kernel amplifies a
// given gain. This coupling is intentional -- do not normalize it out.
function resolveStrength(opts) {
  var s = opts.strength;
  return s > 0 ? s : 1;
}

export function smoothArcCoords(xx, yy, opts) {
  var n = xx.length;
  var origX = toArray(xx);
  var origY = toArray(yy);
  var tol = opts.tolerance * KERNEL_FROM_DISTANCE;
  if (n < 3 || !(opts.tolerance > 0)) {
    return {xx: origX, yy: origY};
  }
  var method = opts.method == 'gaussian' ? 'gaussian' : 'paek';
  var closed = !!opts.closed;
  var spherical = !!opts.spherical;
  var keepCorners = !!opts.keepCorners;
  var bendAngle = resolveBendAngle(opts);

  // Cumulative arc length in ground units (meters for spherical data), so the
  // kernel scale stays in true distance regardless of coordinate representation.
  var t = arcLengths(origX, origY, n, spherical);
  if (!(t[n - 1] > 0)) {
    return {xx: origX, yy: origY}; // degenerate (coincident points)
  }
  // The low-pass kernel scale is the raw distance scale (tol) times the baked-in
  // KERNEL_STRENGTH calibration and the user's `strength` multiplier (default 1).
  // Only the kernel (radius, sigma) uses this scale; tol -- which drives corner
  // detection, output sampling and densification -- stays keyed to the raw
  // distance, so those effects are unaffected by either strength factor.
  var kernelScale = tol * KERNEL_STRENGTH * resolveStrength(opts);
  // A closed ring smaller than the smoothing resolution would collapse toward its
  // centroid, so cap both scales at a fraction of the ring's perimeter (see
  // MAX_RING_SCALE_FACTOR). This only binds when the requested distance (or the
  // boosted kernel) approaches the ring's own size; otherwise it is a no-op. The
  // cap on kernelScale also stops a large `strength` from collapsing a ring.
  if (closed) {
    var ringCap = MAX_RING_SCALE_FACTOR * t[n - 1];
    tol = Math.min(tol, ringCap);
    kernelScale = Math.min(kernelScale, ringCap);
  }
  var ctx = {
    tol: tol,
    method: method,
    spherical: spherical,
    keepCorners: keepCorners,
    cornerBias: resolveCornerBias(opts),
    gain: resolveGain(opts),
    bendAngle: bendAngle,
    // Refine the dense step for a smaller-than-default bend angle so one dense
    // segment still turns well under the threshold; never coarsen it beyond the
    // default (the angle filter alone thins the output for larger angles).
    denseStep: tol * DENSE_STEP_FACTOR * Math.min(1, bendAngle / DEFAULT_BEND_ANGLE),
    radius: kernelScale * WINDOW_RADIUS_FACTOR,
    scale: (method == 'gaussian' ? GAUSSIAN_SIGMA_FACTOR : PAEK_SCALE_FACTOR) * kernelScale
  };
  var channels = spherical ? lngLatToXYZChannels(origX, origY, n) : [origX, origY];

  if (closed) {
    var ringParams = getCornerParams(tol, ctx.cornerBias);
    var corners = keepCorners ?
      findInteriorCorners(t, channels, n, true, ringParams) : [];
    // findInteriorCorners flags localized bends by angle alone; it does not check
    // whether a candidate borders a structural (long, low-curvature) run. Keep
    // only the corners that do -- a natural ring with no straight segments has
    // none and must smooth cyclically. Otherwise the ring would be rotated to
    // corners[0] and smoothed as an open path with that vertex pinned as a
    // spurious cusp (whose location shifts with the tolerance-scaled detection
    // window), even though refineBounds later drops every interior breakpoint.
    if (corners.length > 0) {
      corners = filterRingCornersByStructure(t, channels, n, corners, ringParams);
    }
    if (corners.length === 0) {
      return smoothClosedCyclic(t, channels, n, ctx);
    }
    // A ring with corners is processed as an open path: rotate it to start (and
    // end) at one corner, with the remaining corners as interior breakpoints.
    var rot = rotateRing(origX, origY, n, corners[0]);
    origX = rot.xx;
    origY = rot.yy;
    n = origX.length;
    t = arcLengths(origX, origY, n, spherical);
    channels = spherical ? lngLatToXYZChannels(origX, origY, n) : [origX, origY];
    var breaks = mapRotatedCorners(corners, rot.shift, rot.m);
    return smoothOpenSpans(origX, origY, t, channels, n, breaks, ctx);
  }

  var openBreaks = keepCorners ?
    findInteriorCorners(t, channels, n, false, getCornerParams(tol, ctx.cornerBias)) : [];
  return smoothOpenSpans(origX, origY, t, channels, n, openBreaks, ctx);
}

// Smooth an open path partitioned at @interiorBreaks (sorted interior vertex
// indices). Corner retention and verbatim-copy are two separate decisions:
//   - A breakpoint is kept only if it borders a straight run that is straight
//     enough for its turn angle (bordersStraightRun -- deviation from the endpoint
//     chord, robust to sub-tolerance wiggle, and tightened for gentle bends so a
//     soft bend on a borderline-straight run is not pinned); otherwise
//     refineBounds drops it.
//   - A kept span is copied verbatim only if it is clean per-vertex
//     (isStructuralRun); otherwise it is smoothed with its endpoints pinned. So a
//     straight-but-noisy border is smoothed into a clean straight line between
//     its pinned corners, rather than curving into its neighbours.
// Every breakpoint (and the two arc endpoints) keeps its exact original position;
// shared breakpoint vertices are emitted once.
function smoothOpenSpans(origX, origY, t, channels, n, interiorBreaks, ctx) {
  var bounds = [0].concat(interiorBreaks);
  bounds.push(n - 1);
  if (ctx.keepCorners && bounds.length > 2) {
    bounds = refineBounds(t, channels, bounds, getCornerParams(ctx.tol, ctx.cornerBias));
  }
  var params = ctx.keepCorners ? getCornerParams(ctx.tol, ctx.cornerBias) : null;
  var xx = [], yy = [];
  for (var s = 0; s < bounds.length - 1; s++) {
    var lo = bounds[s], hi = bounds[s + 1];
    var preserve = !!params && isStructuralRun(t, channels, lo, hi, params);
    var span = preserve ?
      copySpan(origX, origY, lo, hi) :
      smoothSpanOpen(origX, origY, t, channels, lo, hi, ctx);
    appendSpan(xx, yy, span, s === 0);
  }
  return {xx: xx, yy: yy};
}

// Drop interior breakpoints that don't border any pinnable straight run (e.g.
// spikes inside a wiggly stretch, or -- crucially on sparse/simplified data --
// points sampled along a gentle curve), merging their spans, until the partition
// is stable. Merging can turn two short pieces back into one straight run, so the
// test is repeated each pass. A breakpoint is kept only if an adjacent span is
// straight at the smoothing scale AND straight enough for the breakpoint's own
// turn angle (bordersStraightRun): deviation from the endpoint chord, tightened
// for gentle corners so a soft bend on a borderline-straight run is not pinned.
// The older per-vertex turning gate (isStructuralRun) is deliberately NOT used
// for retention -- it admits any run bending no tighter than radius
// MIN_RUN_RADIUS_FACTOR*tol, i.e. gentle curves, which on coarsely-sampled data
// produces spurious corners along smooth bends. (isStructuralRun still governs
// verbatim-copy of a kept span; see smoothOpenSpans.) The corner for both
// adjacent spans is the breakpoint itself, so its turn angle gates each side.
function refineBounds(t, channels, bounds, params) {
  var n = channels[0].length;
  var changed = true;
  while (changed && bounds.length > 2) {
    changed = false;
    for (var i = 1; i < bounds.length - 1; i++) {
      var leftStruct = bordersStraightRun(t, channels, n, bounds[i], bounds[i - 1], bounds[i], params);
      var rightStruct = bordersStraightRun(t, channels, n, bounds[i], bounds[i], bounds[i + 1], params);
      if (!leftStruct && !rightStruct) {
        bounds.splice(i, 1);
        changed = true;
        // Removing bounds[i] only changes the spans of its two neighbours; the
        // breakpoints before them stay stable, so resume the scan just before the
        // removal (rechecking the left neighbour) instead of restarting from the
        // start. Restarting made this O(breaks^2) -- a hang on a large ring where
        // the smoothing distance is finer than the vertex spacing and nearly
        // every vertex reads as a breakpoint. The removal sequence is identical to
        // a from-scratch rescan (the stable prefix is never revisited).
        i = i < 2 ? 0 : i - 2;
      }
    }
  }
  return bounds;
}

// Drop closed-ring corners that don't border a run worth pinning on either side,
// merging their (cyclic) spans, until the set is stable -- the cyclic analogue
// of refineBounds, applied before the ring is rotated/pinned. A single corner
// is tested against the whole-ring span. Uses the same angle-coupled
// chord-straightness criterion as refineBounds (see bordersStraightRingSpan).
// Returns the surviving corners (a subset of @corners, order preserved); an empty
// result means the ring has no qualifying corner and should smooth cyclically.
function filterRingCornersByStructure(t, channels, n, corners, params) {
  var list = corners.slice();
  var changed = true;
  while (changed && list.length > 0) {
    changed = false;
    for (var i = 0; i < list.length; i++) {
      var cur = list[i];
      var leftStruct, rightStruct;
      if (list.length === 1) {
        leftStruct = rightStruct = bordersStraightRingSpan(t, channels, n, cur, cur, cur, params);
      } else {
        var prev = list[(i - 1 + list.length) % list.length];
        var next = list[(i + 1) % list.length];
        leftStruct = bordersStraightRingSpan(t, channels, n, cur, prev, cur, params);
        rightStruct = bordersStraightRingSpan(t, channels, n, cur, cur, next, params);
      }
      if (!leftStruct && !rightStruct) {
        list.splice(i, 1);
        changed = true;
        // As in refineBounds, only the removed corner's neighbours change, so
        // resume just before the removal (i-- via i-2) rather than restarting the
        // scan -- restarting is what made this O(corners^2) and hung on large
        // rings smoothed below their vertex spacing (~half the vertices read as
        // corners, nearly all culled). Cross-seam effects (the wrap between the
        // last and first corner) are picked up by the outer while(changed) pass.
        // The stable prefix is never revisited, so the surviving set matches a
        // from-scratch rescan exactly.
        i = i < 2 ? -1 : i - 2;
      }
    }
  }
  return list;
}

// Smooth a single open span [lo, hi] (inclusive) and pin both ends to their
// original coordinates. Reuses the whole-arc smoothing pipeline on the sub-arc.
function smoothSpanOpen(origX, origY, t, channels, lo, hi, ctx) {
  var nSub = hi - lo + 1;
  if (nSub < 3) return copySpan(origX, origY, lo, hi);
  var subT = new Float64Array(nSub);
  for (var k = 0; k < nSub; k++) subT[k] = t[lo + k] - t[lo];
  var subL = subT[nSub - 1];
  if (!(subL > 0)) return copySpan(origX, origY, lo, hi);
  var subCh = [];
  for (var c = 0; c < channels.length; c++) subCh.push(channels[c].slice(lo, hi + 1));
  var maxSourcePts = Math.max(nSub, MIN_CLOSED_SEGMENTS) * MAX_OUTPUT_FACTOR + nSub;
  var maxSpacing = Math.max(ctx.tol * SOURCE_SPACING_FACTOR, subL / maxSourcePts);
  var dense = densifyChannels(subT, subCh, maxSpacing);
  var src = buildSource(dense.t, dense.channels, false, ctx.radius, subL);
  var sm = sampleSmoothedCurve(src, 0, subL, false, ctx, nSub);
  var out = ctx.spherical ? xyzChannelsToLngLat(sm) : {xx: sm[0], yy: sm[1]};
  out.xx[0] = origX[lo];
  out.yy[0] = origY[lo];
  out.xx[out.xx.length - 1] = origX[hi];
  out.yy[out.yy.length - 1] = origY[hi];
  return out;
}

function smoothClosedCyclic(t, channels, n, ctx) {
  var L = t[n - 1];
  var maxSourcePts = Math.max(n, MIN_CLOSED_SEGMENTS) * MAX_OUTPUT_FACTOR + n;
  var maxSpacing = Math.max(ctx.tol * SOURCE_SPACING_FACTOR, L / maxSourcePts);
  var dense = densifyChannels(t, channels, maxSpacing);
  var src = buildSource(dense.t, dense.channels, true, ctx.radius, L);
  var sm = sampleSmoothedCurve(src, 0, L, true, ctx, n);
  // Smoothing shrinks a closed loop (curve-shortening); restore its original
  // enclosed area so small rings can be rounded at the full scale without
  // shrinking. A no-op for large rings (they lose negligible area).
  restoreRingArea(sm, channels, n, ctx.spherical);
  var out = ctx.spherical ? xyzChannelsToLngLat(sm) : {xx: sm[0], yy: sm[1]};
  // force an exactly closed ring (the periodic endpoints are equal up to fp)
  out.xx[out.xx.length - 1] = out.xx[0];
  out.yy[out.yy.length - 1] = out.yy[0];
  return out;
}

// Rescale a smoothed closed ring about its centroid so it re-encloses the
// original ring's area. Because it is a uniform similarity transform, the
// smoothed *shape* is unchanged -- only its size -- so the rounding introduced by
// smoothing is preserved while the curve-shortening shrinkage is undone.
// @sm are the smoothed smoothing channels (plain arrays; [x,y] planar or unit-
// sphere [X,Y,Z] spherical, last point == first). @orig are the original channels
// (length @n, closed). Silent no-op if either area is non-positive.
function restoreRingArea(sm, orig, n, spherical) {
  var origArea = ringChannelArea(orig, n, spherical);
  var m = sm[0].length;
  var smArea = ringChannelArea(sm, m, spherical);
  if (!(origArea > 0) || !(smArea > 0)) return;
  var f = Math.sqrt(origArea / smArea);
  if (spherical) {
    scaleRingSpherical(sm, m, f);
  } else {
    scaleRingPlanar(sm, m, f);
  }
}

// Enclosed-area proxy of a closed ring (@count points, last == first). Planar:
// the shoelace area on (x,y). Spherical: the shoelace area of the ring projected
// into the tangent plane at its centroid direction. Only ratios of two such
// areas are used, so the (unit-sphere) scale is irrelevant, and the tangent-plane
// error is second order in the ring's size -- negligible for the small rings
// where this is needed.
function ringChannelArea(ch, count, spherical) {
  if (!spherical) {
    var x = ch[0], y = ch[1], a = 0;
    for (var i = 0; i < count - 1; i++) a += x[i] * y[i + 1] - x[i + 1] * y[i];
    return Math.abs(a / 2);
  }
  var basis = tangentBasis(ringCentroidDir(ch, count - 1));
  var c = basis.c, ex = basis.ex, ey = basis.ey;
  var X = ch[0], Y = ch[1], Z = ch[2], area = 0, px, py, qx, qy;
  for (var j = 0; j < count - 1; j++) {
    px = X[j] * ex[0] + Y[j] * ex[1] + Z[j] * ex[2];
    py = X[j] * ey[0] + Y[j] * ey[1] + Z[j] * ey[2];
    qx = X[j + 1] * ex[0] + Y[j + 1] * ex[1] + Z[j + 1] * ex[2];
    qy = X[j + 1] * ey[0] + Y[j + 1] * ey[1] + Z[j + 1] * ey[2];
    area += px * qy - qx * py;
  }
  return Math.abs(area / 2);
}

function scaleRingPlanar(sm, count, f) {
  var x = sm[0], y = sm[1], cx = 0, cy = 0, i;
  for (i = 0; i < count - 1; i++) { cx += x[i]; cy += y[i]; }
  cx /= (count - 1); cy /= (count - 1);
  for (i = 0; i < count; i++) {
    x[i] = cx + (x[i] - cx) * f;
    y[i] = cy + (y[i] - cy) * f;
  }
}

// Scale each unit-sphere point's angular offset from the centroid direction by
// ~f (keeping the radial component, then renormalizing), which scales the
// enclosed area by ~f^2 for the small caps where this runs.
function scaleRingSpherical(sm, count, f) {
  var X = sm[0], Y = sm[1], Z = sm[2];
  var c = ringCentroidDir(sm, count - 1);
  for (var i = 0; i < count; i++) {
    var dot = X[i] * c[0] + Y[i] * c[1] + Z[i] * c[2];
    var tx = X[i] - dot * c[0], ty = Y[i] - dot * c[1], tz = Z[i] - dot * c[2];
    var vx = dot * c[0] + f * tx, vy = dot * c[1] + f * ty, vz = dot * c[2] + f * tz;
    var nrm = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    X[i] = vx / nrm; Y[i] = vy / nrm; Z[i] = vz / nrm;
  }
}

function ringCentroidDir(ch, m) {
  var X = ch[0], Y = ch[1], Z = ch[2], cx = 0, cy = 0, cz = 0;
  for (var i = 0; i < m; i++) { cx += X[i]; cy += Y[i]; cz += Z[i]; }
  var nrm = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
  return [cx / nrm, cy / nrm, cz / nrm];
}

// Orthonormal tangent basis (ex, ey) at unit direction c on the sphere.
function tangentBasis(c) {
  // pick the world axis least aligned with c to avoid a degenerate cross product
  var ax = Math.abs(c[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  var ex = cross(c, ax);
  var en = Math.sqrt(ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2]) || 1;
  ex = [ex[0] / en, ex[1] / en, ex[2] / en];
  var ey = cross(c, ex);
  return {c: c, ex: ex, ey: ey};
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function copySpan(origX, origY, lo, hi) {
  var xx = [], yy = [];
  for (var i = lo; i <= hi; i++) {
    xx.push(origX[i]);
    yy.push(origY[i]);
  }
  return {xx: xx, yy: yy};
}

function appendSpan(xx, yy, span, isFirst) {
  for (var i = isFirst ? 0 : 1; i < span.xx.length; i++) {
    xx.push(span.xx[i]);
    yy.push(span.yy[i]);
  }
}

// Reorder a closed ring's unique vertices to begin at index @c, re-appending the
// start vertex so the result is a closed open-path (first point repeated).
function rotateRing(xx, yy, n, c) {
  var m = n - 1;
  var ox = [], oy = [];
  for (var k = 0; k < m; k++) {
    var idx = (c + k) % m;
    ox.push(xx[idx]);
    oy.push(yy[idx]);
  }
  ox.push(xx[c]);
  oy.push(yy[c]);
  return {xx: ox, yy: oy, shift: c, m: m};
}

// Map ring-frame corner indices to interior positions in the rotated open frame.
// The corner the ring was rotated to becomes the (pinned) endpoint, so it is
// dropped from the interior list.
function mapRotatedCorners(corners, shift, m) {
  var out = [];
  for (var i = 0; i < corners.length; i++) {
    var pos = (corners[i] - shift + m) % m;
    if (pos > 0) out.push(pos);
  }
  out.sort(function(a, b) { return a - b; });
  return out;
}

function arcLengths(xx, yy, n, spherical) {
  var t = new Float64Array(n);
  var distFn = spherical ? geom.greatCircleDistance : geom.distance2D;
  for (var i = 1; i < n; i++) {
    t[i] = t[i - 1] + distFn(xx[i - 1], yy[i - 1], xx[i], yy[i]);
  }
  return t;
}

function lngLatToXYZChannels(lng, lat, n) {
  var X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), p = [];
  for (var i = 0; i < n; i++) {
    geom.lngLatToXYZ(lng[i], lat[i], p);
    X[i] = p[0];
    Y[i] = p[1];
    Z[i] = p[2];
  }
  return [X, Y, Z];
}

// Convert smoothed geocentric channels back to lng/lat. xyzToLngLat() projects
// each point radially onto the sphere, so the slightly-inside-the-sphere point
// produced by averaging maps back to a valid surface coordinate.
function xyzChannelsToLngLat(channels) {
  var X = channels[0], Y = channels[1], Z = channels[2], n = X.length;
  var xx = [], yy = [], p = [];
  for (var i = 0; i < n; i++) {
    geom.xyzToLngLat(X[i], Y[i], Z[i], p);
    xx.push(p[0]);
    yy.push(p[1]);
  }
  return {xx: xx, yy: yy};
}

// Insert linearly-interpolated samples so no gap between consecutive source
// points exceeds @maxSpacing. Interpolating in the smoothing channels keeps
// this representation-agnostic (for geocentric input the inserted points sit on
// the chord, negligibly below the surface at these spacings, and are
// renormalized on the way out). Endpoints (and the closing vertex of a ring)
// are preserved exactly.
function densifyChannels(t, channels, maxSpacing) {
  var n = t.length;
  var K = channels.length;
  var t2 = [];
  var c2 = [];
  for (var c = 0; c < K; c++) c2.push([]);
  for (var i = 0; i < n - 1; i++) {
    t2.push(t[i]);
    for (var a = 0; a < K; a++) c2[a].push(channels[a][i]);
    var seg = t[i + 1] - t[i];
    if (seg > maxSpacing) {
      var steps = Math.ceil(seg / maxSpacing);
      for (var s = 1; s < steps; s++) {
        var f = s / steps;
        t2.push(t[i] + seg * f);
        for (var b = 0; b < K; b++) {
          c2[b].push(channels[b][i] + (channels[b][i + 1] - channels[b][i]) * f);
        }
      }
    }
  }
  t2.push(t[n - 1]);
  for (var d = 0; d < K; d++) c2[d].push(channels[d][n - 1]);
  return {t: new Float64Array(t2), channels: c2, count: t2.length};
}

// Sample the smoothed curve over arc-length [a, b] and thin it (see the
// "Output resampling" note above). Step 1 evaluates the smoother at a uniform
// dense step; step 2 makes one forward pass keeping the endpoints plus every
// interior vertex where the accumulated turn since the last kept vertex reaches
// the bend-angle threshold, or where the sagitta guard trips. @inputCount bounds the dense
// sampling (and thus the output). Returns one array per channel, ordered by
// increasing arc length, including both endpoints.
function sampleSmoothedCurve(src, a, b, closed, ctx, inputCount) {
  var K = src.channels.length;
  var span = b - a;
  var maxPoints = Math.max(inputCount, MIN_CLOSED_SEGMENTS) * MAX_OUTPUT_FACTOR;

  // 1. dense uniform sampling of the smoothed curve
  var nDense = Math.ceil(span / ctx.denseStep) + 1;
  if (nDense < MIN_CLOSED_SEGMENTS + 1) nDense = MIN_CLOSED_SEGMENTS + 1;
  if (nDense > maxPoints) nDense = maxPoints;
  if (nDense < 2) nDense = 2;
  var P = new Array(nDense);
  for (var i = 0; i < nDense; i++) {
    P[i] = smoothAt(src, a + span * (i / (nDense - 1)), ctx);
  }

  // 2. one-pass bend-angle filter
  var theta = ctx.bendAngle;
  var epsDev = ctx.tol * DEVIATION_FACTOR;
  var out = [];
  for (var c = 0; c < K; c++) out.push([]);
  appendPoint(out, P[0], K);
  var anchor = 0;     // last kept vertex
  var accTurn = 0;    // absolute turning accumulated since the anchor
  for (var j = 1; j < nDense - 1; j++) {
    accTurn += vecAngle(P[j - 1], P[j], P[j], P[j + 1], K);
    // sagitta of a circular arc of chord c and total turn a is ~ c*a/8; cut a
    // long gentle bend before it bows more than epsDev from its chord
    var sagitta = chordLen(P[anchor], P[j + 1], K) * accTurn * 0.125;
    if (accTurn >= theta || sagitta >= epsDev) {
      appendPoint(out, P[j], K);
      anchor = j;
      accTurn = 0;
    }
  }
  appendPoint(out, P[nDense - 1], K);
  return out;
}

// Angle (radians) between vectors (b - a) and (d - c) over K channels.
function vecAngle(a, b, c, d, K) {
  var dot = 0, n1 = 0, n2 = 0;
  for (var i = 0; i < K; i++) {
    var u = b[i] - a[i];
    var v = d[i] - c[i];
    dot += u * v;
    n1 += u * u;
    n2 += v * v;
  }
  if (n1 <= 0 || n2 <= 0) return 0;
  var k = dot / Math.sqrt(n1 * n2);
  if (k > 1) k = 1;
  else if (k < -1) k = -1;
  return Math.acos(k);
}

function chordLen(a, b, K) {
  var s = 0;
  for (var c = 0; c < K; c++) {
    var d = b[c] - a[c];
    s += d * d;
  }
  return Math.sqrt(s);
}

// Evaluate the smoother at a single arc-length position by binary-searching the
// window of source samples within +/- radius of phi. Open sources are padded
// with odd reflections at each end (see buildSource), so the window is always
// full and symmetric -- no special boundary handling is needed here.
function smoothAt(src, phi, ctx) {
  var t = src.t, m = src.count;
  var lo = lowerBound(t, m, phi - ctx.radius);
  var hi = upperBound(t, m, phi + ctx.radius);
  return smoothPoint(t, src.channels, lo, hi, phi, ctx.method, ctx.scale, ctx.radius, ctx.gain);
}

// first index with t[i] >= x
function lowerBound(t, n, x) {
  var lo = 0, hi = n;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (t[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// first index with t[i] > x
function upperBound(t, n, x) {
  var lo = 0, hi = n;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (t[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function appendPoint(out, p, K) {
  for (var c = 0; c < K; c++) out[c].push(p[c]);
}

// Assemble the weighting samples for an arc, tagged with cumulative arc length.
//
// Open arcs are padded with odd (point) reflections of the samples within
// `radius` of each end: a sample at offset tau inside the end is mirrored to
// -tau with position 2*endpoint - sample. This keeps the smoothing window full
// and symmetric at the ends instead of one-sided. A one-sided window biases the
// result inward (it averages only interior neighbors), dragging the smoothed
// endpoint off a curving end; pinning it back then leaves a long, kinked final
// segment. With odd reflection each mirror pair averages back to the endpoint,
// so the endpoint is preserved *exactly* while detail right up to it is still
// fully smoothed, and the curve leaves the endpoint along a smooth tangent.
// (A straight run reflects to its own continuation, so straights stay straight.)
//
// Closed arcs are instead replicated across enough periods (each shifted by the
// perimeter length) that any query window wraps correctly around the ring.
function buildSource(t, channels, closed, radius, L) {
  var n = t.length;
  var K = channels.length;
  if (!closed) {
    return buildOpenSource(t, channels, n, K, radius, L);
  }
  var m = n - 1; // drop duplicated closing vertex; period is L
  var reps = Math.max(1, Math.ceil(radius / L));
  var et = [];
  var ec = [];
  for (var c = 0; c < K; c++) ec.push([]);
  for (var k = -reps; k <= reps; k++) {
    var off = k * L;
    for (var j = 0; j < m; j++) {
      et.push(t[j] + off);
      for (var c2 = 0; c2 < K; c2++) ec[c2].push(channels[c2][j]);
    }
  }
  return {t: et, channels: ec, count: et.length, totalLength: L, closed: true};
}

function buildOpenSource(t, channels, n, K, radius, L) {
  var et = [];
  var ec = [];
  for (var c = 0; c < K; c++) ec.push([]);
  // left odd-reflections (ascending t from ~-radius up to 0): walk interior
  // samples with t <= radius from the outermost inward so output stays sorted
  var leftEnd = upperBound(t, n, radius) - 1; // last index with t[i] <= radius
  for (var i = leftEnd; i >= 1; i--) {
    et.push(-t[i]);
    for (var c0 = 0; c0 < K; c0++) ec[c0].push(2 * channels[c0][0] - channels[c0][i]);
  }
  // originals
  for (var j = 0; j < n; j++) {
    et.push(t[j]);
    for (var c1 = 0; c1 < K; c1++) ec[c1].push(channels[c1][j]);
  }
  // right odd-reflections (ascending t just above L): nearest-to-L first
  for (var k = n - 2; k >= 0 && t[k] >= L - radius; k--) {
    et.push(2 * L - t[k]);
    for (var c2 = 0; c2 < K; c2++) ec[c2].push(2 * channels[c2][n - 1] - channels[c2][k]);
  }
  return {t: et, channels: ec, count: et.length, totalLength: L, closed: false};
}

// Both smoothing methods compute the smoothed coordinate as a local weighted
// least-squares fit of a second-degree polynomial in the normalized arc-length
// offset u = (t - phi)/scale, evaluated at u = 0 (the polynomial's constant
// term). The quadratic term lets the fit follow curvature, so the smoothed point
// is not pulled toward the chord on a bend the way a plain weighted average is.
// That is what keeps either method from shrinking the amplitude of supra-
// tolerance features. The methods differ only in the weight kernel (see
// kernelWeight): 'paek' is Bodansky et al.'s exponential-weighted quadratic (the
// algorithm ArcGIS uses); 'gaussian' is the Gaussian-weighted quadratic, i.e. a
// Savitzky-Golay smoother (a sharper frequency cutoff than paek, now with the
// same shrinkage correction). Normalizing by `scale` keeps the normal-equation
// matrix well-scaled regardless of the absolute tolerance. The fit is linear in
// the channel values, so for geocentric input the smoothed point stays in the
// plane of nearby vertices (a great-circle arc is preserved up to discretization).
// With too few points, or near-singular normal equations, falls back to the
// plain weighted average using the same kernel.
//
// Weights are tapered to reach zero at the window edge (|u| = radius/scale) by
// subtracting the edge weight: w = max(0, kernel(u) - kernel(uEdge)). Without
// this taper a source sample enters/leaves the moving window carrying a small
// but nonzero weight, and that discrete jump -- amplified by the quadratic fit --
// shows up as fine-scale jitter rendered as visible kinks. The taper is symmetric
// in |u|, so odd-reflection endpoint preservation is unaffected.
function smoothPoint(t, channels, lo, hi, phi, method, scale, radius, gain) {
  var gaussian = method == 'gaussian';
  // gain scales the quadratic (Savitzky-Golay) curvature correction relative to
  // the plain weighted moving average m: out = m + gain*(a0 - m). gain=0 leaves
  // the shrinking moving average, gain=1 is the fully corrected fit, and gain>1
  // exaggerates the curvature of bends.
  if (gain === 0 || hi - lo < 3) return weightedAverage(t, channels, lo, hi, phi, scale, radius, gaussian);
  var edgeW = kernelWeight(radius / scale, gaussian);
  var s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  var K = channels.length;
  var b0 = new Float64Array(K), b1 = new Float64Array(K), b2 = new Float64Array(K);
  for (var i = lo; i < hi; i++) {
    var u = (t[i] - phi) / scale;
    var w = kernelWeight(u, gaussian) - edgeW;
    if (w <= 0) continue;
    var wu = w * u;
    var wu2 = wu * u;
    s0 += w;
    s1 += wu;
    s2 += wu2;
    s3 += wu2 * u;
    s4 += wu2 * u * u;
    for (var c = 0; c < K; c++) {
      var v = channels[c][i];
      b0[c] += w * v;
      b1[c] += wu * v;
      b2[c] += wu2 * v;
    }
  }
  // det of the symmetric normal-equation matrix [[s0,s1,s2],[s1,s2,s3],[s2,s3,s4]]
  var c0 = s2 * s4 - s3 * s3;
  var c1 = s1 * s4 - s3 * s2;
  var c2 = s1 * s3 - s2 * s2;
  var det = s0 * c0 - s1 * c1 + s2 * c2;
  if (!(Math.abs(det) > 1e-9 * (s0 * s0 * s0 + 1))) {
    return weightedAverage(t, channels, lo, hi, phi, scale, radius, gaussian);
  }
  var out = new Array(K);
  for (var ch = 0; ch < K; ch++) {
    var a0 = solveConstantTerm(b0[ch], b1[ch], b2[ch], s1, s2, s3, s4, c0, det);
    var mean = b0[ch] / s0; // plain weighted moving average for this channel
    out[ch] = mean + gain * (a0 - mean);
  }
  return out;
}

// Smoothing kernel weight at normalized offset u: exponential e^(-|u|) for paek,
// Gaussian e^(-u^2/2) for the Savitzky-Golay gaussian method.
function kernelWeight(u, gaussian) {
  return gaussian ? Math.exp(-0.5 * u * u) : Math.exp(-Math.abs(u));
}

// Solve for the constant term a0 of the fitted quadratic via Cramer's rule
// (replace the first column of the normal matrix with the RHS [b0,b1,b2]).
function solveConstantTerm(b0, b1, b2, s1, s2, s3, s4, c0, det) {
  var detA = b0 * c0 - s1 * (b1 * s4 - s3 * b2) + s2 * (b1 * s3 - s2 * b2);
  return detA / det;
}

function weightedAverage(t, channels, lo, hi, phi, scale, radius, gaussian) {
  var K = channels.length;
  var edgeW = kernelWeight(radius / scale, gaussian);
  var wsum = 0;
  var sums = new Float64Array(K);
  for (var i = lo; i < hi; i++) {
    var w = kernelWeight((t[i] - phi) / scale, gaussian) - edgeW;
    if (w <= 0) continue;
    wsum += w;
    for (var c = 0; c < K; c++) sums[c] += w * channels[c][i];
  }
  if (!(wsum > 0)) return interpAlongSource(t, channels, lo, hi, phi);
  return scaleSums(sums, 1 / wsum, K);
}

// Fallback used when a window is empty or weights underflow: linearly
// interpolate the position on the source line at arc-length phi (using the
// samples bracketing the window). This keeps the output point on the line
// instead of snapping to a vertex, so sparse regions degrade gracefully to the
// original geometry without staircase artifacts.
function interpAlongSource(t, channels, lo, hi, phi) {
  var K = channels.length;
  var m = t.length;
  var i0 = (hi > lo ? lo : lo - 1);
  if (i0 < 0) i0 = 0;
  if (i0 > m - 1) i0 = m - 1;
  var i1 = i0 + 1;
  if (i1 > m - 1) i1 = m - 1;
  var out = new Array(K);
  if (i0 === i1 || t[i1] === t[i0]) {
    for (var c = 0; c < K; c++) out[c] = channels[c][i0];
    return out;
  }
  var f = (phi - t[i0]) / (t[i1] - t[i0]);
  if (f < 0) f = 0;
  else if (f > 1) f = 1;
  for (var ch = 0; ch < K; ch++) {
    out[ch] = channels[ch][i0] + (channels[ch][i1] - channels[ch][i0]) * f;
  }
  return out;
}

function scaleSums(sums, k, K) {
  var out = new Array(K);
  for (var c = 0; c < K; c++) out[c] = sums[c] * k;
  return out;
}

function toArray(arr) {
  var out = [];
  for (var i = 0, n = arr.length; i < n; i++) out.push(arr[i]);
  return out;
}
