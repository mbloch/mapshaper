/* @requires core */

var Color = {

  getRGB: function(r, g, b) {
    return (r << 16) | (g << 8) | b;
  },

  getR: function(rgb) {
    return (rgb >> 16) & 0xff;  // mask out alpha values in case argb
  },

  getG: function(rgb) {
    return (rgb >> 8) & 0xff;
  },

  getB: function(rgb) {
    return rgb & 0xff;
  }
};

Color.interpolate = function(c1, c2, pct) {
  var r = Utils.interpolate(Color.getR(c1), Color.getR(c2), pct),
      g = Utils.interpolate(Color.getG(c1), Color.getG(c2), pct),
      b = Utils.interpolate(Color.getB(c1), Color.getB(c2), pct);
  var rgb = Color.getRGB(r, g, b);
  return rgb;
};

Utils.parseHexColor =
Color.parseHex = function(str) {
  var rgb = 0,
      match, r, g, b;
  if (match = /^#?([0-9a-fA-F]{6})$/.exec(str)) {
    str = match[1];
    var r = parseInt(str.substr(0, 2), 16),
      g = parseInt(str.substr(2, 2), 16),
      b = parseInt(str.substr(4, 2), 16);
    rgb = Color.getRGB(r, g, b);
  }
  return rgb;
};

// var hexColorRxp = /#?([0-9a-f]{1,2})([0-9a-f]{1,2})([0-9a-f]{1,2})$/i

Color.rgbToHex = function(rgb) {
  if (!Utils.isNumber(rgb)) error("Expected a number.");
  var hex = rgb.toString(16);
  while (hex.length < 6) {
    hex = '0' + hex;
  }
  return "#" + hex;
};

Color.hexToCSS = function(hex, a) {
  if (!Utils.isString(hex)) error("Expected a string");
  if (a >= 0 && a <1) {
    return Color.formatAsCSS(Color.parseHex(hex), a);
  }
  return hex;
}

var getCSSColor = Color.formatAsCSS = function(rgb, a) {
  if (!Utils.isNumber(rgb)) error("[Color.formatForCSS()] Expected numeric RGB");

  var css;
  // if alpha is present use rgba() format
  if (a && a < 1) { //
    // toFixed() guards against IEEE scientific notation in alpha value
    css = "rgba(" + Color.getR(rgb) + "," + Color.getG(rgb) + "," + Color.getB(rgb) + "," + a.toFixed(2) + ")";
  }
  else { // no alpha, use hex string format
    css = Color.rgbToHex(rgb);
  }
 
  return css;
};


/*
function getCSSColor(rgb, a) {
  var numeric = !isNaN(rgb);
  var css, r, b, g;

  // if alpha is present use rgba() format
  if (a && a < 1) { //
    // TODO: guard against IEEE scientific notation in alpha value
    if (numeric) {
      r = rgb >> 16 & 0xff;
      g = rgb >> 8 & 0xff;
      b = rgb & 0xff;
    }
    else if (Utils.isString(rgb) && (matches=hexColorRxp.exec(rgb))) {
      var r = matches[1];
      var g = matches[2];
      var b = matches[3];
      if (matches[0].length < 5) {
        r = r+r;
        g = g+g;
        b = b+b;
      }
      r = parseInt(r, 16);
      g = parseInt(g, 16);
      b = parseInt(b, 16);
    }
    else {
      r = 0;
      g = 0;
      b = 0;
    }
    css = "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  else { // no alpha, use hex string format
    if (numeric) {
      var hex = rgb.toString(16);
      while (hex.length < 6) {
        hex = '0' + hex;
      }
      css = "#" + hex;
    }
    else {
      css = rgb; // TODO: validate
    }
  }
  return css;
}

*/
/**
 * Get the minimum alpha for an overlay channel in front of a bg channel.
 * @param {number} target Target overlay channel color, range [0, 255).
 * @param {number} bg Background channel, range [0, 255).
 * @return {number} Min alpha at which the overlay can be shown, range [0, 1).
 */
Color.getMinChannelAlpha = function(target, bg) {
  var testAlpha = 0.1;
  var modCol = (target - (1 - testAlpha) * bg) / testAlpha;

  var minAlpha = testAlpha;
  if (modCol < 0) {
    minAlpha = 1 - target / bg;
  }
  else if (modCol > 255) {
    minAlpha = (target - bg) / (255 - bg);
  }

  /**
  On a light background, if the bg is darker than the target color value,
  provide a compromise alpha. (TODO: explain this better).
  */
  if (bg < target && bg > 0x66) {
    minAlpha = 0.35;
  }

  return minAlpha;
};

/**
 * Return the minimum alpha that can be used with an overlay color.
 * @param {number} rgb Overlay color.
 * @param {number} bg Background color.
 * @return {number} Alpha value.
 */
Color.getMinAlpha = function(rgb, bg) {
  var targetR = this.getR(rgb);
  var targetG = this.getG(rgb);
  var targetB = this.getB(rgb);

  var bgR = this.getR(bg);
  var bgG = this.getG(bg);
  var bgB = this.getB(bg);

  var alphaR = this.getMinChannelAlpha(targetR, bgR);
  var alphaG = this.getMinChannelAlpha(targetG, bgG);
  var alphaB = this.getMinChannelAlpha(targetB, bgB);
  //trace(' >> new alphas, rgb:', alphaR, alphaG, alphaB);
  return Math.max(alphaR, alphaB, alphaG);
};

// Calc channel value without rounding
//
Color.flattenChannel = function(value, alpha, bgval) {
  var a = value * alpha,
      b = (1 - alpha) * bgval;
  return a + b;
};

Color.flattenChannels = function(values, alphas, bg, snap) {
  if (values.length !== alphas.length) error("Color.mergeChannels() mismatched channel / alpha data");
  var val = bg, a;
  for (var i=0; i<values.length; i++) {
    a = alphas[i];
    if (snap) {
      a = (a * 255 | 0) / 255;
    }
    val = Color.flattenChannel(values[i], alphas[i], val);
    if (snap) {
      val = val | 0;
    }
  }
  return Math.floor(val);
};

Color.flattenColors = function(rgbs, alphas, bg, snap) {
  var rr = Utils.map(rgbs, Color.getR),
      gg = Utils.map(rgbs, Color.getG),
      bb = Utils.map(rgbs, Color.getB),
      r = Color.flattenChannels(rr, alphas, Color.getR(bg), snap),
      g = Color.flattenChannels(gg, alphas, Color.getG(bg), snap),
      b = Color.flattenChannels(bb, alphas, Color.getB(bg), snap);

  return Color.getRGB(r, g, b);
};

Color.flattenColor = function(rgb, alpha, bg) {
  return Color.flattenColors([rgb], [alpha], bg, true);
};


Color.adjustColorByAlpha = function(rgb, alpha, bgCol) {
  if (bgCol === undefined) {
    bgCol = 0xffffff;
  }

  var targetR = this.getR(rgb);
  var targetG = this.getG(rgb);
  var targetB = this.getB(rgb);

  var bgR = this.getR(bgCol);
  var bgG = this.getG(bgCol);
  var bgB = this.getB(bgCol);

  var newR = (targetR - (1 - alpha) * bgR) / alpha;
  var newG = (targetG - (1 - alpha) * bgG) / alpha;
  var newB = (targetB - (1 - alpha) * bgB) / alpha;

  newR = Math.round(Utils.clamp(newR, 0, 255));
  newG = Math.round(Utils.clamp(newG, 0, 255));
  newB = Math.round(Utils.clamp(newB, 0, 255));

  return this.getRGB(newR, newG, newB);
};


Color.getOverlayColor = function(rgb, bg, minAlpha) {

  bg = bg == null ? 0xffffff : bg;
  minAlpha = minAlpha == null ? 0 : minAlpha;
  var newAlpha = this.getMinAlpha(rgb, bg);
  if (minAlpha > newAlpha) {
    newAlpha = minAlpha;
  }
  var newRgb = this.adjustColorByAlpha(rgb, newAlpha, bg);
  return {alpha:newAlpha, rgb:newRgb};
};

