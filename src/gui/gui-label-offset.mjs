// Dragging an anchored label's text away from its anchor: what the drag
// writes, and which of the nine positions it ends up nearest.
//
// A drag does not store a delta. resolveLabelPosition() falls back per
// property rather than summing, so `label-pos=e dx=3` means "east's dy and
// justification, with dx overridden to 3px" and not "3px east of east" -- a
// bare delta would teleport the text to its anchor on the first pixel of
// movement. So a drag materializes the offsets the label is drawn with, adds
// its own movement to them, and drops the position: from then on the label
// carries the numbers rather than a name for them.
//
// The awkward part is text-anchor, which decides both where the block of text
// sits relative to dx and how a moving label reads. Text dragged to the left
// of its anchor should be right-justified, so that growing the font or the
// text extends it away from the point it labels rather than across it -- which
// is what the legacy positioning mode did, and the reason the export font not
// being the browser's does not pull the label back over its symbol. Changing
// the anchor moves the block by half or all of its own width, so dx has to be
// re-expressed against the new anchor in the same breath, which is what makes
// this arithmetic rather than a rule.
//
// Everything here works in the label's own coordinate space -- the space
// inside its symbol group, which is what dx and dy are measured in -- so the
// caller divides pointer movement by the symbol scale on the way in.
//
// See docs/development/label-tool-design.md.

// How far to the left of x the block of text sits, as a fraction of its width.
var anchorOffsets = {start: 0, middle: 0.5, end: 1};

// How far the text's centre has to be from the anchor, as a fraction of the
// text's own width, before it counts as being to one side of it. A quarter of
// the width is the legacy mode's threshold: the middle band is wide enough
// that text dragged straight up or down stays centred, which is the thing a
// user placing a label above a dot is most likely to be doing.
var SIDE_THRESHOLD = 0.25;

// Tenths of a pixel. A drag produces an offset per mouse move and the
// serializer prints what it is given, so a label dragged by hand would
// otherwise carry -12.699999999999999 into the user's data. A tenth of a pixel
// is finer than the gesture can resolve and finer than the map can draw.
var PRECISION = 10;

// The offset and justification a drag writes.
//
// start: {dx, dy, anchor, width, aligned}
//   dx, dy:  the offsets the label is drawn at, in px
//   anchor:  the justification it is drawn with
//   width:   the width of its text, in the same space; 0 if unmeasurable
//   aligned: whether it carries a label-align (see below)
// delta: {dx, dy} -- how far the pointer has moved, in the same space.
//
// Returns {dx, dy, text-anchor, x}, where x is where the text will be drawn
// once the other three are written -- the same as dx except on an aligned
// label. The three have to be written together: applying dx without its
// text-anchor moves the text by half its own width or by all of it.
export function getOffsetDragValues(start, delta) {
  var width = start.width > 0 ? start.width : 0;
  var drawnAnchor = normalizeAnchor(start.anchor);
  // The left edge of the text is what the pointer is actually moving, and the
  // one part of the block that does not depend on the anchor. Working from it
  // is what lets the anchor change mid-drag without the text jumping: the edge
  // stays where the pointer put it, and dx is whatever expresses that edge
  // against the anchor the text has ended up with.
  var left = start.dx + delta.dx - anchorOffsets[drawnAnchor] * width;
  // A label that carries a label-align has already answered the justification
  // question, and text-anchor is not the drag's to change: the renderer honours
  // the alignment over any text-anchor on the record, and corrects x by the
  // width of the block to hold it still while its lines re-justify. Against
  // that correction, 'start' is the one text-anchor whose dx is the left edge
  // itself -- which is also the value that would leave the label where it is
  // if the alignment were later removed.
  var anchor = start.aligned ? 'start' :
    width > 0 ? getAnchorForCentre(left + width / 2, width) : drawnAnchor;
  return {
    dx: round(left + anchorOffsets[anchor] * width),
    dy: round(start.dy + delta.dy),
    'text-anchor': anchor,
    x: round(start.aligned ? start.dx + delta.dx :
      left + anchorOffsets[anchor] * width)
  };
}

// Which side of its anchor the text has ended up on, by where its centre is.
// @centre and @width are in the same units; @width is known to be non-zero.
export function getAnchorForCentre(centre, width) {
  var pct = centre / width;
  if (pct < -SIDE_THRESHOLD) return 'end';
  if (pct > SIDE_THRESHOLD) return 'start';
  return 'middle';
}

// Where the middle of a label's text sits relative to its anchor, given the
// offset and justification it is drawn with. Two offsets are only comparable
// through this: dx=-5 means the text is left of the anchor when it is
// right-justified and right of it when it is not.
export function getTextCentreOffset(dx, anchor, width) {
  return dx + (0.5 - anchorOffsets[normalizeAnchor(anchor)]) * (width > 0 ? width : 0);
}

// The name of the nearest candidate to @point, or '' if there are none.
//
// candidates: [{name, x, y}, ...]
// point: {x, y}
//
// Used for the position the grid marks faintly under a label that has been
// dragged: no cell is lit, because the label carries offsets rather than a
// position, but one of the nine is roughly where it is and clicking it is the
// way back.
export function getNearestPosition(point, candidates) {
  var best = '';
  var bestDist = Infinity;
  (candidates || []).forEach(function(o) {
    var dx = o.x - point.x;
    var dy = o.y - point.y;
    var dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = o.name;
    }
  });
  return best;
}

// An unset text-anchor is 'start', which is both the SVG default and what an
// unpositioned label is drawn with.
function normalizeAnchor(anchor) {
  return anchor in anchorOffsets ? anchor : 'start';
}

function round(px) {
  return Math.round(px * PRECISION) / PRECISION;
}
