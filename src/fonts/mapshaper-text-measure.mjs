import { setTextMeasureFunction } from '../svg/svg-label-metrics';
import { labelNewlineRxp, toLabelString, DEFAULT_LABEL_FONT_SIZE } from '../svg/svg-labels';
import { parseSvgMeasure } from '../svg/svg-properties';
import { findFontFace } from './mapshaper-font-lookup';
import { runningInBrowser } from '../mapshaper-env';
import require from '../mapshaper-require';
import { warnOnce } from '../utils/mapshaper-logging';

// Measuring a label's text outside a browser, from the font files installed on
// this computer.
//
// The GUI measures by rendering (gui-label-measure.mjs) and the core asks it
// for widths through svg-label-metrics.mjs. Nothing answered that question in
// Node, so `-style label-align=left` from the command line re-justified a
// label's lines and left the block where it was, and the path-fit check could
// not tell whether a label was longer than its curve.
//
// Advance widths plus kerning, which is what a browser lays out with: summing
// hmtx advances alone is exact for most text but out by up to 5% on strings
// like "AVATAR Toledo", and the pair positioning that closes that gap is what
// fontkit's layout() applies. Measured against Chrome on the same fonts, this
// agrees to a hundredth of a pixel.
//
// See docs/development/label-tool-design.md.

// Weight keywords. Anything else is a number, or 400 if it is not.
var WEIGHT_NAMES = {normal: 400, bold: 700, lighter: 300, bolder: 700};

var fontCache = {};

// Installed for every Node use of mapshaper -- the CLI, the API and a script
// that only exports -- rather than at one entry point, because a width is read
// during rendering and export, which both of those reach without going near a
// command of their own. Costs nothing until a label is measured: no font is
// read, and fontkit is not even loaded, until then.
export function initNodeTextMeasurement() {
  if (runningInBrowser()) return false;
  setTextMeasureFunction(measureLabelText);
  return true;
}

// The width of @rec's text in px, or null if it cannot be known -- an unusable
// record, a font this computer does not have, or a font file that will not
// parse. Null is what every reader already falls back from.
export function measureLabelText(rec) {
  var text = toLabelString(rec && rec['label-text']);
  var font, fontSize, spacing, width;
  if (!text) return null;
  font = getFontForRecord(rec);
  if (!font) return null;
  fontSize = getFontSizeInPx(rec);
  spacing = getLetterSpacingInPx(rec, fontSize);
  if (!(fontSize > 0)) return null;
  // The widest line, which is what the block of a multi-line label is as wide
  // as, and what the browser's getBBox() reports for the same text.
  width = text.split(labelNewlineRxp).reduce(function(max, line) {
    var w = measureLine(font, line, fontSize, spacing);
    return w > max ? w : max;
  }, 0);
  return width > 0 ? width : null;
}

// Font units scaled to the size the label is drawn at, plus letter-spacing.
//
// Spacing is added after every character including the last, which is what the
// browser does -- letter-spacing=2 on a four-character label widens it by 8px,
// not 6.
function measureLine(font, line, fontSize, spacing) {
  var chars = Array.from(line).length;
  var advance;
  if (!line) return 0;
  try {
    advance = font.layout(line).advanceWidth;
  } catch (e) {
    return 0;
  }
  return advance / font.unitsPerEm * fontSize + chars * spacing;
}

// The font a record is drawn in, opened and remembered. A record with no
// font-family is drawn in the layer group's default, the same one the GUI
// measures against -- see getLabelTextDefaults().
function getFontForRecord(rec) {
  var family = rec['font-family'] || 'sans-serif';
  var weight = getFontWeight(rec);
  var italic = isItalic(rec);
  var stretch = rec['font-stretch'] || '';
  var key = [family, weight, italic ? 'i' : 'n', stretch].join('|');
  if (!(key in fontCache)) {
    fontCache[key] = openFace(findFontFace(family, weight, italic, stretch),
      family, weight);
  }
  return fontCache[key];
}

function openFace(face, family, weight) {
  var fontkit = loadFontkit();
  var font;
  if (!face || !fontkit) {
    // Once per font, and only for a font the user named: a label falling back
    // to the layer default is the ordinary case and not worth a warning, but a
    // label asking for a font this computer has not got is worth knowing
    // about, because its alignment is the thing that will be wrong.
    if (!face && family != 'sans-serif') {
      warnOnce('[label] Unable to measure text in font "' + family +
        '" (not installed?); alignment may be off.');
    }
    return null;
  }
  try {
    font = fontkit.openSync(face.path, face.postscriptName || undefined);
    return font ? applyVariation(font, weight) : null;
  } catch (e) {
    return null;
  }
}

// A variable font set to the weight asked for. One file covers a range of
// weights, and its glyphs are wider at the heavy end: measuring at the file's
// default instance would report Light widths for Bold text. Only the weight
// axis is applied, because that is the one a label can ask for -- slant and
// width usually arrive as separate faces, which the lookup has already chosen
// between.
function applyVariation(font, weight) {
  var settings = getVariationSettings(font.variationAxes, weight);
  if (!settings) return font;
  try {
    return font.getVariation(settings) || font;
  } catch (e) {
    return font;
  }
}

// The variation to set, or null for a font that is not variable or is already
// at the weight wanted. A weight outside the axis is clamped to it, the way a
// browser does.
export function getVariationSettings(axes, weight) {
  var axis = axes && axes.wght;
  var val;
  if (!axis) return null;
  val = Math.max(axis.min, Math.min(axis.max, weight));
  return val == axis.default ? null : {wght: val};
}

// px, for a font-size that may be a number, a px value, an em value relative
// to the layer default, or a pt value. Anything else takes the default rather
// than failing the measurement: a size mapshaper cannot read is one the
// renderer is also reading its own way, and a width from the default size is
// closer than no width at all.
export function getFontSizeInPx(rec) {
  var val = rec && rec['font-size'];
  var px = toPixelMeasure(val, DEFAULT_LABEL_FONT_SIZE);
  return px === null ? DEFAULT_LABEL_FONT_SIZE : px;
}

// px, for a letter-spacing relative to the label's own size rather than to the
// layer default: 0.1em on 24px text is 2.4px.
export function getLetterSpacingInPx(rec, fontSize) {
  var px = toPixelMeasure(rec && rec['letter-spacing'], fontSize);
  return px === null ? 0 : px;
}

export function getFontWeight(rec) {
  var val = rec && rec['font-weight'];
  var named = WEIGHT_NAMES[String(val).toLowerCase()];
  if (named) return named;
  return Number(val) > 0 ? Number(val) : 400;
}

export function isItalic(rec) {
  var val = String(rec && rec['font-style'] || '').toLowerCase();
  return val == 'italic' || val == 'oblique';
}

function toPixelMeasure(val, emBasis) {
  var measure, match;
  // An absent value is not a zero: a label with no font-size of its own is
  // drawn at the layer's size, and one with no letter-spacing is not spaced.
  if (val === null || val === undefined || val === '') return null;
  measure = parseSvgMeasure(val);
  if (typeof measure == 'number' && !isNaN(measure)) return measure;
  match = /^(-?[.0-9]+)(em|px|pt)$/.exec(String(measure));
  if (!match) return null;
  if (match[2] == 'em') return Number(match[1]) * emBasis;
  if (match[2] == 'pt') return Number(match[1]) * 4 / 3;
  return Number(match[1]);
}

function loadFontkit() {
  if (runningInBrowser()) return null;
  try {
    return require('fontkit') || null;
  } catch (e) {
    warnOnce('[label] fontkit is not available; labels cannot be measured.');
    return null;
  }
}

// For tests, and for a session that has installed a font since it started.
export function clearMeasuredFontCache() {
  fontCache = {};
}
