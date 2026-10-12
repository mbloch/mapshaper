// Default sizes of the label tool's anchor symbols, which differ by shape: a
// star or a ring at the size of a circle reads as smaller. Colors follow the
// shape through getIconPaintChange() in gui-icon-shapes.mjs.
var iconDefaults = {
  circle: {size: 5},
  square: {size: 5},
  triangle: {size: 8},
  star: {size: 8},
  ring: {size: 8},
  'nyt-star': {size: 14}
};
var fallbackSize = 5;

export function getDefaultIconSize(shape) {
  var o = iconDefaults[shape];
  return o ? o.size : fallbackSize;
}

// The icon-size to write when labels whose symbol is @prevShape ('' for none,
// or for a selection of mixed shapes) are given @shape, from the @size they
// share. A missing size is '' or 0.
//
// A size that is the old shape's default follows the shape to its own
// default, and a size the user chose is kept -- so switching shapes resizes a
// symbol nobody sized, and never undoes a size somebody set.
export function getIconShapeChange(shape, prevShape, size) {
  var sizeVal = Number(size);
  if (!(sizeVal > 0) || prevShape && sizeVal == getDefaultIconSize(prevShape)) {
    return {size: getDefaultIconSize(shape)};
  }
  return {size: sizeVal};
}
