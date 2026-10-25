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
// @opts.maxChange optional limit on how far any elevation can move from its
//   original value, in elevation units (not exaggerated)
// Returns a new Float32Array of elevations
export function featurePreservingSmooth(elev, valid, width, height, cellWidths, cellHeights, exaggeration, opts) {
  var o = opts || {};
  var rounds = o.rounds >= 0 ? o.rounds : 3;
  var radius = o.radius > 0 ? Math.round(o.radius) : DEFAULT_RADIUS;
  var cosT = Math.cos((o.threshold > 0 ? o.threshold : DEFAULT_THRESHOLD) * Math.PI / 180);
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
    sx = 8 * cellWidths[y];
    sy = 8 * cellHeights[y];
    for (x = 0; x < width; x++) {
      i = row + x;
      xm = x > 0 ? x - 1 : 0;
      xp = x < width - 1 ? x + 1 : x;
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
  var x, y, i, j, xx, yy, x0, x1, y0, y1, ax, ay, az, tx, ty, tz, dot, wt, len;
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
      tx = ty = tz = 0;
      for (yy = y0; yy <= y1; yy++) {
        for (xx = x0, j = yy * width + x0; xx <= x1; xx++, j++) {
          if (valid && !valid[j]) continue;
          dot = ax * nx[j] + ay * ny[j] + az * nz[j];
          if (dot <= cosT) continue;
          wt = (dot - cosT) * (dot - cosT);
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
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
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
        if (dot <= cosT) continue;
        wt = (dot - cosT) * (dot - cosT);
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
