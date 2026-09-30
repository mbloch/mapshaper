// Default sizes and colours of the label tool's anchor symbols, which differ by
// shape: a star or a ring at the size of a circle reads as smaller, and the NYT
// star is a logo, drawn in its own red.
var iconDefaults = {
  circle: {size: 5},
  square: {size: 5},
  star: {size: 8},
  ring: {size: 8},
  'nyt-star': {size: 14, color: '#cc0000'}
};
var fallbackSize = 5;

export function getDefaultIconSize(shape) {
  var o = iconDefaults[shape];
  return o ? o.size : fallbackSize;
}

// '' for a shape drawn in whatever colour the label gives it.
export function getDefaultIconColor(shape) {
  var o = iconDefaults[shape];
  return o && o.color || '';
}

// The icon-size and icon-color to write when labels whose symbol is @prevShape
// ('' for none, or for a selection of mixed shapes) are given @shape, from the
// @size and @color they share. A missing size is '' or 0, and a colour of ''
// is none; null is a colour the labels do not agree on, which is left alone.
//
// A value that is the old shape's default follows the shape to its own
// default, and a value the user chose is kept -- so switching shapes resizes a
// symbol nobody sized, and never undoes a size somebody set. The colour is
// returned only if it changes, as '' to remove it.
export function getIconShapeChange(shape, prevShape, size, color) {
  var out = {};
  var sizeVal = Number(size);
  var prevColor = getDefaultIconColor(prevShape);
  var nextColor = getDefaultIconColor(shape);
  if (!(sizeVal > 0) || prevShape && sizeVal == getDefaultIconSize(prevShape)) {
    out.size = getDefaultIconSize(shape);
  } else {
    out.size = sizeVal;
  }
  if (color !== null && sameColor(color, prevColor) && !sameColor(color, nextColor)) {
    out.color = nextColor;
  }
  return out;
}

function sameColor(a, b) {
  return String(a || '').toLowerCase() == String(b || '').toLowerCase();
}
