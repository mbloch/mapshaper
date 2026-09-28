import { internal } from './gui-core';
import {
  readLabelValue, writeLabelValue, sameSoftBreaks, encodeLabelText, findSoftBreaks
} from './gui-label-text';

// Wrapping a text block to its label-width, with the browser's own line
// breaker.
//
// There is no API that reports where a browser breaks lines, so the text is
// laid out in an offscreen <div> at the label's width and font, and read back:
// Range.getClientRects() gives each character's line box, and a character
// sitting lower than the one before it starts a line. Everything the browser
// knows about line breaking -- UAX #14 classes, breaks after hyphens, none at
// no-break spaces, CJK, dictionary breaking for Thai -- comes with it.
//
// The font is read back from a rendered sample of the label rather than
// assembled from the record, so that the layer's defaults and any inline css
// apply exactly as they do on the map.
//
// See docs/development/text-annotation-design.md.

// Properties that change where lines break, and so the ones a change to which
// has to rewrap a text block.
export var WRAP_FIELDS = ['label-width', 'font-family', 'font-size',
  'font-weight', 'font-style', 'font-stretch', 'letter-spacing', 'css'];

var COPIED_STYLES = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'fontStretch', 'fontVariant', 'fontKerning', 'fontFeatureSettings',
  'fontVariationSettings', 'letterSpacing', 'wordSpacing', 'textTransform'];

// Lines are laid out far apart, so that a character in a fallback font sitting
// a little higher or lower than its neighbours is not mistaken for a new line.
var LINE_HEIGHT = 3;

var CACHE_LIMIT = 2000;
var cache = new Map();
var wrapper = null;

// The label's width in px, or 0 for a label that does not wrap.
export function getLabelWrapWidth(rec) {
  var w = rec ? Number(rec['label-width']) : 0;
  return w > 0 && isFinite(w) ? w : 0;
}

// Offsets into @text (real newlines, no soft breaks) where a line starts
// because it was wrapped, in ascending order.
//
// @bold: the text's bold stretches, as [start, end) offsets into it. A bold
// word is wider, so it moves the breaks.
export function getSoftBreaks(text, rec, bold) {
  var width = getLabelWrapWidth(rec);
  var key, breaks;
  if (!width || !text) return [];
  bold = bold || [];
  key = getWrapKey(text, rec, bold);
  if (cache.has(key)) return cache.get(key);
  breaks = measureSoftBreaks(text, rec, width, bold);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, breaks);
  return breaks;
}

// A stored label-text value, rewrapped for @rec's width and font. Returned
// unchanged when neither the old value nor the new one has a soft break, so
// that a label that does not wrap keeps the line breaks it was written with.
export function rewrapLabelValue(value, rec) {
  var o = readLabelValue(value);
  var breaks = getSoftBreaks(o.text, rec, o.bold);
  if (sameSoftBreaks(o.breaks, breaks)) return value;
  return encodeLabelText(writeLabelValue(o.text, breaks, o.bold));
}

export function clearWrapCache() {
  cache.clear();
}

function getWrapKey(text, rec, bold) {
  var parts = [text];
  WRAP_FIELDS.forEach(function(name) {
    var val = rec[name];
    parts.push(val === null || val === undefined ? '' : String(val));
  });
  parts.push(rec['class'] || '');
  parts.push(bold.join(';'));
  return parts.join('\u0000');
}

function measureSoftBreaks(text, rec, width, bold) {
  var w = getWrapper();
  var style, fontSize, pieces, range;
  if (!w) return [];
  style = getLabelFontStyle(w, rec);
  if (!style) return [];
  COPIED_STYLES.forEach(function(name) {
    w.div.style[name] = style[name] || '';
  });
  w.div.style.width = width + 'px';
  pieces = writeRuns(w.div, text, bold);
  fontSize = parseFloat(style.fontSize) || 12;
  range = document.createRange();
  var breaks = findSoftBreaks(text, function(i) {
    var piece = findPiece(pieces, i);
    var end = isHighSurrogate(text.charCodeAt(i)) ? i + 2 : i + 1;
    var r;
    range.setStart(piece.node, i - piece.start);
    range.setEnd(piece.node, Math.min(end, piece.end) - piece.start);
    r = range.getBoundingClientRect();
    return r.height > 0 ? r.top : null;
  }, fontSize * LINE_HEIGHT / 2);
  w.div.textContent = '';
  return breaks;
}

// Lays @text out in @div a run at a time, the bold ones in bold spans, and
// returns each run's text node with the offsets it covers: [{node, start,
// end}]. Offsets in the text become offsets in one of these nodes.
function writeRuns(div, text, bold) {
  var pos = 0;
  div.textContent = '';
  return internal.svg.getBoldRuns(text, bold, 0, text.length).map(function(run) {
    var node = document.createTextNode(run.text);
    var span;
    if (run.bold) {
      span = document.createElement('span');
      span.style.fontWeight = internal.svg.LABEL_BOLD_WEIGHT;
      span.appendChild(node);
      div.appendChild(span);
    } else {
      div.appendChild(node);
    }
    pos += run.text.length;
    return {node: node, start: pos - run.text.length, end: pos};
  });
}

function findPiece(pieces, i) {
  for (var j = 0; j < pieces.length; j++) {
    if (i < pieces[j].end) return pieces[j];
  }
  return pieces[pieces.length - 1];
}

function isHighSurrogate(c) {
  return c >= 0xD800 && c <= 0xDBFF;
}

// The computed font of @rec's label, from a sample rendered by the same code
// as the map, inside the defaults a label inherits from its layer's group.
function getLabelFontStyle(w, rec) {
  var sample = Object.assign({}, rec, {'label-text': 'x'});
  var node, cs, out;
  delete sample['label-align'];
  w.svg.innerHTML = internal.svg.stringify({
    tag: 'g',
    properties: internal.getLabelTextDefaults(),
    children: [internal.svg.renderStyledLabel(sample)]
  });
  node = w.svg.querySelector('text');
  if (!node) return null;
  cs = window.getComputedStyle(node);
  out = {};
  COPIED_STYLES.forEach(function(name) {
    out[name] = cs[name];
  });
  w.svg.innerHTML = '';
  return out;
}

// Positioned off the page rather than hidden with display:none, which gives an
// element no layout and its text no lines.
function getWrapper() {
  var box, div, svg;
  if (wrapper) return wrapper;
  if (typeof document == 'undefined') return null;
  box = document.createElement('div');
  box.setAttribute('class', 'label-wrap-measure');
  box.setAttribute('aria-hidden', 'true');
  div = document.createElement('div');
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'break-word';
  div.style.lineHeight = String(LINE_HEIGHT);
  div.style.padding = '0';
  div.style.border = '0';
  div.style.boxSizing = 'content-box';
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  box.appendChild(div);
  box.appendChild(svg);
  document.body.appendChild(box);
  wrapper = {div: div, svg: svg};
  return wrapper;
}
