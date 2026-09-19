import { getMeasuredTextWidth } from './svg-label-metrics';

// Line justification, as a property of its own because SVG has no such thing.
//
// text-anchor does two jobs at once: it justifies the lines of a label, and it
// decides where the block of them sits relative to x. A label pinned north of
// its anchor is centred on x because that is what its position means, so a user
// who asks for left-aligned lines and gets text-anchor=start has answered the
// first question and silently changed the answer to the second: the block
// slides half its own width to the right, off the point it labels.
//
// label-align asks only the first question. Holding the block still while the
// lines re-justify means moving x the other way by the same amount, and the
// amount is half or all of the block's width -- a font metric, which is why
// this needs a measurement rather than arithmetic. The width comes from
// svg-label-metrics.mjs, which measures in the GUI and remembers.
//
// With no usable measurement the lines are still re-justified and the block
// still moves. A label that reads the way it was asked to read, in the wrong
// place, is closer to the request than one that ignores it -- and the block was
// moving before this property existed.
//
// See docs/development/label-tool-design.md.

// How far to the left of x the text sits, as a fraction of its own width
var anchorOffsets = {start: 0, middle: 0.5, end: 1};

var alignAnchors = {left: 'start', center: 'middle', right: 'end'};

export function parseLabelAlign(str) {
  var align = String(str).trim().toLowerCase();
  return align in alignAnchors ? align : null;
}

// The text-anchor an alignment is rendered as, or null if there isn't one --
// an unset property, or a value that reached the record from an expression or
// a data file rather than through the commands, which reject one.
export function getAlignmentAnchor(align) {
  var parsed = align ? parseLabelAlign(align) : null;
  return parsed ? alignAnchors[parsed] : null;
}

// How far x has to move to leave the block where it was, in px. Zero unless
// the record carries an alignment that disagrees with the anchor its position
// implies and a measurement to work from.
//
// @positionAnchor is supplied by the caller rather than read from the record,
// partly to keep this module out of a cycle with the position table in
// svg-properties.mjs, and partly because the comparison is against the anchor
// the *position* implies: an explicit text-anchor is the thing label-align
// replaces, so treating it as where the block belongs would hold the label in
// a place it was never drawn.
export function getAlignmentShift(rec, positionAnchor) {
  var anchor = getAlignmentAnchor(rec && rec['label-align']);
  var width;
  if (!anchor || anchor == positionAnchor) return 0;
  width = getMeasuredTextWidth(rec);
  if (!width) return 0;
  return (anchorOffsets[anchor] - anchorOffsets[positionAnchor]) * width;
}

// Re-exported so that a reader of the shift can ask the same question about
// the width it depends on.
export { getMeasuredTextWidth };
