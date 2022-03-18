import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { lookupColorName } from '../color/color-names';

var rgbaRxp = /^rgba?\(([^)]+)\)/;
var hexRxp = /^#([a-f0-9]{3,8})/i;

export function parseColor(arg) {
  arg = arg ? String(arg) : '';
  var hexStr = hexRxp.test(arg) ? arg : lookupColorName(arg);
  var rgb = null;
  if (hexStr) {
    rgb = parseHexColor(hexStr);
  } else if (rgbaRxp.test(arg)) {
    rgb = parseRGBA(arg);
  }
  if (rgb && !testRGB(rgb)) {
    rgb = null;
  }
  return rgb;
}

export function validateColor(arg) {
  if (!parseColor(arg)) {
    stop("Unsupported color:", arg);
  }
  return true;
}

function testRGB(o) {
  return !!o && testChannel(o.r) && testChannel(o.g) && testChannel(o.b) &&
    testAlpha(o.a);
}

function testAlpha(a) {
  return a >= 0 && a <= 1;
}

function testChannel(c) {
  return c >= 0 && c < 256; // allow fractional values
}

export function parseRGBA(arg) {
  var str = rgbaRxp.exec(arg)[1];
  var parts = str.split(',').map(function(part) { return parseFloat(part); });
  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: parts[3] >= 0 ? parts[3] : 1
  };
}

export function formatColor(o) {
  return o.a < 1 ? formatRGBA(o) : formatHexColor(o);
}

function formatHexColor(o) {
  return "#" + formatHexChannel(o.r) + formatHexChannel(o.g) + formatHexChannel(o.b);

}

function formatRGBA(o) {
  var rgb = snapHexChannel(o.r) + ',' + snapHexChannel(o.g) + ',' + snapHexChannel(o.b);
  return o.a < 1 ?
    'rgba(' + rgb + ',' + snapAlpha(o.a) + ')' :
    'rgb(' + rgb + ')';
}

function snapAlpha(a) {
  a = +a || 0;
  a = Math.round(a * 1000) / 1000; // round to thousandths
  return utils.clamp(a, 0, 1);
}

function snapHexChannel(arg) {
  return Math.round(utils.clamp(+arg || 0, 0, 255));
}

// arg: should be number in 0-255 range
function formatHexChannel(arg) {
  return snapHexChannel(arg).toString(16).padStart(2, '0');
}

// returns {r, g, b} object
export function parseHexColor(str) {
  var hex = hexRxp.exec(str)[1];
  if (hex.length == 3 || hex.length == 4) {
    hex = hex.split('').map(function(c) { return c + c; });
  }
  if (hex.length != 6 && hex.length != 8) return null;
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16),
    a: hex.length == 8 ? parseInt(hex.substr(7, 2), 16) / 255 : 1
  };
}

function toHSV(rgb) {
  var r = rgb.r,
      g = rgb.g,
      b = rgb.b,
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      diff = max - min,
      h;
  if (diff === 0) {
    h = 0;
  } else if (r == max) {
    h = (g - b) / diff;
  } else if (g == max) {
    h = (b - r) / diff + 2;
  } else {
    h = (r - g) / diff + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  return {
    h: h,
    s: max == 0 ? 0 : 255 * (1 - min / max),
    v: max,
    a: rgb.a
  };
}

function fromHSV(hsv) {
  var h = hsv.h,
      s = hsv.s / 255,
      v = hsv.v,
      hi = Math.floor(h / 60) % 6,
      f = h / 60 - Math.floor(h / 60),
      p = (v * (1 - s)),
      q = (v * (1 - f * s)),
      t = (v * (1 - (1 - f) * s)),
      r, g, b;
  if (hi === 0) {
    r = v; g = t; b = p;
  } else if (hi == 1) {
    r = q; g = v; b = p;
  } else if (hi == 2) {
    r = p; g = v; b = t;
  } else if (hi == 3) {
    r = p; g = q; b = v;
  } else if (hi == 4) {
    r = t; g = p; b = v;
  } else {
    r = v; g = p; b = q;
  }
  return {
    r: r,
    g: g,
    b: b,
    a: hsv.a
  };
}
