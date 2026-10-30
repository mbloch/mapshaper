// Feature-preserving smoothing of elevation grids (Lindsay, Francioni &
// Cockburn 2019, after the mesh denoising method of Sun et al. 2007).
//
// Each round smooths the field of surface normals, averaging only normals
// that point in similar directions, then refits elevations to the smoothed
// normals. Slopes become cleaner planes, while abrupt changes of slope such
// as ridgelines and valley floors stay sharp, because normals on either side
// differ too much to be averaged together. A Gaussian blur, in contrast,
// rounds them off.
//
// Normals are measured on the exaggerated surface, so the angle threshold
// matches the slopes that the shading shows.
//
// @valid optional Uint8Array, 0 for pixels without an elevation

import { blurFloatChannel } from './mapshaper-raster-blur';

var DEFAULT_RADIUS = 4;
var DEFAULT_THRESHOLD = 20; // degrees
var DEFAULT_ITERATIONS = 5;
var DX = [-1, 0, 1, -1, 1, -1, 0, 1];
var DY = [-1, -1, -1, 0, 0, 1, 1, 1];

// @cellWidths, @cellHeights per-row ground size of a pixel, in elevation units
// @opts.rounds number of rounds (default 3)
// @opts.radius half-width of the normal-smoothing window, in pixels (default 4)
// @opts.threshold neighbors whose normals differ by more than this many
//   degrees are not averaged (default 20)
// @opts.thresholds optional Float32Array of per-pixel thresholds, in degrees,
//   used instead of @opts.threshold (see getSlopeThresholds())
// @opts.maxChange optional limit on how far any elevation can move from its
//   original value, in elevation units (not exaggerated)
// Returns a new Float32Array of elevations
export function featurePreservingSmooth(elev, valid, width, height, cellWidths, cellHeights, exaggeration, opts) {
  var o = opts || {};
  var rounds = o.rounds >= 0 ? o.rounds : 3;
  var radius = o.radius > 0 ? Math.round(o.radius) : DEFAULT_RADIUS;
  var cosT = o.thresholds ? toCosines(o.thresholds) :
    Math.cos((o.threshold > 0 ? o.threshold : DEFAULT_THRESHOLD) * Math.PI / 180);
  var iterations = o.iterations > 0 ? o.iterations : DEFAULT_ITERATIONS;
  var zf = exaggeration > 0 ? exaggeration : 1;
  var z = new Float32Array(elev.length);
  var i, r, normals;
  for (i = 0; i < z.length; i++) z[i] = elev[i] * zf;
  for (r = 0; r < rounds; r++) {
    normals = computeNormals(z, valid, width, height, cellWidths, cellHeights);
    normals = smoothNormals(normals, valid, width, height, radius, cosT);
    z = refitElevations(z, valid, width, height, cellWidths, cellHeights, normals, cosT, iterations);
    if (o.maxChange > 0) limitChange(z, elev, o.maxChange * zf, zf);
  }
  for (i = 0; i < z.length; i++) {
    z[i] = valid && !valid[i] ? elev[i] : z[i] / zf;
  }
  return z;
}

// Per-pixel FPS thresholds for dynamic smoothing: low in gentle terrain, where
// a shallow drainage's sides differ by only a few degrees, rising with the
// mean local slope to @o.max in steep terrain.
//   threshold = min(o.max, o.min + o.slopeFactor * mean slope)
// Slope is in degrees on the exaggerated surface, which is what the threshold
// is compared with, averaged by a Gaussian blur of @o.slopeRadius pixels.
// Averaging slope magnitudes, not elevations, keeps a mountain's opposing
// slopes from canceling out.
// Returns a Float32Array of thresholds in degrees
export function getSlopeThresholds(elev, valid, width, height, cellWidths, cellHeights, exaggeration, o) {
  var slope = getMeanSlope(elev, valid, width, height, cellWidths, cellHeights, exaggeration, o.slopeRadius);
  for (var i = 0; i < slope.length; i++) {
    slope[i] = Math.min(o.max, o.min + o.slopeFactor * slope[i]);
  }
  return slope;
}

function getMeanSlope(elev, valid, width, height, cellWidths, cellHeights, exaggeration, sigma) {
  var n = width * height;
  var slope = new Float32Array(n);
  var weights = new Float32Array(n);
  var toDegrees = 180 / Math.PI;
  var x, y, i, dx, dy, xm, xp, ym, yp, row;
  for (y = 0; y < height; y++) {
    ym = y > 0 ? y - 1 : y;
    yp = y < height - 1 ? y + 1 : y;
    row = y * width;
    for (x = 0; x < width; x++) {
      i = row + x;
      if (valid && !valid[i]) continue;
      xm = x > 0 ? x - 1 : x;
      xp = x < width - 1 ? x + 1 : x;
      dx = (sample(elev, valid, row + xp, elev[i]) - sample(elev, valid, row + xm, elev[i])) /
        ((xp - xm || 1) * cellWidths[y]);
      dy = (sample(elev, valid, yp * width + x, elev[i]) - sample(elev, valid, ym * width + x, elev[i])) /
        ((yp - ym || 1) * cellHeights[y]);
      slope[i] = Math.atan(exaggeration * Math.sqrt(dx * dx + dy * dy)) * toDegrees;
      weights[i] = 1;
    }
  }
  if (sigma > 0) blurFloatChannel(slope, weights, width, height, sigma);
  return slope;
}

// Stronger generalization: FPS on a copy of the grid averaged down 2x, which
// removes landforms smaller than about two pixels and doubles the ground reach
// of the window. The result is upsampled (Catmull-Rom), then given a
// full-resolution FPS pass, which re-sharpens crests that upsampling leaves
// jagged. Costs about as much as two full-resolution rounds.
// @coarseOpts, @fineOpts options for featurePreservingSmooth(); maxChange (from
//   either) is applied to the final result. Per-pixel coarseOpts.thresholds
//   are averaged down for the coarse pass and capped at fineOpts.threshold for
//   the full-resolution pass.
// @coarseOpts.blendRange optional [lo, hi]: where the per-pixel threshold is
//   below lo, use single-level FPS instead; above hi, the two-level result
// Returns a new Float32Array of elevations
export function twoLevelSmooth(elev, valid, width, height, cellWidths, cellHeights, exaggeration, coarseOpts, fineOpts) {
  var maxChange = coarseOpts.maxChange || fineOpts.maxChange;
  var c = downsampleElevations(elev, valid, width, height, cellWidths, cellHeights);
  var thresholds = coarseOpts.thresholds || null;
  var z = featurePreservingSmooth(c.elev, c.valid, c.width, c.height, c.cellWidths, c.cellHeights,
    exaggeration, Object.assign({}, coarseOpts, {maxChange: null,
      thresholds: thresholds ? downsampleElevations(thresholds, valid, width, height, cellWidths, cellHeights).elev : null}));
  z = upsampleElevations(z, c, elev, valid, width, height);
  z = featurePreservingSmooth(z, valid, width, height, cellWidths, cellHeights, exaggeration,
    Object.assign({}, fineOpts, {maxChange: null,
      thresholds: thresholds ? capThresholds(thresholds, fineOpts.threshold) : null}));
  if (thresholds && coarseOpts.blendRange) {
    blendWithSingleLevel(z, elev, valid, width, height, cellWidths, cellHeights, exaggeration,
      coarseOpts, thresholds);
  }
  if (maxChange > 0) limitChange(z, elev, maxChange, 1);
  return z;
}

// Averages 2x2 blocks of valid pixels. Blocks past the last row or column of
// an odd-sized grid are completed by linear extrapolation, so that each average
// stays centered on its block.
function downsampleElevations(elev, valid, width, height, cellWidths, cellHeights) {
  var w = Math.ceil(width / 2), h = Math.ceil(height / 2);
  var out = new Float32Array(w * h);
  var outValid = new Uint8Array(w * h);
  var widths = new Float64Array(h), heights = new Float64Array(h);
  var x, y, xx, yy, y0, v, sum, n;
  for (y = 0; y < h; y++) {
    y0 = y * 2;
    widths[y] = 2 * cellWidths[y0];
    heights[y] = 2 * cellHeights[y0];
    for (x = 0; x < w; x++) {
      sum = 0;
      n = 0;
      for (yy = y0; yy <= y0 + 1; yy++) {
        for (xx = x * 2; xx <= x * 2 + 1; xx++) {
          v = getBlockSample(elev, valid, width, height, xx, yy);
          if (v !== v) continue;
          sum += v;
          n++;
        }
      }
      if (n > 0) {
        out[y * w + x] = sum / n;
        outValid[y * w + x] = 1;
      }
    }
  }
  return {elev: out, valid: outValid, width: w, height: h, cellWidths: widths, cellHeights: heights};
}

// Returns NaN for pixels without data
function getBlockSample(elev, valid, width, height, x, y) {
  if (y == height) {
    return height > 1 ? extrapolate(getBlockSample(elev, valid, width, height, x, y - 1),
      getBlockSample(elev, valid, width, height, x, y - 2), 1) : NaN;
  }
  if (x == width) {
    return width > 1 ? extrapolate(getBlockSample(elev, valid, width, height, x - 1, y),
      getBlockSample(elev, valid, width, height, x - 2, y), 1) : NaN;
  }
  return valid && !valid[y * width + x] ? NaN : elev[y * width + x];
}

// Catmull-Rom interpolation of a 2x downsampled grid, aligned on pixel
// centers. Beyond the grid edges, values are extrapolated linearly, so tilted
// planes stay planar. Where the 4x4 neighborhood includes pixels without data,
// the value of the enclosing coarse pixel is used.
function upsampleElevations(z, coarse, elev, valid, width, height) {
  var cw = coarse.width, ch = coarse.height;
  var out = new Float32Array(width * height);
  var cols = new Int32Array(width), tx = new Float32Array(width);
  var r0, r1, r2, r3, x, y, i, u, v, iy, ty;
  for (x = 0; x < width; x++) {
    u = (x + 0.5) / 2 - 0.5;
    cols[x] = Math.floor(u);
    tx[x] = u - cols[x];
  }
  for (y = 0; y < height; y++) {
    v = (y + 0.5) / 2 - 0.5;
    iy = Math.floor(v);
    ty = v - iy;
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) {
        out[i] = elev[i];
        continue;
      }
      r0 = interpolateRow(z, coarse.valid, cw, ch, cols[x], iy - 1, tx[x]);
      r1 = interpolateRow(z, coarse.valid, cw, ch, cols[x], iy, tx[x]);
      r2 = interpolateRow(z, coarse.valid, cw, ch, cols[x], iy + 1, tx[x]);
      r3 = interpolateRow(z, coarse.valid, cw, ch, cols[x], iy + 2, tx[x]);
      out[i] = r0 === r0 && r1 === r1 && r2 === r2 && r3 === r3 ?
        catmullRom(r0, r1, r2, r3, ty) : z[(y >> 1) * cw + (x >> 1)];
    }
  }
  return out;
}

// Returns NaN if a pixel has no data
function interpolateRow(z, valid, w, h, x, y, t) {
  var a, b;
  if (h > 1 && (y < 0 || y >= h)) {
    a = y < 0 ? 0 : h - 1;
    b = y < 0 ? 1 : h - 2;
    return extrapolate(interpolateRow(z, valid, w, h, x, a, t),
      interpolateRow(z, valid, w, h, x, b, t), y < 0 ? -y : y - h + 1);
  }
  y = y < 0 ? 0 : y >= h ? h - 1 : y;
  return catmullRom(sampleRow(z, valid, w, y, x - 1), sampleRow(z, valid, w, y, x),
    sampleRow(z, valid, w, y, x + 1), sampleRow(z, valid, w, y, x + 2), t);
}

function sampleRow(z, valid, w, y, x) {
  var row = y * w, a, b;
  if (w > 1 && (x < 0 || x >= w)) {
    a = x < 0 ? 0 : w - 1;
    b = x < 0 ? 1 : w - 2;
    if (!valid[row + a] || !valid[row + b]) return NaN;
    return extrapolate(z[row + a], z[row + b], x < 0 ? -x : x - w + 1);
  }
  x = x < 0 ? 0 : x >= w ? w - 1 : x;
  return valid[row + x] ? z[row + x] : NaN;
}

// @edge value at the grid edge, @inner value one pixel inside it
function extrapolate(edge, inner, dist) {
  return edge + (edge - inner) * dist;
}

function catmullRom(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 +
    t * (3 * (p1 - p2) + p3 - p0)));
}

// Two-level smoothing averages away landforms a few pixels wide before any
// threshold can protect them, so gentle terrain, where thresholds are low,
// takes single-level FPS instead. The weight changes smoothly with the
// threshold, so the two results blend without seams.
function blendWithSingleLevel(z, elev, valid, width, height, cellWidths, cellHeights, exaggeration, opts, thresholds) {
  var lo = opts.blendRange[0], hi = opts.blendRange[1];
  var single = featurePreservingSmooth(elev, valid, width, height, cellWidths, cellHeights,
    exaggeration, Object.assign({}, opts, {maxChange: null}));
  var t;
  for (var i = 0; i < z.length; i++) {
    t = hi > lo ? (thresholds[i] - lo) / (hi - lo) : thresholds[i] >= hi ? 1 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    t = t * t * (3 - 2 * t);
    z[i] = single[i] + t * (z[i] - single[i]);
  }
}

function capThresholds(thresholds, max) {
  var out = new Float32Array(thresholds.length);
  for (var i = 0; i < out.length; i++) out[i] = Math.min(thresholds[i], max);
  return out;
}

function toCosines(degrees) {
  var out = new Float32Array(degrees.length);
  for (var i = 0; i < degrees.length; i++) out[i] = Math.cos(degrees[i] * Math.PI / 180);
  return out;
}

function limitChange(z, elev, maxChange, zf) {
  var i, orig;
  for (i = 0; i < z.length; i++) {
    orig = elev[i] * zf;
    if (z[i] > orig + maxChange) z[i] = orig + maxChange;
    else if (z[i] < orig - maxChange) z[i] = orig - maxChange;
  }
}

// Unit normals from Horn's gradient, in a frame with x east and y south
function computeNormals(z, valid, width, height, cellWidths, cellHeights) {
  var n = width * height;
  var nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n);
  var x, y, i, ym, yp, xm, xp, row, c, sx, sy, dzdx, dzdy, len;
  for (y = 0; y < height; y++) {
    ym = (y > 0 ? y - 1 : 0) * width;
    yp = (y < height - 1 ? y + 1 : y) * width;
    row = y * width;
    // edge pixels use one-sided differences, over a span of one pixel
    sy = 4 * cellHeights[y] * ((yp - ym) / width || 1);
    for (x = 0; x < width; x++) {
      i = row + x;
      xm = x > 0 ? x - 1 : 0;
      xp = x < width - 1 ? x + 1 : x;
      sx = 4 * cellWidths[y] * (xp - xm || 1);
      c = z[i];
      dzdx = (sample(z, valid, ym + xp, c) + 2 * sample(z, valid, row + xp, c) + sample(z, valid, yp + xp, c) -
        sample(z, valid, ym + xm, c) - 2 * sample(z, valid, row + xm, c) - sample(z, valid, yp + xm, c)) / sx;
      dzdy = (sample(z, valid, yp + xm, c) + 2 * sample(z, valid, yp + x, c) + sample(z, valid, yp + xp, c) -
        sample(z, valid, ym + xm, c) - 2 * sample(z, valid, ym + x, c) - sample(z, valid, ym + xp, c)) / sy;
      len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      nx[i] = -dzdx / len;
      ny[i] = -dzdy / len;
      nz[i] = 1 / len;
    }
  }
  return {nx: nx, ny: ny, nz: nz};
}

function sample(z, valid, i, fallback) {
  return valid && !valid[i] ? fallback : z[i];
}

// Averages each normal with similar normals in a square window, weighting by
// similarity. Windows that are entirely flat (e.g. a sea flattened with
// min-elevation=) are skipped, since the result is known.
function smoothNormals(normals, valid, width, height, radius, cosT) {
  var n = width * height;
  var nx = normals.nx, ny = normals.ny, nz = normals.nz;
  var ox = new Float32Array(n), oy = new Float32Array(n), oz = new Float32Array(n);
  var counts = getNonFlatCounts(nz, width, height);
  var sw = width + 1;
  var x, y, i, j, xx, yy, x0, x1, y0, y1, ax, ay, az, tx, ty, tz, dot, wt, len, c;
  var cosArr = typeof cosT == 'number' ? null : cosT;
  c = cosT;
  for (y = 0; y < height; y++) {
    y0 = Math.max(0, y - radius);
    y1 = Math.min(height - 1, y + radius);
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
      x0 = Math.max(0, x - radius);
      x1 = Math.min(width - 1, x + radius);
      if (counts[(y1 + 1) * sw + x1 + 1] - counts[y0 * sw + x1 + 1] -
          counts[(y1 + 1) * sw + x0] + counts[y0 * sw + x0] === 0) {
        oz[i] = 1;
        continue;
      }
      ax = nx[i];
      ay = ny[i];
      az = nz[i];
      if (cosArr) c = cosArr[i];
      tx = ty = tz = 0;
      for (yy = y0; yy <= y1; yy++) {
        for (xx = x0, j = yy * width + x0; xx <= x1; xx++, j++) {
          if (valid && !valid[j]) continue;
          dot = ax * nx[j] + ay * ny[j] + az * nz[j];
          if (dot <= c) continue;
          wt = (dot - c) * (dot - c);
          tx += wt * nx[j];
          ty += wt * ny[j];
          tz += wt * nz[j];
        }
      }
      len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      ox[i] = tx / len;
      oy[i] = ty / len;
      oz[i] = tz / len;
    }
  }
  return {nx: ox, ny: oy, nz: oz};
}

// Summed-area table of pixels whose normal is not vertical
function getNonFlatCounts(nz, width, height) {
  var sw = width + 1;
  var sat = new Int32Array(sw * (height + 1));
  var x, y;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      sat[(y + 1) * sw + x + 1] = (nz[y * width + x] < 1 ? 1 : 0) +
        sat[y * sw + x + 1] + sat[(y + 1) * sw + x] - sat[y * sw + x];
    }
  }
  return sat;
}

// Moves each elevation toward the heights predicted for it by the planes of
// its neighbors (through each neighbor, perpendicular to its smoothed
// normal), weighted by how similar the two normals are. The normals are
// fixed for the round, so the weights and plane offsets are computed once.
function refitElevations(z, valid, width, height, cellWidths, cellHeights, normals, cosT, iterations) {
  var n = width * height;
  var nx = normals.nx, ny = normals.ny, nz = normals.nz;
  var neighbors = new Int32Array(n * 8).fill(-1);
  var weights = new Float32Array(n * 8);
  var offsets = new Float32Array(n);
  var active = new Uint8Array(n);
  var cur = Float32Array.from(z);
  var next = new Float32Array(n);
  var x, y, i, j, k, b, xx, yy, dot, wt, wsum, osum, ex, ey, s, it, tmp;
  var cosArr = typeof cosT == 'number' ? null : cosT;
  var c = cosT;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
      if (cosArr) c = cosArr[i];
      b = i * 8;
      wsum = 0;
      osum = 0;
      for (k = 0; k < 8; k++) {
        xx = x + DX[k];
        yy = y + DY[k];
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
        j = yy * width + xx;
        if (valid && !valid[j]) continue;
        dot = nx[i] * nx[j] + ny[i] * ny[j] + nz[i] * nz[j];
        if (dot <= c) continue;
        wt = (dot - c) * (dot - c);
        // offset from the neighbor to this pixel (x east, y south)
        ex = -DX[k] * cellWidths[y];
        ey = -DY[k] * cellHeights[y];
        neighbors[b + k] = j;
        weights[b + k] = wt;
        wsum += wt;
        osum -= wt * (nx[j] * ex + ny[j] * ey) / nz[j];
      }
      if (wsum > 0) {
        for (k = 0; k < 8; k++) weights[b + k] /= wsum;
        offsets[i] = osum / wsum;
        active[i] = 1;
      }
    }
  }
  for (it = 0; it < iterations; it++) {
    for (i = 0; i < n; i++) {
      if (!active[i]) {
        next[i] = cur[i];
        continue;
      }
      b = i * 8;
      s = offsets[i];
      for (k = 0; k < 8; k++) {
        j = neighbors[b + k];
        if (j >= 0) s += weights[b + k] * cur[j];
      }
      next[i] = s;
    }
    tmp = cur;
    cur = next;
    next = tmp;
  }
  return cur;
}
