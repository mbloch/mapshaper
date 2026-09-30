import { smoothPoint } from '../smooth/mapshaper-smooth-algos';

// Smooths a freehand ("pencil") stroke with a Gaussian kernel while it is
// being drawn, placing vertices one at a time, a little behind the pointer.
// Vertices never move once they are placed.
//
// The trace of the pointer samples is densified to even spacing and smoothed
// with the Gaussian kernel that -smooth uses, as a plain weighted average in
// arc length. (-smooth adds a quadratic correction that keeps bends from being
// flattened, but it lets through far more of the jitter of a slow stroke.) A
// smoothed point depends only on the trace within a window around it, so it
// is final as soon as the trace extends a window radius beyond it. At the
// start of the stroke the trace is extended by an odd reflection about its
// first point, which keeps the smoothed curve starting exactly there, and the
// end is treated the same way when the stroke is finished.
//
// Vertices are kept from the smoothed points where the curve has turned by a
// given angle since the last vertex, or where the chord from the last vertex
// would stray too far from a gentle curve -- the rule -smooth uses to space
// its output. So vertices are close together at bends and far apart on
// straight stretches, and they appear one at a time.
//
// Distances are in pixels. For samples in other units, the pixelSize option
// gives the size of a pixel in those units.

// Standard deviation of the smoothing kernel, in arc length. Below about 5px,
// the jitter of a slow stroke comes through; larger values round off bends a
// few pixels across.
var SIGMA = 8;

// Half-width of the smoothing window, in multiples of SIGMA. This is also how
// far the pointer has to be ahead of a smoothed point for it to be final.
var WINDOW_RADIUS = 3;

// Spacing of the densified trace, and of the smoothed points that are tested
// as vertices. Small enough that a bend of radius SIGMA turns by only a few
// degrees per step.
var SOURCE_STEP = 0.5;
var OUTPUT_STEP = 0.5;

// Greatest turn between consecutive segments of the output, and greatest
// distance of the output from the smoothed curve along gentle bends.
var BEND_ANGLE = 12;
var MAX_DEVIATION = 0.75;

// Least spacing of the pointer samples returned by getPreview().
var PREVIEW_SPACING = 2;

// start: [x, y] first sample
// opts: (optional) {sigma, bendAngle (degrees), maxDeviation, pixelSize}
export function GaussianStrokeFitter(start, opts) {
  var px = opts && opts.pixelSize > 0 ? opts.pixelSize : 1;
  var sigma = getOpt(opts, 'sigma', SIGMA) * px;
  var radius = sigma * WINDOW_RADIUS;
  var step = SOURCE_STEP * px;
  var outputStep = OUTPUT_STEP * px;
  var decimator = new BendDecimator(start, getOpt(opts, 'bendAngle', BEND_ANGLE) * Math.PI / 180,
    getOpt(opts, 'maxDeviation', MAX_DEVIATION) * px);
  var samples = [[start[0], start[1]]];
  var sampleT = [0]; // arc length of each sample along the trace, once known
  // the densified trace: arc length and coordinates
  var tt = [0], xx = [start[0]], yy = [start[1]];
  var traceLen = 0; // length of the densified part of the trace
  var nextT = step; // arc length of the next densified point
  var phi = outputStep; // arc length of the next smoothed point

  // Returns the vertices placed by the new sample, which may be none.
  this.addSample = function(p) {
    var n = samples.length;
    if (!isSample(p) || samePoint(p, samples[n - 1])) return [];
    samples.push([p[0], p[1]]);
    densifySegment(n - 1);
    return placeSmoothedPoints(traceLen - radius, false);
  };

  // Returns the vertices that complete the stroke, ending at the last sample.
  this.finish = function() {
    var n = samples.length, end, placed, p;
    if (n < 2) return [];
    end = samples[n - 1];
    if (tt[tt.length - 1] < traceLen) {
      tt.push(traceLen);
      xx.push(end[0]);
      yy.push(end[1]);
    }
    placed = placeSmoothedPoints(traceLen - outputStep / 2, true);
    p = decimator.push(end);
    if (p) placed.push(p);
    placed.push([end[0], end[1]]);
    return placed;
  };

  // Returns points to show between the last placed vertex and the pointer
  // (not including either): the latest smoothed point, followed by the pointer
  // samples beyond it.
  this.getPreview = function() {
    var out = [], last = null, cand = decimator.getCandidate(), i;
    if (cand) {
      out.push(cand);
      last = cand;
    }
    for (i = 1; i < samples.length - 1; i++) {
      if (sampleT[i] === undefined || sampleT[i] <= phi - outputStep) continue;
      if (last && distance(last, samples[i]) < PREVIEW_SPACING * px) continue;
      out.push(samples[i]);
      last = samples[i];
    }
    return out;
  };

  // Smooths the trace up to arc length @maxT and returns the vertices placed
  // from the smoothed points.
  function placeSmoothedPoints(maxT, atEnd) {
    var placed = [], p;
    for (; phi <= maxT; phi += outputStep) {
      p = decimator.push(smoothAt(phi, atEnd));
      if (p) placed.push(p);
    }
    return placed;
  }

  function smoothAt(t, atEnd) {
    var n = tt.length,
        lo = firstIndexAbove(t - radius),
        hi = firstIndexAbove(t + radius),
        wt = [], wx = [], wy = [], i;
    // odd reflection of the start of the trace
    for (i = Math.min(firstIndexAbove(radius - t), n) - 1; i > 0; i--) {
      wt.push(-tt[i]);
      wx.push(2 * xx[0] - xx[i]);
      wy.push(2 * yy[0] - yy[i]);
    }
    for (i = lo; i < hi; i++) {
      wt.push(tt[i]);
      wx.push(xx[i]);
      wy.push(yy[i]);
    }
    if (atEnd) {
      // odd reflection of the end of the trace
      for (i = n - 2; i >= 0 && 2 * traceLen - tt[i] < t + radius; i--) {
        wt.push(2 * traceLen - tt[i]);
        wx.push(2 * xx[n - 1] - xx[i]);
        wy.push(2 * yy[n - 1] - yy[i]);
      }
    }
    return smoothPoint(wt, [wx, wy], 0, wt.length, t, 'gaussian', sigma, radius, 0);
  }

  // first index of the trace with arc length > @t
  function firstIndexAbove(t) {
    var lo = 0, hi = tt.length, mid;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (tt[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // Adds points to the trace at even spacing from sample @i to the next one.
  function densifySegment(i) {
    var a = samples[i],
        b = samples[i + 1],
        len = distance(a, b),
        f;
    for (; nextT <= traceLen + len; nextT += step) {
      f = (nextT - traceLen) / len;
      tt.push(nextT);
      xx.push(a[0] + (b[0] - a[0]) * f);
      yy.push(a[1] + (b[1] - a[1]) * f);
    }
    traceLen += len;
    sampleT[i + 1] = traceLen;
  }
}

// Picks vertices from a stream of closely spaced points along a smooth curve,
// keeping a point once the curve has turned by @bendAngle (radians) since the
// last kept point, or once the chord from the last kept point would bow more
// than @maxDeviation from the curve (estimated as for a circular arc). This is
// the rule -smooth uses (decimateByBend() in mapshaper-smooth-algos.mjs),
// applied one point at a time.
export function BendDecimator(start, bendAngle, maxDeviation) {
  var kept = start, prev = start, candidate = null, turn = 0;

  // Returns the point before @p if it is kept, or null.
  this.push = function(p) {
    var out = null;
    if (candidate) {
      turn += getTurn(prev, candidate, p);
      if (turn >= bendAngle || distance(kept, p) * turn / 8 >= maxDeviation) {
        out = kept = candidate;
        turn = 0;
      }
      prev = candidate;
    }
    candidate = p;
    return out;
  };

  // The latest point, which has not been kept yet
  this.getCandidate = function() {
    return candidate;
  };
}

function getTurn(a, b, c) {
  var ux = b[0] - a[0], uy = b[1] - a[1],
      vx = c[0] - b[0], vy = c[1] - b[1],
      len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)),
      cos;
  if (!(len > 0)) return 0;
  cos = (ux * vx + uy * vy) / len;
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

function getOpt(opts, name, defaultVal) {
  return opts && opts[name] > 0 ? opts[name] : defaultVal;
}

function isSample(p) {
  return !!p && isFinite(p[0]) && isFinite(p[1]);
}

function samePoint(a, b) {
  return a[0] == b[0] && a[1] == b[1];
}

function distance(a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}
