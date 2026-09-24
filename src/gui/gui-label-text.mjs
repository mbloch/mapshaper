// Moving label text between the three forms it takes: the string the user
// edits, the value stored in the data table, and the lines that get rendered.
//
// These are not the same string. A real newline cannot travel through a
// mapshaper command -- the parser rejects the line break -- so a multi-line
// label is stored with a two-character "\n" escape. The CLI also accepts a real
// newline and <br>, so reading has to handle all three while writing produces
// only one.
//
// See docs/development/label-tool-design.md.

// Matches all three forms of line break that label text may arrive in, and
// keeps them out of a character class so that "\\n" is matched as a pair.
var ANY_NEWLINE = /\r\n|\\n|<br>|\n|\r/gi;

// A line break the wrapper inserted rather than one the user typed. It consumes
// no character -- the space the line broke at stays before it -- so removing
// every one gives back the text as typed. See
// docs/development/text-annotation-design.md.
var SOFT_BREAK = '<wbr>';
var SOFT_BREAK_RXP = /<wbr>/gi;

// How a label lays out its line breaks, which is not the same for the two kinds.
// An anchored label stacks its lines with <tspan>. A path label joins them with
// a space, because a <tspan> inside a <textPath> advances along the curve
// instead of dropping below it -- which is also what export does.
export var LINES_STACKED = 'stacked';
export var LINES_JOINED = 'joined';

// Text with no glyphs in it makes every SVG character position API fail: the
// caret cannot be placed and the label cannot be clicked. A zero-width space
// gives the text engine something to lay out without putting anything on the
// map, and it stands in for two kinds of nothing -- a label with no text at
// all, and a line the user has just opened with Enter and not yet typed into.
export var TEXT_PLACEHOLDER = '\u200b';

// Data value -> the string the user edits, with real newlines and without the
// wrapper's soft breaks, which are rewrapped rather than edited.
export function decodeLabelText(val) {
  if (val === null || val === undefined || val === '') return '';
  return String(val).replace(ANY_NEWLINE, '\n').replace(SOFT_BREAK_RXP, '');
}

// Data value -> {text, breaks}: the string the user edits, and the offsets in
// it where the stored value has a soft break.
export function readSoftBreaks(val) {
  var str = val === null || val === undefined ? '' : String(val).replace(ANY_NEWLINE, '\n');
  var parts = str.split(SOFT_BREAK_RXP);
  var breaks = [];
  var text = parts[0];
  for (var i = 1; i < parts.length; i++) {
    breaks.push(text.length);
    text += parts[i];
  }
  return {text: text, breaks: breaks};
}

// The string the user edits, plus soft breaks at @breaks (ascending offsets
// into it) -> the same string with the markers written in.
export function insertSoftBreaks(text, breaks) {
  var out = '', prev = 0;
  if (!breaks || breaks.length === 0) return text;
  for (var i = 0; i < breaks.length; i++) {
    out += text.substring(prev, breaks[i]) + SOFT_BREAK;
    prev = breaks[i];
  }
  return out + text.substring(prev);
}

// Where a laid-out text's lines start because they were wrapped, given each
// character's top edge (see gui-label-wrap.mjs).
//
// @getTop(i) returns the top of character i in px, or null for one with no box.
// A line that starts after a typed newline is not a soft break, and neither is
// a character with no box -- the break lands on the next one that has a box.
// The low half of a surrogate pair is never asked about.
export function findSoftBreaks(text, getTop, threshold) {
  var breaks = [], lastTop = null, afterNewline = false, i, c, top;
  for (i = 0; i < text.length; i++) {
    c = text.charCodeAt(i);
    if (c == 10) {
      afterNewline = true;
      continue;
    }
    if (c >= 0xDC00 && c <= 0xDFFF) continue;
    top = getTop(i);
    if (top === null) continue;
    if (lastTop !== null && !afterNewline && top > lastTop + threshold) {
      breaks.push(i);
    }
    lastTop = top;
    afterNewline = false;
  }
  return breaks;
}

export function sameSoftBreaks(a, b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// The string the user edits -> the data value. Newlines become the escape,
// because the command that saves the text has to survive the parser.
export function encodeLabelText(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/\r\n|\n|\r/g, '\\n');
}

// The lines a stacked label renders, in order, each one ready to become a
// <tspan>.
//
// Every line after the first opens with the placeholder, standing in for the
// break that started it. That does two things: an empty line gets something to
// lay out, so a line the user has just opened appears and can hold the caret,
// and the rendered characters stay aligned one-for-one with the edited ones.
//
// @breaks: offsets of soft breaks, which also start a line. A soft break
// consumes no character, so its line gets no placeholder and the alignment
// holds.
export function getRenderedLines(str, breaks) {
  var text = decodeLabelText(str);
  var lines = [], start = 0, lead = '', b = 0, i;
  if (text === '') return [TEXT_PLACEHOLDER];
  breaks = breaks || [];
  for (i = 0; i <= text.length; i++) {
    while (b < breaks.length && breaks[b] < i) b++;
    if (i == text.length || text.charAt(i) == '\n') {
      lines.push(lead + text.substring(start, i));
      start = i + 1;
      lead = TEXT_PLACEHOLDER;
    } else if (breaks[b] === i && i > start) {
      lines.push(lead + text.substring(start, i));
      start = i;
      lead = '';
    }
  }
  return lines;
}

// Whether the text would draw nothing at all: empty, or made only of
// whitespace, line breaks and zero-width placeholders.
//
// The test is "would this put a mark on the map", not "is this string empty",
// because a label of three spaces is as invisible and as unfindable as a label
// of none -- it renders no glyph, has no box worth clicking, and cannot be told
// apart from empty space. Such a label is removed when its editing session
// ends rather than saved.
//
// The placeholder is stripped rather than trimmed away: U+200B is not
// whitespace as far as String.trim() is concerned, being a format character.
export function textHasNoGlyphs(str) {
  return decodeLabelText(str).split(TEXT_PLACEHOLDER).join('').trim() === '';
}

// The string the text engine lays out, which is not the string being edited: a
// line break is not a character any text engine will draw, so each one is
// replaced by one that it will.
//
// Both layouts substitute exactly one character per break -- a space where the
// lines are joined along a path, the zero-width placeholder where they are
// stacked -- so the rendered characters and the edited ones are the same
// sequence at the same indexes. That is what lets the caret arithmetic below be
// the identity: there is no such thing as an edited character with no rendered
// counterpart, which was the whole source of the off-by-a-line-break bugs.
export function getRenderedText(str, layout) {
  var text = decodeLabelText(str);
  return text.replace(/\n/g, layout === LINES_JOINED ? ' ' : TEXT_PLACEHOLDER);
}

// What a joined (path-aligned) label puts in the DOM, which is not quite
// getRenderedText(): an empty one renders the placeholder alone, exactly as
// getRenderedLines() does for the stacked layout.
//
// The placeholder is what gives an empty label a position on its curve. Text
// on a path sits where startOffset and text-anchor put it, which is the middle
// by default -- but an empty <textPath> lays out nothing, so there is nothing
// to ask, and the caret has to fall back on the element's own x/y: the start
// of the path, nowhere near where the first character will land.
export function getRenderedContent(str) {
  var text = getRenderedText(str, LINES_JOINED);
  return text === '' ? TEXT_PLACEHOLDER : text;
}

// Number of characters the text engine lays out for @str.
//
// An empty label is the one place where this is not the edited length: it
// renders the placeholder alone, and reporting zero is what tells the caret to
// fall back on the label's anchor rather than measure a character that stands
// for nothing.
export function getRenderedLength(str, layout) {
  return getRenderedText(str, layout).length;
}

// Where the caret goes in the rendered text, given a caret at @index in the
// edited string.
//
// The indexes match, but which side of a character to sit on still has to be
// decided: the end of one line and the start of the next are one rendered
// character apart, and a caret at the end of a line must not jump to the line
// below.
//
// Returns {index, atEnd, length, zeroWidth} in rendered characters, where
// zeroWidth marks a character that has no advance by design -- see
// gui-label-caret.mjs, which otherwise reads that as an engine failure.
export function getRenderedCaret(str, index, layout) {
  var text = decodeLabelText(str);
  var rendered = getRenderedText(str, layout);
  var length = rendered.length;
  var i = index >= 0 ? Math.min(index, text.length) : 0;
  var o;
  // A caret sitting on a line break belongs at the end of the line the break
  // closes, not before the first character of the next one: those are one
  // rendered character apart but a whole line apart on the map. Joined lines
  // have no such jump -- the break is a space on the same baseline -- so the
  // caret sits before it like any other character.
  if (i >= length || (layout !== LINES_JOINED && text.charAt(i) === '\n')) {
    o = {index: Math.max(i - 1, 0), atEnd: true, length: length};
  } else {
    o = {index: i, atEnd: false, length: length};
  }
  o.zeroWidth = rendered.charAt(o.index) === TEXT_PLACEHOLDER;
  return o;
}

// Maps a rendered character index back onto the edited string, for
// click-to-position: the click lands on a glyph, and the caret has to be
// expressed in the indexes the textarea uses. The two agree, so this only
// guards the ends of the range.
export function getEditIndex(str, renderedIndex, layout) {
  var length = getRenderedLength(str, layout);
  if (!(renderedIndex >= 0)) return 0;
  return Math.min(renderedIndex, length);
}

// Strips the placeholder back out, so that a value read off a rendered node is
// not mistaken for text the user typed.
export function stripPlaceholder(str) {
  return String(str === null || str === undefined ? '' : str)
    .split(TEXT_PLACEHOLDER).join('');
}
