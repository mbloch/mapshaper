import { getMeasuredTextWidth } from './svg-label-metrics';

// Decides whether a path-aligned label's text fits its path.
//
// The decision compares two numbers, and only one of them is geometry. Path
// length export computes; text width takes font metrics, which mapshaper has
// only in a browser -- so the width comes from svg-label-metrics.mjs, which
// measures in the GUI and memoizes.
//
// What that module holds is the measured width, not a fits/doesn't-fit verdict,
// because a verdict would depend on output size and a width does not: text is
// exported at its native font-size, so its rendered width in output pixels is
// the same at every output size, while the path shrinks and grows.
//
// See docs/development/label-tool-design.md.

// One of:
//   'fits'       the text is known to fit
//   'overflow'   the text is known not to fit; export drops the label
//   'unmeasured' no width is available, so fit is unknown
//
// 'unmeasured' renders, because silently deleting a label from a map is a worse
// outcome than drawing one that overflows: an overflow is visible and fixable,
// a deletion is neither. It is also the normal state outside the GUI, where
// nothing can measure text.
export function getLabelFitState(rec, pathLength) {
  var width = getMeasuredTextWidth(rec);
  if (!width) return 'unmeasured';
  return width <= pathLength ? 'fits' : 'overflow';
}
