/* @requires colorutils */

Utils.rgb2hsv = function(rgb) {
  var h, s, v,
    r = Color.getR(rgb),
    g = Color.getG(rgb),
    b = Color.getB(rgb),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    diff = max - min;

  if (diff == 0) {
    h = 0;
  }

  else if (r == max) {
    h = (g - b) / diff;
  }
  else if (g == max) {
    h = (b - r) / diff + 2;
  }
  else {
    h = (r - g) / diff + 4;
  }
  h *= 60;

  //h = Math.atan2(2 * r - g - b, Math.sqrt(3) * (g - b)) * 180 / Math.PI;  */

  if (h < 0) {
    h += 360;
  }

  s = max == 0 ? 0 : (max - min) * 255 / max;
  v = max;
  return {h:h, s:s, v:v};
};

Utils.getLuminance = function(rgb) {
  var lum = (Color.getR(rgb) * 0.299 + Color.getG(rgb) * 0.587 + Color.getB(rgb) * 0.114) / 255;
  return lum;
};


Utils.hsv2rgb = function(h, s, v) {  // validate input
  s = Utils.clamp(s, 0, 255);
  v = Utils.clamp(v, 0, 255);
  h = Utils.clamp(h, 0, 360);

  s = s / 255; // ??

  var hi = Math.floor(h / 60) % 6;
  var f = h / 60 - Math.floor(h / 60);
  var p = (v * (1 - s));
  var q = (v * (1 - f * s));
  var t = (v * (1 - (1 - f) * s));
  var r, g, b;

  switch (hi) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  return Color.getRGB(r, g, b);
};