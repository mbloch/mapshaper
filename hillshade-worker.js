(function () {

  // Gaussian-like blurs of Float32 channels, as repeated box blurs. This module
  // has no imports, so that the hillshade worker bundle stays small.

  var BOX_BLUR_PASSES = 3;

  // Gaussian-like blur of a single Float32 channel, in place.
  // @weights optional per-pixel weights (0 for invalid pixels), or null
  // @sigma standard deviation in pixels
  function blurFloatChannel(channel, weights, width, height, sigma) {
    if (!(sigma > 0)) return channel;
    var tmp = new Float32Array(width * height);
    blurChannel(channel, tmp, weights, width, height, getGaussianBoxWidths(sigma, BOX_BLUR_PASSES));
    return channel;
  }

  // Convert a Gaussian sigma to box widths using the method described by
  // Ivan Kutskir / Peter Kovesi. Three box passes are a close, fast approximation.
  function getGaussianBoxWidths(sigma, n) {
    var ideal = Math.sqrt((12 * sigma * sigma / n) + 1);
    var wl = Math.floor(ideal);
    if (wl % 2 === 0) wl--;
    var wu = wl + 2;
    var m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    var boxes = [];
    for (var i = 0; i < n; i++) {
      boxes.push(i < m ? wl : wu);
    }
    return boxes;
  }

  function blurChannel(channel, tmp, weights, width, height, boxes) {
    boxes.forEach(function(widthPx) {
      var radius = Math.floor((widthPx - 1) / 2);
      if (radius < 1) return;
      if (weights) {
        boxBlurWeighted(channel, tmp, weights, width, height, radius);
      } else {
        boxBlur(channel, tmp, width, height, radius);
      }
    });
  }

  function boxBlur(src, tmp, width, height, radius) {
    boxBlurHorizontal(src, tmp, width, height, radius);
    boxBlurVertical(tmp, src, width, height, radius);
  }

  function boxBlurHorizontal(src, dest, width, height, radius) {
    var size = radius * 2 + 1;
    var x, y, row, sum;
    for (y = 0; y < height; y++) {
      row = y * width;
      sum = src[row] * (radius + 1);
      for (x = 1; x <= radius; x++) sum += src[row + Math.min(width - 1, x)];
      for (x = 0; x < width; x++) {
        dest[row + x] = sum / size;
        sum += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
      }
    }
  }

  function boxBlurVertical(src, dest, width, height, radius) {
    var size = radius * 2 + 1;
    var x, y, sum;
    for (x = 0; x < width; x++) {
      sum = src[x] * (radius + 1);
      for (y = 1; y <= radius; y++) sum += src[Math.min(height - 1, y) * width + x];
      for (y = 0; y < height; y++) {
        dest[y * width + x] = sum / size;
        sum += src[Math.min(height - 1, y + radius + 1) * width + x] - src[Math.max(0, y - radius) * width + x];
      }
    }
  }

  function boxBlurWeighted(src, tmp, weights, width, height, radius) {
    boxBlurHorizontalWeighted(src, tmp, weights, width, height, radius);
    boxBlurVerticalWeighted(tmp, src, weights, width, height, radius);
  }

  function boxBlurHorizontalWeighted(src, dest, weights, width, height, radius) {
    var x, y, row, id, addId, subId, sum, weightSum;
    for (y = 0; y < height; y++) {
      row = y * width;
      sum = src[row] * weights[row] * (radius + 1);
      weightSum = weights[row] * (radius + 1);
      for (x = 1; x <= radius; x++) {
        id = row + Math.min(width - 1, x);
        sum += src[id] * weights[id];
        weightSum += weights[id];
      }
      for (x = 0; x < width; x++) {
        id = row + x;
        dest[id] = weightSum > 0 ? sum / weightSum : src[id];
        addId = row + Math.min(width - 1, x + radius + 1);
        subId = row + Math.max(0, x - radius);
        sum += src[addId] * weights[addId] - src[subId] * weights[subId];
        weightSum += weights[addId] - weights[subId];
      }
    }
  }

  function boxBlurVerticalWeighted(src, dest, weights, width, height, radius) {
    var x, y, id, addId, subId, sum, weightSum;
    for (x = 0; x < width; x++) {
      sum = src[x] * weights[x] * (radius + 1);
      weightSum = weights[x] * (radius + 1);
      for (y = 1; y <= radius; y++) {
        id = Math.min(height - 1, y) * width + x;
        sum += src[id] * weights[id];
        weightSum += weights[id];
      }
      for (y = 0; y < height; y++) {
        id = y * width + x;
        dest[id] = weightSum > 0 ? sum / weightSum : src[id];
        addId = Math.min(height - 1, y + radius + 1) * width + x;
        subId = Math.max(0, y - radius) * width + x;
        sum += src[addId] * weights[addId] - src[subId] * weights[subId];
        weightSum += weights[addId] - weights[subId];
      }
    }
  }

  var DEFAULT_MAX_OPACITY = 0.55;
  var DEFAULT_GAMMA = 0.7;
  var DEFAULT_HIGHLIGHT_RATIO = 1;
  // Where the shadow style's tone curve puts flat ground, as a share of the
  // lightness from full shadow to the brightest highlight (see getToneCurves()).
  // Fixed, so that highlights= and max-opacity= scale the tones without
  // changing the curve's shape.
  var SHADOW_STYLE_BASE_POSITION = 2 / 3;
  // ambient= darkening per unit of weight, as a share of the max opacity;
  // chosen so that the default keeps about the valley shadows of the earlier
  // version, which darkened the shading instead of the tones
  var AMBIENT_TONE_SCALE = 2;
  // How much more ambient= takes from highlights than from shadows and flat
  // ground, as if sky light were a larger share of the light. A highlight spans
  // less shading per unit of opacity than a shadow, so 1 takes about 2.4 times
  // less light from sunlit slopes than from shaded ones; about 2.4 takes the same
  // amount, which grays out sunlit valleys.
  var AMBIENT_HIGHLIGHT_FACTOR = 1.8;

  // Returns brightness values, scaled so that flat ground is 1, lit slopes are
  // brighter and shaded slopes darker (0 is fully shaded).
  // @elev Float32Array of elevations
  // @cellWidths, @cellHeights per-row ground size of a pixel, in elevation units
  // @lights from getHillshadeLights()
  // @azimuthOffsets optional Float32Array, per-pixel rotation of every light, in
  //   radians clockwise (see computeLightAdjustment())
  function computeHillshade(elev, valid, width, height, cellWidths, cellHeights, lights, exaggeration, azimuthOffsets) {
    var out = new Float32Array(width * height);
    var zf = exaggeration > 0 ? exaggeration : 1;
    var flat = 0;
    var prepared = lights.map(function(light) {
      var zenith = (90 - light.altitude) * Math.PI / 180;
      // mathematical angle of the direction the light comes from
      var az = (360 - light.azimuth + 90) * Math.PI / 180;
      flat += light.weight * Math.cos(zenith);
      return {
        cosZ: Math.cos(zenith) * light.weight,
        sinZ: Math.sin(zenith) * light.weight,
        cosAz: Math.cos(az),
        sinAz: Math.sin(az)
      };
    });
    var n = prepared.length;
    var y, x, i, ym, yp, xm, xp, c, a, b, cc, d, f, g, h, k;
    var dzdx, dzdy, slope2, cosSlope, sinSlope, aspectCos, aspectSin, mag, sum, p, j;
    var cd, sd, rc;
    for (y = 0; y < height; y++) {
      ym = (y > 0 ? y - 1 : 0) * width;
      yp = (y < height - 1 ? y + 1 : y) * width;
      var row = y * width;
      var sx = 8 * cellWidths[y] / zf;
      var sy = 8 * cellHeights[y] / zf;
      for (x = 0; x < width; x++) {
        i = row + x;
        if (valid && !valid[i]) continue;
        xm = x > 0 ? x - 1 : 0;
        xp = x < width - 1 ? x + 1 : x;
        c = elev[i];
        a = neighbor(ym + xm);
        b = neighbor(ym + x);
        cc = neighbor(ym + xp);
        d = neighbor(row + xm);
        f = neighbor(row + xp);
        g = neighbor(yp + xm);
        h = neighbor(yp + x);
        k = neighbor(yp + xp);
        // Horn's method; y increases downward (south) in the grid
        dzdx = ((cc + 2 * f + k) - (a + 2 * d + g)) / sx;
        dzdy = ((g + 2 * h + k) - (a + 2 * b + cc)) / sy;
        slope2 = dzdx * dzdx + dzdy * dzdy;
        cosSlope = 1 / Math.sqrt(1 + slope2);
        sinSlope = Math.sqrt(slope2) * cosSlope;
        mag = Math.sqrt(slope2);
        // aspect = atan2(dzdy, -dzdx), used through its cosine and sine
        aspectCos = mag > 0 ? -dzdx / mag : 0;
        aspectSin = mag > 0 ? dzdy / mag : 0;
        sum = 0;
        if (azimuthOffsets) {
          // a clockwise rotation lowers the mathematical angle of each light
          cd = Math.cos(azimuthOffsets[i]);
          sd = Math.sin(azimuthOffsets[i]);
          rc = aspectCos * cd - aspectSin * sd;
          aspectSin = aspectSin * cd + aspectCos * sd;
          aspectCos = rc;
        }
        for (j = 0; j < n; j++) {
          p = prepared[j];
          // cos(az - aspect) = cos(az)cos(aspect) + sin(az)sin(aspect)
          var v = p.cosZ * cosSlope + p.sinZ * sinSlope * (p.cosAz * aspectCos + p.sinAz * aspectSin);
          if (v > 0) sum += v;
        }
        out[i] = flat > 0 ? sum / flat : 0;
      }
    }
    return out;

    function neighbor(id) {
      return valid && !valid[id] ? c : elev[id];
    }
  }

  function getDefaultMaxOpacity(style) {
    return style == 'opaque' ? 1 : DEFAULT_MAX_OPACITY;
  }

  function getDefaultHighlightRatio() {
    return DEFAULT_HIGHLIGHT_RATIO;
  }

  // Opacity of the darkest shadows, as getHillshadeTones() uses it
  function getToneMaxOpacity(style, opts) {
    var o = opts || {};
    if (style == 'opaque') return 1;
    return o.maxOpacity >= 0 ? Math.min(1, o.maxOpacity) : getDefaultMaxOpacity(style);
  }

  // Applies the tone curve to shading (see getToneCurves()). Tones are signed
  // opacities: negative for shadows, positive for highlights, 0 on flat ground.
  // @style 'shadow' or 'opaque'; opaque tones run from -1 to 1, the ends of the
  //   color ramp, and ignore the opacities
  // @opts.maxOpacity 0-1, opacity of the darkest shadows
  // @opts.highlightRatio opacity of the brightest highlights, as a fraction of
  //   maxOpacity; the result is capped at 1
  // @opts.gamma steepness of the tone curve at flat ground
  // @opts.maxShade shade of the brightest slope, which gets the full highlight
  //   (see getHillshadeMaxShade()); without it there are no highlights
  // @opts.basePosition for the opaque style: where the base color is on the
  //   ramp, as a share of its lightness (see getHillshadeBasePosition())
  function getHillshadeTones(shade, valid, style, opts) {
    var o = opts || {};
    var n = shade.length;
    var tones = new Float32Array(n);
    var opaque = style == 'opaque';
    var maxOpacity = getToneMaxOpacity(style, o);
    var ratio = opaque ? 1 : o.highlightRatio >= 0 ? o.highlightRatio : getDefaultHighlightRatio();
    var maxHighlight = Math.min(1, maxOpacity * ratio);
    var gamma = o.gamma > 0 ? o.gamma : DEFAULT_GAMMA;
    var litRange = o.maxShade > 1 ? o.maxShade - 1 : 0;
    var curves = getToneCurves(o.maxShade > 1 ? o.maxShade : 1, gamma,
      opaque ? o.basePosition : SHADOW_STYLE_BASE_POSITION);
    var shadowCurve = curves.shadow;
    var highlightCurve = curves.highlight;
    var i, s;
    for (i = 0; i < n; i++) {
      if (valid && !valid[i]) continue;
      s = shade[i];
      if (s < 1) {
        tones[i] = -shadowCurve(1 - s) * maxOpacity;
      } else if (s > 1 && litRange > 0) {
        tones[i] = highlightCurve((s - 1) / litRange) * maxHighlight;
      }
    }
    return tones;
  }

  // The tone curve: lightness is a cubic spline of the angle between a slope and
  // the brightest slope, falling from the highlight color at 0 degrees to the
  // base color on flat ground to the shadow color at 90 degrees, with flat ends.
  // Lightness changes at the same rate on both sides of flat ground, so the edge
  // between highlights and shadows is soft, where a curve that starts steeply
  // at flat ground concentrates contrast there in a visible ring. That rate is the average rate (the whole lightness range over 90 degrees)
  // divided by gamma, so gamma 1 is even, and lower gammas give more contrast to
  // gentle slopes. The rate is capped where the spline would stop falling
  // steadily.
  // @maxShade see getHillshadeMaxShade()
  // @basePosition 0-1, lightness of flat ground, as a share of the range from
  //   the darkest shadow to the brightest highlight (default 0.8)
  // Returns {shadow, highlight}: functions of the inputs of getHillshadeTones()'
  //   curves, 1 - shade and (shade - 1) / (maxShade - 1)
  function getToneCurves(maxShade, gamma, basePosition) {
    var b = basePosition >= 0 ? Math.min(0.95, Math.max(0.05, basePosition)) : 0.8;
    var flatAngle = Math.acos(1 / maxShade) * 180 / Math.PI;
    var rate = 1 / 90 / gamma;
    if (flatAngle > 0) rate = Math.min(rate, 3 * (1 - b) / flatAngle);
    rate = Math.min(rate, 3 * b / (90 - flatAngle));
    var lightness = function(s) {
      var deg = Math.acos(Math.min(1, s / maxShade)) * 180 / Math.PI;
      if (deg >= 90) return 0;
      return deg < flatAngle ?
        getHermiteValue(deg / flatAngle, 1, 0, b, -rate * flatAngle) :
        getHermiteValue((deg - flatAngle) / (90 - flatAngle), b, -rate * (90 - flatAngle), 0, 0);
    };
    return {
      shadow: getTabulatedCurve(function(d) {
        return Math.max(0, (b - lightness(1 - d)) / b);
      }),
      highlight: getTabulatedCurve(function(t) {
        return Math.max(0, (lightness(1 + t * (maxShade - 1)) - b) / (1 - b));
      })
    };
  }

  // Cubic Hermite interpolation at @t (0-1) between values @y0 and @y1, with
  // slopes @m0 and @m1 per unit of @t
  function getHermiteValue(t, y0, m0, y1, m1) {
    var t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  }

  // Returns a function mapping 0-1 to 0-1. Curves are tabulated because
  // computing them for every pixel is slow.
  function getTabulatedCurve(f) {
    var steps = 1024;
    var table = new Float32Array(steps + 1);
    for (var i = 0; i <= steps; i++) {
      table[i] = f(i / steps);
    }
    return function(d) {
      var x = (d > 1 ? 1 : d) * steps;
      var i = Math.floor(x);
      return i >= steps ? table[steps] : table[i] + (table[i + 1] - table[i]) * (x - i);
    };
  }

  // After smoothing: resets pixels that were at @min before smoothing (smoothing
  // spreads land into them, which would shade a flat sea). Other pixels may
  // sink at most halfway to @min, so the coastline stays put: FPS can carry a
  // coastal slope down past sea level, and clamping those pixels to @min made
  // the sea spread over low-lying land.
  // @before elevations before smoothing, after raiseLowElevations()
  function restoreLowElevations(elev, before, valid, min) {
    var b;
    for (var i = 0; i < elev.length; i++) {
      if (valid && !valid[i]) continue;
      b = before[i];
      elev[i] = b <= min ? min : Math.max(elev[i], min + (b - min) / 2);
    }
  }

  // Local adjustment of the light direction, after the Swiss manual technique:
  // the light turns toward the perpendicular of the dominant landform
  // orientation, so that ridges and valleys of any orientation get one lit
  // and one shaded side. A fixed light leaves features parallel to it flat.
  //
  // The dominant orientation is the main axis of the structure tensor (the
  // averaged outer product of the gradient), which treats the opposite-facing
  // flanks of a ridge as the same axis. Adjustment is scaled by the tensor's
  // coherence, so it fades out where there is no consistent orientation.
  //
  // @azimuth main light azimuth, in degrees
  // @maxAdjust largest rotation, in degrees (up to 60)
  // @sigma scale of the landforms that set the orientation, in pixels
  // Returns a Float32Array of clockwise rotations, in radians
  function computeLightAdjustment(elev, valid, width, height, azimuth, maxAdjust, sigma) {
    var n = width * height;
    var weights = valid ? toWeights(valid) : null;
    var jxx = new Float32Array(n), jxy = new Float32Array(n), jyy = new Float32Array(n);
    var out = new Float32Array(n);
    var max = Math.min(60, Math.max(0, maxAdjust));
    var x, y, i, gx, gy, a, b, c, axis, delta, mag, coherence, f;
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        i = y * width + x;
        if (valid && !valid[i]) continue;
        // central differences, in pixel units (only the direction matters);
        // gy points north
        gx = elevAt(elev, valid, width, height, x + 1, y, elev[i]) - elevAt(elev, valid, width, height, x - 1, y, elev[i]);
        gy = elevAt(elev, valid, width, height, x, y - 1, elev[i]) - elevAt(elev, valid, width, height, x, y + 1, elev[i]);
        jxx[i] = gx * gx;
        jxy[i] = gx * gy;
        jyy[i] = gy * gy;
      }
    }
    blurFloatChannel(jxx, weights, width, height, sigma);
    blurFloatChannel(jxy, weights, width, height, sigma);
    blurFloatChannel(jyy, weights, width, height, sigma);
    for (i = 0; i < n; i++) {
      if (valid && !valid[i]) continue;
      a = jxx[i];
      b = jxy[i];
      c = jyy[i];
      if (!(a + c > 0)) continue;
      mag = Math.sqrt((a - c) * (a - c) + 4 * b * b);
      coherence = mag / (a + c);
      // compass azimuth of the dominant gradient axis
      axis = 90 - 0.5 * Math.atan2(2 * b, a - c) * 180 / Math.PI;
      delta = ((axis - azimuth) % 180 + 270) % 180 - 90; // -90 to 90
      // Full adjustment up to @max, falling to 0 at 90 degrees, where the two
      // possible directions of rotation meet (otherwise the light would flip
      // between them)
      f = Math.min(Math.abs(delta), max * (90 - Math.abs(delta)) / (90 - max));
      out[i] = (delta < 0 ? -f : f) * coherence * Math.PI / 180;
    }
    return out;
  }

  function elevAt(elev, valid, width, height, x, y, fallback) {
    var i;
    if (x < 0 || y < 0 || x >= width || y >= height) return fallback;
    i = y * width + x;
    return valid && !valid[i] ? fallback : elev[i];
  }

  // Ambient light that varies with how open the terrain is to the sky: lower
  // in valleys and hollows, higher on ridges and summits, regardless of the
  // light direction. Approximates the sky-view factor by finding the highest
  // horizon angle in 8 directions, out to @radius pixels.
  // @cellWidths, @cellHeights per-row ground size of a pixel, in elevation units
  // Returns brightness values on the same scale as computeHillshade(): flat
  // open ground is 1
  function computeOpenness(elev, valid, width, height, cellWidths, cellHeights, exaggeration, radius) {
    var n = width * height;
    var out = new Float32Array(n);
    var zf = exaggeration > 0 ? exaggeration : 1;
    var steps = getOpennessSteps(radius);
    var dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    var x, y, i, d, s, k, xx, yy, j, z0, maxTan, t, dist, sum, cw, ch, unit;
    for (y = 0; y < height; y++) {
      cw = cellWidths[y];
      ch = cellHeights[y];
      for (x = 0; x < width; x++) {
        i = y * width + x;
        if (valid && !valid[i]) continue;
        z0 = elev[i];
        sum = 0;
        for (d = 0; d < 8; d++) {
          unit = Math.sqrt(dirs[d][0] * dirs[d][0] * cw * cw + dirs[d][1] * dirs[d][1] * ch * ch);
          maxTan = -Infinity;
          for (s = 0; s < steps.length; s++) {
            k = steps[s];
            xx = x + dirs[d][0] * k;
            yy = y + dirs[d][1] * k;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) break;
            j = yy * width + xx;
            if (valid && !valid[j]) break;
            dist = k * unit;
            t = (elev[j] - z0) * zf / dist;
            if (t > maxTan) maxTan = t;
          }
          // sine of the horizon angle; a ridge's horizon is below horizontal
          sum += maxTan > -Infinity ? maxTan / Math.sqrt(1 + maxTan * maxTan) : 0;
        }
        out[i] = 1 - sum / 8;
      }
    }
    return out;
  }

  // Distances to sample along each direction: every pixel nearby, then
  // increasingly sparse
  function getOpennessSteps(radius) {
    var steps = [];
    var k = 1;
    while (k <= radius) {
      steps.push(k);
      k = k < 4 ? k + 1 : Math.ceil(k * 1.4);
    }
    return steps;
  }

  // Darkens tones where the sky is hidden, as a shadow layer of opacity
  // @weight * AMBIENT_TONE_SCALE * @maxOpacity * (1 - openness). Openness is 1
  // on flat ground and on planar slopes, so these are left alone; valleys
  // darken, and ridges (openness above 1) lighten. Applied to tones rather than
  // to shading, because highlights span a much narrower range of shading than
  // shadows: darkening the shading took most of the highlights from sunlit
  // slopes in valleys, and darkened shaded slopes much less.
  // Over a shadow this is exact compositing. A highlight is reduced
  // AMBIENT_HIGHLIGHT_FACTOR times as fast, and any darkening left once it is
  // gone becomes a shadow. Ridges are lightened as in applyTextureTones().
  function applyAmbientTones(tones, openness, valid, weight, maxOpacity) {
    var scale = weight * AMBIENT_TONE_SCALE * maxOpacity;
    var h = AMBIENT_HIGHLIGHT_FACTOR;
    var a, t;
    for (var i = 0; i < tones.length; i++) {
      if (valid && !valid[i]) continue;
      a = scale * (1 - openness[i]);
      t = tones[i];
      if (a > 0 && t > 0) {
        tones[i] = t >= a * h ? t - a * h : t / h - a;
      } else if (a > 0) {
        tones[i] = t - a * (1 + t);
      } else {
        tones[i] = t - a * (1 - Math.max(t, 0));
      }
    }
    return tones;
  }

  // Aerial perspective, as in Swiss manual relief shading: contrast falls with
  // elevation, so lowland texture recedes and mountains stand out.
  // @strength 0-1; at 1 the lowest terrain gets no shading at all
  // Elevations are normalized between the 2nd and 98th percentiles.
  // @range optional [low, high] elevations from getAerialRange(), for applying
  //   this to part of a grid
  function applyAerialPerspective(shade, elev, valid, strength, range) {
    range = range || getAerialRange(elev, valid);
    var span = range[1] - range[0];
    var i, t;
    if (!(span > 0)) return shade;
    for (i = 0; i < shade.length; i++) {
      if (valid && !valid[i]) continue;
      t = Math.max(0, Math.min(1, (elev[i] - range[0]) / span));
      shade[i] = 1 + (shade[i] - 1) * (1 - strength * (1 - t));
    }
    return shade;
  }

  // The elevations that applyAerialPerspective() normalizes between
  function getAerialRange(elev, valid) {
    return getElevationPercentiles(elev, valid, 0.02, 0.98);
  }

  // Texture shading (Leland Brown 2010): a fractional Laplacian of the
  // elevations, positive on ridges and negative in drainages at every scale.
  // Brown filters in the frequency domain (spectrum times |k|^alpha); this
  // approximates it as a sum of differences of Gaussians, using
  // |k|^a = C * integral (1 - exp(-t k^2)) t^(-1-a/2) dt, sampled at
  // half-octave scales up to @maxSigma pixels. Brown's unbounded scales make
  // plains ringed by mountains read as giant drainages.
  // Elevation differences are divided by the pixel size, like a slope, so the
  // result does not depend on the extent or (with automatic exaggeration) the
  // zoom level.
  // @cellSizes ground size of a pixel in each row
  function computeTextureShading(elev, valid, width, height, cellSizes, exaggeration, alpha, maxSigma) {
    var n = width * height;
    var out = new Float32Array(n);
    var blurred = new Float32Array(n);
    var weights = valid ? toWeights(valid) : null;
    var sigma, w, x, y, i, k;
    for (sigma = TEXTURE_MIN_SCALE; sigma <= maxSigma; sigma *= Math.SQRT2) {
      blurred.set(elev);
      blurFloatChannel(blurred, weights, width, height, sigma);
      w = Math.pow(sigma, -alpha) * TEXTURE_SCALE * exaggeration;
      for (y = 0, i = 0; y < height; y++) {
        k = w / cellSizes[y];
        for (x = 0; x < width; x++, i++) {
          out[i] += (elev[i] - blurred[i]) * k;
        }
      }
    }
    return out;
  }

  var TEXTURE_MIN_SCALE = 0.7;
  // brings typical relief (France at zoom 7) to about 1 at the 98th percentile
  var TEXTURE_SCALE = 0.125;

  // Removes bright lines one pixel wide from signed tones, in place: a
  // morphological opening with a 2x2 square (each pixel gets the brightest of
  // the darkest values of the four 2x2 squares that contain it). Crest pixels
  // otherwise come out brighter than both faces of a ridge, which reads as a
  // knife edge: the 3x3 gradient of computeHillshade() blends the faces into a
  // slope closer to the brightest one, and ambient= lightens the crest and
  // darkens the pixels below it. Features two or more pixels wide and edges
  // between light and dark areas are unchanged, and no pixel gets brighter.
  // Invalid pixels and pixels outside the grid are ignored.
  function removeThinHighlights(tones, valid, width, height) {
    var n = width * height;
    var lows = new Float32Array(n);
    var x, y, i, v, m;
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        i = y * width + x;
        m = Infinity;
        if (!valid || valid[i]) m = tones[i];
        if (x + 1 < width && (!valid || valid[i + 1]) && tones[i + 1] < m) m = tones[i + 1];
        if (y + 1 < height) {
          if ((!valid || valid[i + width]) && tones[i + width] < m) m = tones[i + width];
          if (x + 1 < width && (!valid || valid[i + width + 1]) && tones[i + width + 1] < m) m = tones[i + width + 1];
        }
        lows[i] = m;
      }
    }
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        i = y * width + x;
        if (valid && !valid[i]) continue;
        m = lows[i];
        if (x > 0 && (v = lows[i - 1]) > m) m = v;
        if (y > 0) {
          if ((v = lows[i - width]) > m) m = v;
          if (x > 0 && (v = lows[i - width - 1]) > m) m = v;
        }
        tones[i] = m;
      }
    }
    return tones;
  }

  // Darkens drainages and lightens ridges, as shadow and highlight layers of up
  // to @opacity and @highlightOpacity over the hillshade's signed tones. Over a
  // tone of the same sign this is exact compositing; over the opposite tone it
  // cancels that tone first.
  function applyTextureTones(tones, texture, valid, opacity, highlightOpacity) {
    var a, t, i;
    for (i = 0; i < tones.length; i++) {
      if (valid && !valid[i] || texture[i] === 0) continue;
      t = tones[i];
      if (texture[i] < 0) {
        a = opacity * -Math.tanh(texture[i]);
        tones[i] = t - a * (1 + Math.min(t, 0));
      } else if (highlightOpacity > 0) {
        a = highlightOpacity * Math.tanh(texture[i]);
        tones[i] = t + a * (1 - Math.max(t, 0));
      }
    }
    return tones;
  }

  function getElevationPercentiles(elev, valid, lo, hi) {
    var stride = Math.max(1, Math.floor(elev.length / 100000));
    var values = [];
    for (var i = 0; i < elev.length; i += stride) {
      if (valid && !valid[i]) continue;
      values.push(elev[i]);
    }
    if (values.length === 0) return [0, 0];
    values.sort(function(a, b) { return a - b; });
    return [values[Math.floor(lo * (values.length - 1))], values[Math.floor(hi * (values.length - 1))]];
  }

  function toWeights(valid) {
    var weights = new Float32Array(valid.length);
    for (var i = 0; i < valid.length; i++) weights[i] = valid[i] ? 1 : 0;
    return weights;
  }

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


  var DEFAULT_ROUNDS = 3;
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
  function featurePreservingSmooth(elev, valid, width, height, cellWidths, cellHeights, exaggeration, opts) {
    var o = opts || {};
    var rounds = o.rounds >= 0 ? o.rounds : DEFAULT_ROUNDS;
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
  function getSlopeThresholds(elev, valid, width, height, cellWidths, cellHeights, exaggeration, o) {
    var slope = getMeanSlope(elev, valid, width, height, cellWidths, cellHeights, exaggeration, o.slopeRadius);
    for (var i = 0; i < slope.length; i++) {
      slope[i] = Math.min(o.max, o.min + o.slopeFactor * slope[i]);
    }
    return slope;
  }

  // Per-pixel FPS thresholds from how much the surface normals vary nearby:
  //   threshold = clamp(o.factor * spread, o.min, o.max)
  // where spread is the angle whose cosine is the length of the mean unit
  // normal, in a Gaussian window of @o.spreadRadius pixels. Two flat faces
  // meeting at a crease of angle A have a spread of A/2, so a factor below 2
  // keeps them from being averaged together, while each face gets the whole
  // window. On a surface that curves evenly, the same threshold covers only
  // part of the window's range of normals, which narrows the window
  // that FPS averages over, so rounded landforms are blurred less.
  // Returns a Float32Array of thresholds in degrees
  function getSpreadThresholds(elev, valid, width, height, cellWidths, cellHeights, exaggeration, o) {
    var n = width * height;
    var zf = exaggeration > 0 ? exaggeration : 1;
    var z = new Float32Array(n);
    var out = new Float32Array(n);
    var weights = valid ? Float32Array.from(valid) : null;
    var toDegrees = 180 / Math.PI;
    var i, normals, len, nx, ny, nz;
    for (i = 0; i < n; i++) z[i] = elev[i] * zf;
    normals = computeNormals(z, valid, width, height, cellWidths, cellHeights);
    nx = blurFloatChannel(normals.nx, weights, width, height, o.spreadRadius);
    ny = blurFloatChannel(normals.ny, weights, width, height, o.spreadRadius);
    nz = blurFloatChannel(normals.nz, weights, width, height, o.spreadRadius);
    for (i = 0; i < n; i++) {
      len = Math.sqrt(nx[i] * nx[i] + ny[i] * ny[i] + nz[i] * nz[i]);
      out[i] = Math.min(o.max, Math.max(o.min, o.factor * Math.acos(Math.min(1, len)) * toDegrees));
    }
    return out;
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
  function twoLevelSmooth(elev, valid, width, height, cellWidths, cellHeights, exaggeration, coarseOpts, fineOpts) {
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

  // The two stages of -hillshade that take nearly all of its time: smoothing
  // the terrain, and shading it. Their inputs are plain objects and typed
  // arrays, so they can run in workers (see mapshaper-hillshade-worker.mjs), on
  // overlapping tiles of the grid.
  //
  // A grid, or a tile of one, is {elev, valid, width, height, cellWidths,
  // cellHeights}: Float32Array elevations, an optional Uint8Array of valid
  // pixels, and the ground size of a pixel in each row (in elevation units).
  // This module imports only pure raster modules, to keep the worker small.

  // Experimental lighting parameters, in raster pixels
  var LIGHT_ADJUSTMENT_SIGMA = 10;
  var OPENNESS_RADIUS = 24;
  var TEXTURE_MAX_SCALE = 24;

  function runHillshadeStage(task) {
    if (task.stage == 'smooth') return smoothTerrain(task.grid, task.settings);
    if (task.stage == 'shade') return {tones: shadeTerrain(task.grid, task.settings)};
    throw new Error('Unknown hillshade stage: ' + task.stage);
  }

  // @s.fps FPS options (featurePreservingSmooth() and getSlopeThresholds())
  // @s.refinement options of the full-resolution pass of two-level smoothing
  // @s.exaggeration
  // @s.minElevation optional; elevations were raised to it before smoothing
  // Returns {elev, thresholds}: thresholds are the per-pixel FPS thresholds of
  //   dynamic smoothing, or null
  function smoothTerrain(grid, s) {
    var elev = grid.elev, valid = grid.valid, w = grid.width, h = grid.height;
    var thresholds = null, fps = s.fps, out;
    if (fps.spread > 0) {
      thresholds = getSpreadThresholds(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
        s.exaggeration, {
          min: fps.minThreshold,
          max: fps.threshold,
          factor: fps.spread,
          spreadRadius: fps.spreadRadius
        });
      fps = Object.assign({}, fps, {thresholds: thresholds});
    } else if (fps.minThreshold > 0) {
      thresholds = getSlopeThresholds(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
        s.exaggeration, {
          min: fps.minThreshold,
          max: fps.threshold,
          slopeFactor: fps.slopeFactor,
          slopeRadius: fps.slopeRadius
        });
      fps = Object.assign({}, fps, {thresholds: thresholds});
    }
    out = fps.levels == 2 ?
      twoLevelSmooth(elev, valid, w, h, grid.cellWidths, grid.cellHeights, s.exaggeration, fps, s.refinement) :
      featurePreservingSmooth(elev, valid, w, h, grid.cellWidths, grid.cellHeights, s.exaggeration, fps);
    if (s.minElevation != null) {
      restoreLowElevations(out, elev, valid, s.minElevation);
    }
    return {elev: out, thresholds: thresholds};
  }

  // @s.lights, @s.azimuth, @s.exaggeration
  // @s.lightAdjust, @s.ambient, @s.aerial, @s.texture: 0 for off
  // @s.aerialRange from getAerialRange() on the whole grid, if @s.aerial > 0
  // @s.minElevation optional
  // @s.style, @s.toneOpts see getHillshadeTones()
  // @s.textureDetail, @s.textureHighlights
  // Returns signed tones (see getHillshadeTones())
  function shadeTerrain(grid, s) {
    var elev = grid.elev, valid = grid.valid, w = grid.width, h = grid.height;
    var offsets, shade, land, tones;
    if (s.lightAdjust > 0) {
      offsets = computeLightAdjustment(elev, valid, w, h, s.azimuth, s.lightAdjust,
        LIGHT_ADJUSTMENT_SIGMA);
    }
    shade = computeHillshade(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
      s.lights, s.exaggeration, offsets);
    // a flattened sea stays flat, rather than shading along the coast
    land = s.minElevation != null && (s.ambient > 0 || s.texture > 0) ?
      getAboveMinimumMask(elev, valid, s.minElevation) : valid;
    if (s.aerial > 0) {
      applyAerialPerspective(shade, elev, valid, s.aerial, s.aerialRange);
    }
    tones = getHillshadeTones(shade, valid, s.style, s.toneOpts);
    if (s.ambient > 0) {
      applyAmbientTones(tones, computeOpenness(elev, valid, w, h, grid.cellWidths,
        grid.cellHeights, s.exaggeration, OPENNESS_RADIUS), land, s.ambient,
        getToneMaxOpacity(s.style, s.toneOpts));
    }
    // after the tone curve, so max-opacity= and gamma= don't affect it
    if (s.texture > 0) {
      applyTextureTones(tones, computeTextureShading(elev, land, w, h, getRowCellSizes(grid),
        s.exaggeration, s.textureDetail, TEXTURE_MAX_SCALE), land,
        s.texture, Math.min(1, s.texture * s.textureHighlights));
    }
    return removeThinHighlights(tones, valid, w, h);
  }

  function getRowCellSizes(grid) {
    var sizes = new Float64Array(grid.height);
    for (var y = 0; y < sizes.length; y++) {
      sizes[y] = Math.sqrt(grid.cellWidths[y] * grid.cellHeights[y]);
    }
    return sizes;
  }

  function getAboveMinimumMask(elev, valid, min) {
    var mask = new Uint8Array(elev.length);
    for (var i = 0; i < elev.length; i++) {
      mask[i] = (!valid || valid[i]) && elev[i] > min ? 1 : 0;
    }
    return mask;
  }

  // Messaging shared by worker scripts and startWorkerPool(). No imports, so
  // that worker bundles stay small.
  //
  // A worker posts {ready: true} once it has loaded, then answers each task
  // with {result} or {error}, after any number of {progress} messages.

  // Connects a worker script to its parent, in a browser worker or a Node
  // worker thread. @handler receives each task and a function for reporting
  // its progress (any value that can be posted), and returns its result (or a
  // promise of it).
  function serveWorkerTasks(handler) {
    var port = getParentPort();
    function report(value) {
      port.post({progress: value});
    }
    function fail(e) {
      port.post({error: e && e.message || String(e)});
    }
    port.listen(function(task) {
      var result;
      try {
        result = handler(task, report);
      } catch (e) {
        fail(e);
        return;
      }
      Promise.resolve(result).then(function(result) {
        port.post({result: result}, getTransferList(result));
      }, fail);
    });
    port.post({ready: true});
  }

  // Buffers of the typed arrays in @obj and its plain objects and arrays, for
  // transferring rather than copying them, and the MessagePorts in them, which
  // can only be transferred
  function getTransferList(obj) {
    var buffers = [];
    collectBuffers(obj, buffers);
    return buffers;
  }

  function collectBuffers(obj, buffers) {
    if (!obj || typeof obj != 'object') return;
    if (typeof MessagePort != 'undefined' && obj instanceof MessagePort) {
      buffers.push(obj);
      return;
    }
    if (ArrayBuffer.isView(obj)) {
      if (obj.buffer instanceof ArrayBuffer && buffers.indexOf(obj.buffer) == -1) {
        buffers.push(obj.buffer);
      }
      return;
    }
    Object.keys(obj).forEach(function(key) {
      collectBuffers(obj[key], buffers);
    });
  }

  function getParentPort() {
    var port;
    if (typeof importScripts == 'function') {
      return {
        post: function(msg, transfer) { self.postMessage(msg, transfer || []); },
        listen: function(fn) { self.onmessage = function(e) { fn(e.data); }; }
      };
    }
    port = require('worker_threads').parentPort;
    return {
      post: function(msg, transfer) { port.postMessage(msg, transfer || []); },
      listen: function(fn) { port.on('message', fn); }
    };
  }

  // Entry point of www/hillshade-worker.js, which runs the stages of -hillshade
  // on tiles of a grid, as a browser worker or a Node worker thread (see
  // mapshaper-hillshade-runner.mjs). Import only pure modules here: the bundle
  // should stay a small fraction of mapshaper.js, since every worker loads it.

  serveWorkerTasks(runHillshadeStage);

})();
