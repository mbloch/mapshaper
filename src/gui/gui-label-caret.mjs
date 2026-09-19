// Caret and selection geometry, computed from the SVG character position APIs.
//
// The APIs behave identically on <text> and on <text><textPath>, so this code
// is shared between anchored and path-aligned labels; the only difference is
// that a curved label also has a per-character rotation to apply.
//
// It is written against a small provider interface rather than against a DOM
// node so that the engine divergences below can be tested against fakes of each
// browser's misbehavior:
//
//   startOfChar(i)   -> {x, y} | throws
//   endOfChar(i)     -> {x, y} | throws
//   rotationOfChar(i)-> degrees
//   extentOfChar(i)  -> {x, y, width, height} | throws
//   renderedCount()  -> glyphs the engine believes it laid out
//   fontSize()       -> px
//   anchor()         -> {x, y}, where an empty label's caret goes
//
// See docs/development/label-tool-design.md.

// Fractions of the font size above and below the baseline. A caret that matched
// the font's real ascent would need font metrics the browser does not expose
// here; these are the conventional approximations.
var ASCENT_RATIO = 0.8;
var DESCENT_RATIO = 0.2;

// Tolerance in px for deciding that two character extents sit on one line.
var LINE_TOLERANCE = 1;

// Caret geometry for a position in the rendered text, or null if there is
// nothing measurable to put it beside.
//
// @request is a {index, atEnd, length} from getRenderedCaret(): which rendered
// character to sit beside and which side of it. It is derived from the model --
// the textarea's selectionStart -- and never from the view. WebKit's
// getNumberOfChars() reports only the glyphs that fit on a path, so clamping an
// index with it would pin the caret mid-string and leave the tail of the text
// uneditable.
export function getCaretGeometry(provider, request) {
  var length = request ? request.length : 0;
  var atEnd = !!(request && request.atEnd);
  var i = clamp(request ? request.index : 0, 0, Math.max(length - 1, 0));
  var pos, angle;
  if (length === 0) return getEmptyCaretGeometry(provider);
  // Walk back to a character the engine actually laid out. An overflowing path
  // label has trailing characters that cannot be measured, and the caret
  // belongs at the end of what is visible rather than nowhere.
  //
  // A character the caller has marked as zero-width is exempt: charIsRendered()
  // reads a missing advance as an engine failure, which is exactly what the
  // placeholder standing in for a line break looks like. Walking back over it
  // would strand the caret at the end of the line above the one the user just
  // opened.
  if (!(request && request.zeroWidth)) {
    while (i >= 0 && !charIsRendered(provider, i)) {
      i--;
      atEnd = true;
    }
    if (i < 0) return getEmptyCaretGeometry(provider);
  }
  pos = atEnd ? tryPoint(provider, 'endOfChar', i) : tryPoint(provider, 'startOfChar', i);
  if (!pos) return getEmptyCaretGeometry(provider);
  angle = tryAngle(provider, i);
  return buildCaret(pos.x, pos.y, angle, provider.fontSize());
}

// Selection bands for the characters in [start, end), as rectangles in the
// label's own coordinate space.
//
// Adjacent characters on one line are merged into a single rectangle, which
// keeps a plain horizontal selection to one rect and limits the faceting on a
// curve to where the extents genuinely step.
export function getSelectionRects(provider, start, end, textLength) {
  var from = clamp(Math.min(start, end), 0, textLength);
  var to = clamp(Math.max(start, end), 0, textLength);
  var rects = [];
  var box, i;
  for (i = from; i < to; i++) {
    box = tryExtent(provider, i);
    if (!box) continue; // e.g. a character past the end of an overflowing path
    if (!mergeInto(rects[rects.length - 1], box)) {
      rects.push({x: box.x, y: box.y, width: box.width, height: box.height});
    }
  }
  return rects;
}

// The box to draw around the label being edited.
//
// @measured is the rendered bounds of the text, from getBBox(). An empty label
// has no glyphs, so it falls back to a caret-sized box at the anchor -- which
// is the whole point of the box for a label that was just created: without it
// there is nothing on screen at all.
export function getLabelBox(provider, measured, textLength, padding) {
  var pad = padding > 0 ? padding : 2;
  var caret;
  if (textLength > 0 && measured && measured.width > 0 && measured.height > 0) {
    return {
      x: measured.x - pad,
      y: measured.y - pad,
      width: measured.width + pad * 2,
      height: measured.height + pad * 2
    };
  }
  caret = getEmptyCaretGeometry(provider);
  if (!caret) return null;
  return {
    x: caret.x - pad,
    y: caret.y - caret.ascent - pad,
    width: pad * 2,
    height: caret.ascent + caret.descent + pad * 2
  };
}

// Which character index a click at @p lands on, for click-to-position.
// Returns an index in [0, textLength], or -1 if the engine cannot say.
//
// The engine reports the character the point is over; whether the caret goes
// before or after it depends on which half was hit, so that clicking the right
// half of the last character puts the caret at the end of the text.
//
// A click that lands on no character at all falls back to the nearer end of
// the text. The region a click can arrive from is wider than the glyphs -- it
// has to be, or a curved label would be dismissed by a near miss -- so the gap
// past the end of the text, and the empty air inside a bowed label's box, are
// places the user can click while plainly pointing at one end or the other.
export function getCaretIndexAtPoint(provider, p, textLength) {
  var i = tryCharAtPoint(provider, p);
  var box;
  if (i < 0 || i >= textLength) return getNearestEnd(provider, p, textLength);
  box = tryExtent(provider, i);
  if (box && p.x > box.x + box.width / 2) return i + 1;
  return i;
}

// 0 or @textLength, whichever end of the text is nearer to @p, or -1 if
// neither can be measured.
function getNearestEnd(provider, p, textLength) {
  var last = textLength - 1;
  var start, end;
  if (!p || !isFinite(p.x) || !isFinite(p.y) || textLength < 1) return -1;
  // The end of the text is the end of the last character the engine laid out,
  // which on an overflowing path label is not the last character there is.
  while (last >= 0 && !charIsRendered(provider, last)) last--;
  start = tryPoint(provider, 'startOfChar', 0);
  end = last < 0 ? null : tryPoint(provider, 'endOfChar', last);
  if (!start) return end ? textLength : -1;
  if (!end) return 0;
  return distanceSq(p, start) <= distanceSq(p, end) ? 0 : textLength;
}

function distanceSq(a, b) {
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Grows @box to cover @caret.
//
// A line the user has just opened with Enter holds nothing but the zero-width
// placeholder, so it adds nothing to getBBox() and the box around the label
// would stop short of the caret sitting on it. Growing the box is how pressing
// Enter shows that a line was started, since the line itself has nothing in it
// to see.
export function growBoxToCaret(box, caret, padding) {
  var pad = padding > 0 ? padding : 2;
  var top, bottom;
  if (!caret) return box;
  if (!box) return null;
  top = Math.min(box.y, caret.y - caret.ascent - pad);
  bottom = Math.max(box.y + box.height, caret.y + caret.descent + pad);
  return {
    x: Math.min(box.x, caret.x - pad),
    y: top,
    width: Math.max(box.x + box.width, caret.x + pad) - Math.min(box.x, caret.x - pad),
    height: bottom - top
  };
}

function getEmptyCaretGeometry(provider) {
  var p = provider.anchor ? provider.anchor() : null;
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
  // The placeholder standing in for the empty text is laid out like any other
  // character, so on a path it has the curve's tangent and the caret can lean
  // with it, the way it does once there is text to lean against. Zero on a
  // straight label, and zero if there is no character to ask.
  return buildCaret(p.x, p.y, tryAngle(provider, 0), provider.fontSize());
}

function buildCaret(x, y, angle, fontSize) {
  var size = fontSize > 0 ? fontSize : 12;
  return {
    x: x,
    y: y,
    angle: angle || 0,
    ascent: size * ASCENT_RATIO,
    descent: size * DESCENT_RATIO
  };
}

// Whether the engine laid out character @i, which is not the same question as
// whether the character exists in the model.
//
// Two engines fail differently and neither can be detected the same way.
// WebKit throws IndexSizeError, which is caught. Chromium returns a degenerate
// point and no error at all, so catching is not enough: a character it did not
// lay out reports no advance, and that is what gives it away.
function charIsRendered(provider, i) {
  var start, end;
  if (i >= provider.renderedCount()) return false;
  start = tryPoint(provider, 'startOfChar', i);
  end = tryPoint(provider, 'endOfChar', i);
  if (!start || !end) return false;
  return start.x !== end.x || start.y !== end.y;
}

function tryPoint(provider, method, i) {
  var p;
  try {
    p = provider[method](i);
  } catch (e) {
    return null; // WebKit throws IndexSizeError past the last fitting glyph
  }
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
  return p;
}

function tryAngle(provider, i) {
  var a;
  try {
    a = provider.rotationOfChar(i);
  } catch (e) {
    return 0;
  }
  return isFinite(a) ? a : 0;
}

function tryExtent(provider, i) {
  var box;
  try {
    box = provider.extentOfChar(i);
  } catch (e) {
    return null;
  }
  if (!box || !isFinite(box.x) || !isFinite(box.y)) return null;
  if (box.width > 0 === false || box.height > 0 === false) return null;
  return box;
}

function tryCharAtPoint(provider, p) {
  var i;
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return -1;
  try {
    i = provider.charAtPoint(p);
  } catch (e) {
    return -1;
  }
  return i >= 0 ? i : -1;
}

// Extends @rect to cover @box if they sit on one line and touch, and reports
// whether it did.
function mergeInto(rect, box) {
  if (!rect) return false;
  if (Math.abs(rect.y - box.y) > LINE_TOLERANCE) return false;
  if (Math.abs(rect.height - box.height) > LINE_TOLERANCE) return false;
  if (box.x > rect.x + rect.width + LINE_TOLERANCE) return false;
  if (box.x + box.width < rect.x - LINE_TOLERANCE) return false;
  rect.width = Math.max(rect.x + rect.width, box.x + box.width) -
    Math.min(rect.x, box.x);
  rect.x = Math.min(rect.x, box.x);
  return true;
}

function clamp(i, min, max) {
  if (!(i >= min)) return min; // also catches undefined and NaN
  return i > max ? max : i;
}
