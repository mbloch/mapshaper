// Sliding a path label's text along its curve, and flipping it across.
//
// Both are one gesture -- a drag on the glyphs, Illustrator's model -- and both
// are answered by the same question about the pointer: where it falls on the
// curve, and which side of it the pointer is on. The first gives an offset
// along the path, the second gives the side; crossing the curve mid-drag flips.
//
// The math is here, away from the tool, because it is worth testing on its own
// and needs nothing from the map: it works on a polyline, which the caller
// flattens the curve into at whatever tolerance suits the view.
//
// See docs/development/label-tool-design.md.

// Where a point falls on a polyline, or null if there is no polyline to fall
// on.
//
// Returns:
//   t:    position of the nearest point, as a fraction of arc length
//   side: which side of the path the point is on, as the sign of the cross
//         product of the segment direction with the offset from it -- 0 when
//         the point is exactly on the line
//   dist: how far the point is from the path
export function projectOntoPolyline(points, p) {
  var best = null;
  var before = 0;
  var total, i, seg;
  if (!points || points.length < 2) return null;
  for (i = 1; i < points.length; i++) {
    seg = projectOntoSegment(points[i - 1], points[i], p);
    if (!best || seg.distSq < best.distSq) {
      best = seg;
      best.at = before + seg.along;
    }
    before += seg.length;
  }
  total = before;
  if (!(total > 0)) return null;
  return {
    t: clamp(best.at / total, 0, 1),
    side: sign(best.cross),
    dist: Math.sqrt(best.distSq)
  };
}

function projectOntoSegment(a, b, p) {
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  var lenSq = dx * dx + dy * dy;
  var t = lenSq > 0 ?
    clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq, 0, 1) : 0;
  var ex = p[0] - (a[0] + t * dx);
  var ey = p[1] - (a[1] + t * dy);
  var length = Math.sqrt(lenSq);
  return {
    length: length,
    along: t * length,
    distSq: ex * ex + ey * ey,
    // Positive on one side of the segment and negative on the other. Which is
    // which does not matter: the gesture only asks whether the pointer is
    // still on the side it started from.
    cross: dx * (p[1] - a[1]) - dy * (p[0] - a[0])
  };
}

// What a drag should be showing, given where it started and where the pointer
// is now.
//
// start:
//   offset: the label's offset when the drag began, in percent
//   t:      the pointer's position on the curve then, as a fraction
//   side:   the side the pointer was on then, or 0 if it began on the curve
// now: a projection from projectOntoPolyline()
//
// The offset moves with the pointer rather than to it, so that grabbing a word
// in the middle of a label does not jerk the label's anchor under the pointer.
// It is measured in the curve's own direction; a flip is applied to it
// afterwards, by getPlacementValues(), because it is the side that decides what
// "afterwards" means.
export function getDragPlacement(start, now) {
  return {
    offset: clamp(start.offset + (now.t - start.t) * 100, 0, 100),
    flipped: !!start.side && !!now.side && now.side != start.side
  };
}

// The properties a placement writes: the offset as it will be stored, the
// text-anchor to go with it, and whether the knots are reversed.
//
// A flip is a reversal of the path, not an attribute -- textPath's `side` is
// not usable in a browser, see "Alignment properties" in the design doc -- so
// the placement has to be carried across the reversal, or the text jumps to the
// far end of the curve as it flips:
//
//   - an offset measured from one end of the path is measured from the other,
//     which is one reason the drag writes percentages: a length would have to
//     be measured against the curve to be turned around;
//   - text-anchor's ends swap with the path's, so that the text keeps the
//     stretch of curve it was on rather than being reflected about its anchor.
//
// anchor: the label's text-anchor, or '' when it has none (which renders as
//   middle, and so needs nothing written for it)
export function getPlacementValues(placement, anchor) {
  return {
    offset: formatOffsetPct(placement.flipped ?
      100 - placement.offset : placement.offset),
    anchor: placement.flipped ? swapTextAnchor(anchor) : anchor,
    reversed: !!placement.flipped
  };
}

// start <-> end. Anything else, including nothing at all, is middle by another
// name and is its own opposite.
export function swapTextAnchor(anchor) {
  if (anchor == 'start') return 'end';
  if (anchor == 'end') return 'start';
  return anchor;
}

// The label's current offset in percent, or null.
//
// A value in any other unit is one this GUI did not write -- startOffset also
// takes a length -- and there is no turning it into a percentage here: that
// would need the curve's length in the units the length is expressed in. The
// caller falls back on where the pointer is instead, which makes the first move
// of a drag pick the text up rather than slide it.
export function parseOffsetPct(value) {
  var str = value === 0 ? '0' : String(value || '').trim();
  var num;
  if (!/%$/.test(str)) return null;
  num = parseFloat(str);
  return isNaN(num) ? null : clamp(num, 0, 100);
}

// The offset a drag starts from, in percent.
//
// A label this tool placed carries no offset at all -- it is where its
// text-anchor puts it -- so the common case is the default rather than a
// stored value, and getting it wrong would jerk the text on the first move of
// every drag. A value that is there but unreadable is a different matter: the
// pointer's own position stands in, which picks the text up instead of sliding
// it, and is the best that can be done without knowing the curve's length in
// the units the value is written in.
//
// value:      the label's label-start-offset, if any
// anchor:     its text-anchor, or ''
// pointerPct: where the pointer is on the curve, in percent
export function getStartOffsetPct(value, anchor, pointerPct) {
  var pct = parseOffsetPct(value);
  if (pct !== null) return pct;
  return value === undefined || value === null || value === '' ?
    getDefaultOffsetPct(anchor) : pointerPct;
}

// Where the text sits when no offset is written, which depends on text-anchor:
// the offset positions the text's anchor, so the two have to agree. Mirrors
// getDefaultStartOffset() in svg-label-paths.mjs.
export function getDefaultOffsetPct(anchor) {
  if (anchor == 'start') return 0;
  if (anchor == 'end') return 100;
  return 50;
}

// Two decimals is a hundredth of a curve -- well under a pixel on any curve
// short enough to hold a label -- and it keeps a dragged offset from writing a
// float's worth of digits into the session history.
export function formatOffsetPct(pct) {
  return trimZeros(clamp(pct, 0, 100).toFixed(2)) + '%';
}

function trimZeros(str) {
  return str.indexOf('.') == -1 ? str : str.replace(/\.?0+$/, '');
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

function sign(val) {
  return val > 0 ? 1 : val < 0 ? -1 : 0;
}
