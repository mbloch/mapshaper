// Hover and selection highlights (see getOverlayStyle() in
// gui-overlay-styler.mjs) are sized in CSS pixels from the width of the
// feature as it is drawn, at whatever scale it is drawn: a fine line or a
// small symbol is widened by enough to be seen, and one that is already wide,
// such as a line in a preview at a large scale, by not much more.

// A feature up to this wide (px) is widened by the highlight's extraWidth;
// a wider one by more, growing slowly with its width
var HIGHLIGHT_REFERENCE_WIDTH = 4;
var HIGHLIGHT_GROWTH = 0.3;
// How much wider than its line a handle on the line is drawn (px)
var HANDLE_EXTRA_WIDTH = 4;

// Width in px of the highlight of a feature @width px wide: a line's stroke,
// or the diameter of a circle with its stroke.
// o.minWidth: the narrowest the highlight is drawn
// o.extraWidth: how much wider than the feature the highlight is drawn
export function getHighlightWidth(width, o) {
  var w = width > 0 ? width : 0;
  var k = Math.pow(Math.max(1, w / HIGHLIGHT_REFERENCE_WIDTH), HIGHLIGHT_GROWTH);
  return Math.max(o.minWidth || 0, w + (o.extraWidth || 0) * k);
}

// Radius in px of a handle on a line @lineWidth px wide, such as a curve's
// knot: @radius, or enough to be wider than the line, by a margin that grows
// slowly with the line's width, up to @maxRadius (if given)
export function getHandleRadius(radius, lineWidth, maxRadius) {
  var r = getHighlightWidth(lineWidth, {extraWidth: HANDLE_EXTRA_WIDTH}) / 2;
  if (maxRadius > 0) r = Math.min(r, maxRadius);
  return Math.max(radius, r);
}
