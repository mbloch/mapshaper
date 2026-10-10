import { renderLabel, splitLabelLineRuns, toLabelString,
  DEFAULT_LABEL_FONT_SIZE, DEFAULT_LINE_HEIGHT } from '../svg/svg-labels';
import { resolveLabelPosition, isSvgNumber } from '../svg/svg-properties';
import { getLabelPadding, labelHasBackground } from '../svg/svg-label-box';
import { labelHasHalo, DEFAULT_HALO_COLOR } from '../svg/svg-label-halo';
import { getLabelTextDefaults } from '../svg/mapshaper-svg';
import { stringEscape } from '../svg/svg-stringify';

// Anchored labels and text blocks as HTML text, for HTML output with
// html-labels. The label's callout and icon stay in the SVG overlay; its text,
// background and padding become a <div> laid over the map, styled by CSS
// classes.
//
// The text is put where SVG would draw it: its first baseline at the label's
// y offset, and its text-anchor edge at its x offset, so that a callout drawn
// in SVG still meets it. CSS places an absolutely positioned element by its
// edges and not by a baseline, so each label is two elements:
//
// - .ms-label, at the anchor: a flex row aligning its items' baselines, the
//   first of them an empty strut STRUT px tall, whose baseline is its bottom.
//   The strut is taller than any label, so the shared baseline is STRUT px
//   down, and a negative margin of as much puts it on the anchor.
// - .ms-label-box, the label, whose baseline is its first line's: a flex
//   container's is, which an inline-block's is not. Its offsets and its
//   anchor are then left, top and a translation.
//
// Flex layout rather than an inline box on a zero-height line, which does the
// same in a standards-mode page and not in a quirks-mode one, and a fragment
// can be pasted into either.
//
// Padding and background are the box's own, so they fit the text the browser
// lays out rather than an estimate of it. Lines break where the SVG label's
// do, soft breaks included, and do not rewrap.
//
// A halo is a copy of the text beneath it, as in SVG output, rather than a
// stroke with paint-order, which Chrome and Safari apply a glyph at a time.
// The two copies share one grid cell, so they lay out identically.

var CLASS_PREFIX = 'ms-label-style-';
var STRUT = 10000;
// Most px between the copies of the glyphs a halo is drawn with
var HALO_SPACING = 1.5;

var ANCHOR_SHIFTS = {start: 0, middle: 0.5, end: 1};
var TEXT_ALIGN = {start: 'left', middle: 'center', end: 'right'};

// CSS for the elements every HTML label is built from, scoped to @selector
export function getHtmlLabelCss(selector) {
  return [
    `${selector} .ms-labels {position:absolute;top:0;left:0;width:100%;height:100%;}`,
    `${selector} .ms-label {position:absolute;display:flex;align-items:baseline;width:0;height:0;margin-top:-${STRUT}px;white-space:nowrap;text-align:left;}`,
    `${selector} .ms-label::before {content:"";height:${STRUT}px;}`,
    `${selector} .ms-label-box {display:flex;flex:none;position:relative;font-weight:normal;font-style:normal;letter-spacing:normal;text-transform:none;}`,
    `${selector} .ms-label-text {display:grid;}`,
    `${selector} .ms-label-text > span {grid-area:1/1;}`,
    `${selector} .ms-label-halo {color:transparent;}`,
    `${selector} .ms-label b {font-weight:bold;}`
  ].join('\n');
}

// Collects the style classes of a map's HTML labels. One class per distinct
// combination of properties, as with the SVG overlay's text classes.
export function HtmlLabelClasses() {
  var classes = [];
  var index = {};
  return {
    classes: classes,
    get: function(style) {
      var key = getStyleKey(style);
      if (!key) return '';
      if (!(key in index)) {
        index[key] = CLASS_PREFIX + classes.length;
        classes.push({name: index[key], style: style});
      }
      return index[key];
    }
  };
}

// Whether @rec draws a label that HTML output can write as HTML: one with
// text. A path label is told apart by its geometry, by the caller.
export function labelHasHtmlText(rec) {
  return toLabelString(rec && rec['label-text']).trim() !== '';
}

// The .ms-label-box element for @recArg, as an HTML string.
// @classes: from HtmlLabelClasses()
export function renderHtmlLabelBox(recArg, classes) {
  var rec = resolveLabelPosition(recArg);
  var defaults = getLabelTextDefaults();
  // the same offsets as the SVG label, label-align correction included
  var svg = renderLabel(rec).properties;
  var anchor = rec['text-anchor'] in ANCHOR_SHIFTS ? rec['text-anchor'] : defaults['text-anchor'];
  var pad = getLabelPadding(rec);
  var content = renderContent(rec);
  var boxClass = classes.get(getBoxStyle(rec, anchor, pad, defaults));
  var textClass = classes.get(getTextStyle(rec));
  var position = 'left:' + formatLength(svg.x) + ';top:' + formatLength(svg.y) + ';' +
    getAnchorTransform(anchor, pad);
  var text = '';
  if (labelHasHalo(rec)) {
    text += `<span class="ms-label-halo ${classes.get(getHaloStyle(rec))}">${content}</span>`;
  }
  text += `<span${formatClass(classes.get(getStrokeStyle(rec)))}>${content}</span>`;
  return `<div class="${stringEscape(joinClasses('ms-label-box', boxClass, rec.class))}" style="${stringEscape(position)}">` +
    `<div class="${joinClasses('ms-label-text', textClass)}"${formatStyle(rec.css)}>${text}</div></div>`;
}

// The label's lines, with soft and hard breaks alike as <br>, and bold runs
// as <b>
function renderContent(rec) {
  return splitLabelLineRuns(toLabelString(rec['label-text'])).map(function(runs) {
    return runs.map(function(run) {
      var str = stringEscape(run.text);
      return run.bold ? '<b>' + str + '</b>' : str;
    }).join('');
  }).join('<br>');
}

// Moves the box from its left edge being at x to its text-anchor edge being
// there. The anchor edge is the text's, inside the padding.
function getAnchorTransform(anchor, pad) {
  var left = pad ? pad.left : 0;
  var right = pad ? pad.right : 0;
  var k = ANCHOR_SHIFTS[anchor];
  var px = roundPx(-left * (1 - k) + right * k);
  var pct = -k * 100;
  if (!pct && !px) return '';
  if (!px) return `transform:translateX(${pct}%);`;
  if (!pct) return `transform:translateX(${px}px);`;
  return `transform:translateX(calc(${pct}% + ${px}px));`;
}

// Everything is set, defaults included, so that the page's own styles do not
// reach the labels -- SVG output gets its defaults from the layer's group.
function getBoxStyle(rec, anchor, pad, defaults) {
  var style = {
    'font-family': rec['font-family'] || defaults['font-family'],
    'font-size': formatLength(rec['font-size'] || DEFAULT_LABEL_FONT_SIZE),
    'line-height': formatLineHeight(rec['line-height']),
    'text-align': TEXT_ALIGN[anchor],
    color: withOpacity(rec.fill || '#000', rec['fill-opacity'])
  };
  copyProperties(rec, style, ['font-weight', 'font-style', 'font-stretch']);
  if (hasValue(rec['letter-spacing'])) {
    style['letter-spacing'] = formatLength(rec['letter-spacing']);
  }
  if (labelHasBackground(rec)) {
    style['background-color'] = withOpacity(rec['label-background'],
      rec['label-background-opacity']);
  }
  if (pad) {
    style.padding = formatPadding(pad);
  }
  return style;
}

// The shortest CSS shorthand for @pad
function formatPadding(pad) {
  var vals = [pad.top, pad.right, pad.bottom, pad.left].map(function(n) {
    return roundPx(n) + 'px';
  });
  if (vals[3] == vals[1]) vals.pop();
  if (vals.length == 3 && vals[2] == vals[0]) vals.pop();
  if (vals.length == 2 && vals[1] == vals[0]) vals.pop();
  return vals.join(' ');
}

// On the text and not the box: a label's opacity is its text's, and its
// background has an opacity of its own.
function getTextStyle(rec) {
  return isTranslucent(rec.opacity) ? {opacity: Number(rec.opacity)} : {};
}

function getHaloStyle(rec) {
  var style = {
    'text-shadow': getHaloShadows(Number(rec['halo-width']),
      String(rec['halo-color'] || DEFAULT_HALO_COLOR))
  };
  if (isTranslucent(rec['halo-opacity'])) {
    style.opacity = Number(rec['halo-opacity']);
  }
  return style;
}

// A halo as copies of the glyphs offset all round them, in rings out to
// @width, close enough together to leave no gaps -- even beside a stem
// thinner than the halo is wide, which a single ring of copies would show.
// Not -webkit-text-stroke, which Chrome draws with mitred joins: spikes on
// M, V and W that SVG's round joins do not have, and no property to change
// them.
function getHaloShadows(width, color) {
  var rings = Math.max(1, Math.ceil(width / HALO_SPACING));
  var shadows = [];
  var r, n, i, a;
  for (var j = 1; j <= rings; j++) {
    r = width * j / rings;
    n = Math.max(8, Math.ceil(2 * Math.PI * r / HALO_SPACING));
    for (i = 0; i < n; i++) {
      a = (i + j / 2) / n * 2 * Math.PI;
      shadows.push(roundPx(Math.cos(a) * r) + 'px ' + roundPx(Math.sin(a) * r) + 'px 0 ' + color);
    }
  }
  return shadows.join(',');
}

// A stroke of the label's own, which SVG draws over the fill. A halo replaces
// it, as it does in SVG.
function getStrokeStyle(rec) {
  var color = rec.stroke;
  if (labelHasHalo(rec) || !color || color == 'none') return {};
  return {
    '-webkit-text-stroke': formatLength(hasValue(rec['stroke-width']) ? rec['stroke-width'] : 1) +
      ' ' + withOpacity(color, rec['stroke-opacity'])
  };
}

function formatLineHeight(val) {
  if (!hasValue(val)) return String(DEFAULT_LINE_HEIGHT);
  return String(val);
}

// A bare number is px, as in SVG
function formatLength(val) {
  return isSvgNumber(val) ? roundPx(Number(val)) + 'px' : String(val).trim();
}

function withOpacity(color, opacity) {
  if (!isTranslucent(opacity)) return String(color);
  return `color-mix(in srgb, ${color} ${roundPx(Math.max(0, Number(opacity)) * 100)}%, transparent)`;
}

function isTranslucent(val) {
  return isSvgNumber(val) && Number(val) < 1;
}

function hasValue(val) {
  return val !== undefined && val !== null && val !== '';
}

function copyProperties(src, dest, names) {
  names.forEach(function(k) {
    if (hasValue(src[k])) dest[k] = src[k];
  });
}

function roundPx(n) {
  return Math.round(n * 100) / 100;
}

function joinClasses() {
  return Array.from(arguments).filter(Boolean).map(String).join(' ');
}

function formatClass(name) {
  return name ? ` class="${name}"` : '';
}

// inline CSS from the css property, as SVG output puts on the <text>
function formatStyle(css) {
  return css ? ` style="${stringEscape(css)}"` : '';
}

function getStyleKey(style) {
  return Object.keys(style).sort().map(function(k) {
    return k + ':' + style[k];
  }).join(';');
}
