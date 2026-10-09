// An anchored label's box: its text, plus label-padding, which is the space
// between the glyphs and the box the label is positioned by, a callout stops
// at, and label-background fills. The box itself is getLabelBox() in
// svg-label-callout.mjs, and its fill is drawn by svg-label-background.mjs.
//
// label-padding takes a CSS padding string: one to four lengths, for top,
// right, bottom and left in CSS order. A length is a bare number or a px or
// em value; ems are relative to the label's font size. Padding never changes
// where a text block wraps: label-width is the width of the text, and the
// padding is outside it, as with CSS's content-box.
//
// See docs/development/text-annotation-design.md.

// Kept here rather than imported from svg-labels.mjs, which imports
// svg-properties.mjs, which imports this.
var DEFAULT_FONT_SIZE = 12;

var lengthRxp = /^([0-9]*\.?[0-9]+)(px|em)?$/i;

// 'none' is kept rather than rejected, as callout=none is, so that a field or
// an expression can switch a background off for some features.
export function labelHasBackground(rec) {
  var val = rec ? rec['label-background'] : null;
  return !!val && String(val).trim().toLowerCase() != 'none';
}

// The padding string @val, normalized, or null if it is not one. Always a
// string, so that a column holding "4" for one label and "2 6" for another
// has a single type.
export function parseLabelPadding(val) {
  var parts;
  if (typeof val == 'number') {
    return isFinite(val) && val >= 0 ? String(val) : null;
  }
  parts = String(val === null || val === undefined ? '' : val).trim().split(/\s+/);
  if (parts.length > 4 || parts[0] === '') return null;
  for (var i = 0; i < parts.length; i++) {
    if (!lengthRxp.test(parts[i])) return null;
  }
  return parts.join(' ');
}

// @rec's padding in px, as {top, right, bottom, left}, or null if it has none
// that can be read.
export function getLabelPadding(rec) {
  var str = rec ? parseLabelPadding(rec['label-padding']) : null;
  var fontSize, px;
  if (!str) return null;
  fontSize = getFontSizeInPx(rec['font-size']);
  px = str.split(' ').map(function(part) {
    var match = lengthRxp.exec(part);
    var n = Number(match[1]);
    return match[2] && match[2].toLowerCase() == 'em' ? n * fontSize : n;
  });
  // CSS shorthand: 1 value for all sides, 2 for vertical and horizontal, 3
  // for top, horizontal and bottom, 4 clockwise from the top
  if (px.length == 1) px = [px[0], px[0], px[0], px[0]];
  else if (px.length == 2) px = [px[0], px[1], px[0], px[1]];
  else if (px.length == 3) px = [px[0], px[1], px[2], px[1]];
  return {top: px[0], right: px[1], bottom: px[2], left: px[3]};
}

// How far a label position's offsets move to keep the padded box, rather
// than the glyphs, the same distance from the anchor: away from it, by the
// padding on the side that faces it. The centred position moves nowhere.
// Returns [dx, dy] in px.
export function getPositionPaddingShift(pos, pad) {
  var p = String(pos || '').toLowerCase();
  var dx = 0, dy = 0;
  if (!pad) return [0, 0];
  if (p.indexOf('e') > -1) dx = pad.left;
  if (p.indexOf('w') > -1) dx = -pad.right;
  if (p.indexOf('n') > -1) dy = -pad.bottom;
  if (p.indexOf('s') > -1) dy = pad.top;
  return [dx, dy];
}

// @measure (a number, or a px or em value) plus @px, in px, or null if
// @measure is in units this cannot add to.
export function addPixelsToMeasure(measure, px, fontSizeArg) {
  var str = String(measure).trim();
  var match = /^(-?[0-9]*\.?[0-9]+)(px|em)?$/i.exec(str);
  var n;
  if (!match) return null;
  n = Number(match[1]);
  if (match[2] && match[2].toLowerCase() == 'em') n *= getFontSizeInPx(fontSizeArg);
  return Math.round((n + px) * 10) / 10;
}

// A number, a px value or an em value relative to the default
function getFontSizeInPx(val) {
  var match = /^([0-9]*\.?[0-9]+)(px|em)?$/i.exec(String(val === undefined ||
    val === null ? '' : val).trim());
  var n;
  if (!match) return DEFAULT_FONT_SIZE;
  n = Number(match[1]);
  if (match[2] && match[2].toLowerCase() == 'em') n *= DEFAULT_FONT_SIZE;
  return n > 0 ? n : DEFAULT_FONT_SIZE;
}
