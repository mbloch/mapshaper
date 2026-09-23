import { applyStyleAttributes, resolveLabelPosition, getLabelPositionAnchor,
  parseSvgMeasure } from '../svg/svg-properties';
import { getAlignmentShift } from '../svg/svg-label-align';
import { applyLabelHalo } from '../svg/svg-label-halo';
import utils from '../utils/mapshaper-utils';

// Accepting \n (two chars) as an alternative to the newline character
// (sometimes, '\n' is not converted to newline, e.g. in a Makefile)
// Also accepting <br>
export var labelNewlineRxp = /\n|\\n|<br>/i;

// The size a label is drawn at when it carries none of its own, which is the
// size its layer's group supplies (see getLabelTextDefaults()). Shared with
// that function rather than written twice: the em offsets the label positions
// use are resolved against this number, and a correction computed against a
// different one would put the label somewhere it is not drawn.
export var DEFAULT_LABEL_FONT_SIZE = 12;

export function toLabelString(val) {
  if (val || val === 0 || val === false) return String(val);
  return '';
}

// Kludge for applying fill and other styles to a <text> element
// (for rendering labels in the GUI with the dot in Canvas, not SVG)
export function renderStyledLabel(recArg) {
  // Resolved once and used for both, so that the offsets a position implies and
  // the justification it implies cannot come from different places: text-anchor
  // is written by applyStyleAttributes() and dx/dy by renderLabel().
  var rec = resolveLabelPosition(recArg);
  var o = renderLabel(rec);
  applyStyleAttributes(o, 'label', rec);
  return applyLabelHalo(o, rec);
}

export function renderLabel(recArg) {
  // Idempotent, and free on a record that has no position to resolve or has
  // already been through it, so calling it here as well costs nothing and means
  // every way into the renderer draws a label in the position it is stored in.
  var rec = resolveLabelPosition(recArg);
  var line = toLabelString(rec['label-text']);
  var morelines, obj;
  var newline = labelNewlineRxp;
  var dx = applyAlignmentShift(rec);
  var dy = rec.dy || 0;
  var properties = {
    // using x, y instead of dx, dy for shift, because Illustrator doesn't apply
    // dx value when importing text with text-anchor=end
    y: dy,
    x: dx
  };
  if (newline.test(line)) {
    morelines = line.split(newline);
    line = morelines.shift();
  }
  obj = {
    tag: 'text',
    value: line,
    properties: properties
  };
  if (morelines) {
    // multiline label
    obj.children = [];
    morelines.forEach(function(line) {
      var tspan = {
        tag: 'tspan',
        value: line,
        properties: {
          x: dx,
          dy: rec['line-height'] || '1.1em'
        }
      };
      obj.children.push(tspan);
    });
  }
  return obj;
}

// The label's dx, moved to leave its block of text where its position put it
// when label-align re-justifies the lines inside it. Returns dx untouched when
// there is nothing to correct, so a label without an alignment keeps the value
// it was stored with, in the units it was stored in.
//
// Only anchored labels are corrected. A path label's text follows its curve
// from a start offset, so its alignment picks which part of the text sits at
// that point -- there is no block beside an anchor to hold still, and its dx
// means an offset from the path rather than from a point.
function applyAlignmentShift(rec) {
  var dx = rec.dx || 0;
  var shift = getAlignmentShift(rec, getLabelPositionAnchor(rec));
  var px;
  if (!shift) return dx;
  px = toPixels(dx, rec['font-size']);
  // A dx in units the shift cannot be added to -- pt, %, anything but px and
  // em -- keeps its value, and the block moves as it did before. Correcting it
  // would mean choosing a pixel size for a unit whose whole point is that
  // something else decides.
  if (px === null) return dx;
  return roundShift(px + shift);
}

// Everything a record says about where its text sits relative to its anchor,
// resolved into numbers: the offsets the text is drawn at in px, and the
// justification it is drawn with.
//
// This is what dragging a label starts from. A drag materializes the position
// the label was in and adds its own delta to it, and the numbers it starts
// from have to be the ones the label is actually drawn with -- otherwise the
// text jumps on the first pixel of movement. Hence resolving it here, through
// the same functions as the renderer above, rather than in the GUI against a
// second copy of the rules.
//
// An offset in units this cannot convert -- pt, %, anything but px and em --
// resolves to 0. The alternative is refusing the drag over a value that
// reaches a label only from an expression or a data file, and a drag that puts
// the text where the pointer is says more about where it went than a gesture
// that does nothing.
export function getDrawnLabelOffset(recArg) {
  var rec = resolveLabelPosition(recArg);
  var dx = toPixels(applyAlignmentShift(rec), rec['font-size']);
  var dy = toPixels(rec.dy || 0, rec['font-size']);
  return {
    dx: dx === null ? 0 : dx,
    dy: dy === null ? 0 : dy,
    'text-anchor': rec['text-anchor'] || ''
  };
}

// A measure in px, or null if it cannot be known.
//
// An em value needs the font size it is relative to. Most labels do not carry
// one: the six positions that hold text clear of its anchor offset it in ems,
// and font-size is usually inherited from the layer's group rather than set on
// the label -- so a missing size is the normal case here and not a reason to
// give up. It resolves against the same default the renderer applies, which is
// why that default is one constant and not two.
//
// What is left is a size that is neither a number nor absent, or a measure in
// units the correction cannot be expressed in -- pt, %, anything but px and
// em. Those keep their value, because correcting them would mean choosing a
// pixel size for a unit whose whole point is that something else decides.
function toPixels(measure, fontSizeArg) {
  var val = parseSvgMeasure(measure);
  var fontSize = fontSizeArg === undefined || fontSizeArg === null ||
    fontSizeArg === '' ? DEFAULT_LABEL_FONT_SIZE : Number(fontSizeArg);
  var em;
  if (utils.isFiniteNumber(val)) return val;
  em = /^(-?[.0-9]+)em$/.exec(String(val));
  if (!em) return null;
  if (fontSize > 0 === false) return null;
  return Number(em[1]) * fontSize;
}

// Tenths of a pixel. The serializer prints what it is given, and a correction
// is a product of two measurements -- left alone it arrives as
// 4.800000000000001.
function roundShift(px) {
  return Math.round(px * 10) / 10;
}
