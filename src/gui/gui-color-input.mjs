import { internal } from './gui-core';

// Reads a color typed or pasted into a color field, and returns it as a
// six-digit hex value (#rrggbb), or null if it isn't a color. Accepts what a
// user is likely to have copied from somewhere else: hex with or without the
// "#" and with 3, 4, 6 or 8 digits, CSS color names, rgb() and hsl() in
// either the comma or the space-separated syntax, and oklch(). Alpha is
// accepted and dropped, because the field holds an opaque color. An oklch()
// color outside the sRGB gamut loses chroma, keeping its hue and lightness.
export function parseColorInput(str) {
  var s = String(str || '').trim().toLowerCase();
  var rgb;
  if (!s) return null;
  if (/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) {
    s = '#' + s;
  }
  if (s[0] == '#') {
    rgb = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s) ? internal.parseHexColor(s) : null;
  } else if (/^rgba?\(/.test(s)) {
    rgb = parseRgbFunction(s);
  } else if (/^hsla?\(/.test(s)) {
    rgb = parseHslFunction(s);
  } else if (/^oklch\(/.test(s)) {
    rgb = parseOklchFunction(s);
  } else if (/^[a-z]+$/.test(s)) {
    rgb = internal.parseColor(s);
  }
  return rgb ? formatHex(rgb) : null;
}

// The formats a color field can show a color in
export var colorInputFormats = [
  {name: 'hex', label: 'HEX'},
  {name: 'rgb', label: 'RGB'},
  {name: 'hsl', label: 'HSL'},
  {name: 'oklch', label: 'OKLCH'}
];

// Shows a #rrggbb color in one of colorInputFormats, in a form that
// parseColorInput() reads back.
export function formatColorInput(hex, format) {
  var rgb = internal.parseHexColor(hex);
  var hsl, lch;
  if (!rgb) return hex;
  if (format == 'rgb') {
    return 'rgb(' + [rgb.r, rgb.g, rgb.b].join(', ') + ')';
  }
  if (format == 'hsl') {
    hsl = rgbToHsl(rgb);
    return 'hsl(' + round(hsl.h, 1) + ', ' + round(hsl.s * 100, 1) + '%, ' +
      round(hsl.l * 100, 1) + '%)';
  }
  if (format == 'oklch') {
    lch = internal.oklabToOklch(internal.rgbToOklab(rgb));
    // a gray has no hue
    return 'oklch(' + lch.l.toFixed(4) + ' ' + lch.c.toFixed(4) + ' ' +
      (lch.c < 0.00005 ? 0 : round(lch.h, 2)) + ')';
  }
  return internal.formatColor({r: rgb.r, g: rgb.g, b: rgb.b, a: 1});
}

function getFunctionArgs(s) {
  var match = /^[a-z]+\(([^)]*)\)$/.exec(s);
  var args;
  if (!match) return null;
  args = match[1].split(/[\s,/]+/).filter(Boolean);
  return args.length == 3 || args.length == 4 ? args : null;
}

function parseRgbFunction(s) {
  var args = getFunctionArgs(s);
  var channels;
  if (!args) return null;
  channels = args.slice(0, 3).map(function(arg) {
    var val = parseFloat(arg);
    if (!/^-?[0-9.]+%?$/.test(arg) || !isFinite(val)) return NaN;
    return clamp(/%$/.test(arg) ? val / 100 * 255 : val, 0, 255);
  });
  if (channels.some(isNaN)) return null;
  return {r: channels[0], g: channels[1], b: channels[2]};
}

function parseHslFunction(s) {
  var args = getFunctionArgs(s);
  var h, sat, light;
  if (!args) return null;
  h = parseHue(args[0]);
  sat = parsePercent(args[1]);
  light = parsePercent(args[2]);
  if (isNaN(h) || isNaN(sat) || isNaN(light)) return null;
  return hslToRgb(h, sat, light);
}

// L is 0-1 or a percent; C is a number, or a percent of 0.4, as in CSS
function parseOklchFunction(s) {
  var args = getFunctionArgs(s);
  var l, c, h;
  if (!args) return null;
  l = parseNumberOrPercent(args[0], 1);
  c = parseNumberOrPercent(args[1], 0.4);
  h = args[2] == 'none' ? 0 : parseHue(args[2]);
  if (isNaN(l) || isNaN(c) || isNaN(h)) return null;
  return internal.oklchToRgb({l: clamp(l, 0, 1), c: Math.max(c, 0), h: h});
}

function parseNumberOrPercent(arg, pctScale) {
  if (arg == 'none') return 0;
  if (!/^-?[0-9.]+%?$/.test(arg) || !isFinite(parseFloat(arg))) return NaN;
  return /%$/.test(arg) ? parseFloat(arg) / 100 * pctScale : parseFloat(arg);
}

// degrees, from a number or an angle with a CSS unit
function parseHue(arg) {
  var match = /^(-?[0-9.]+)(deg|rad|grad|turn)?$/.exec(arg);
  var val, unit;
  if (!match) return NaN;
  val = parseFloat(match[1]);
  unit = match[2] || 'deg';
  if (unit == 'rad') val = val * 180 / Math.PI;
  if (unit == 'grad') val = val * 0.9;
  if (unit == 'turn') val = val * 360;
  return ((val % 360) + 360) % 360;
}

// 0-1; the percent sign is optional, as in the space-separated syntax
function parsePercent(arg) {
  if (!/^-?[0-9.]+%?$/.test(arg)) return NaN;
  return clamp(parseFloat(arg), 0, 100) / 100;
}

function hslToRgb(h, s, l) {
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = l - c / 2;
  var rgb = h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  return {r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255};
}

function rgbToHsl(rgb) {
  var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var d = max - min;
  var l = (max + min) / 2;
  var h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max == r) h = ((g - b) / d + 6) % 6;
    else if (max == g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return {h: h, s: s, l: l};
}

function round(val, decimals) {
  var k = Math.pow(10, decimals);
  return Math.round(val * k) / k;
}

function formatHex(rgb) {
  return internal.formatColor({r: rgb.r, g: rgb.g, b: rgb.b, a: 1});
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
