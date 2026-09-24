import { getDrawnLabelOffset, splitLabelLines, toLabelString, toPixels,
  DEFAULT_LABEL_FONT_SIZE } from './svg-labels';
import { getMeasuredTextWidth } from './svg-label-metrics';
import { parseCalloutType, parseCalloutEnd, parsePointPair,
  isSvgNumber } from './svg-properties';
import { roundToTenths } from '../geom/mapshaper-rounding';

// A callout: a line from a label's anchor to its text, straight, elbowed or
// curved, optionally ending in an arrowhead at the anchor. A dot at the anchor
// is the label's icon, not a callout marker.
//
// Everything here is in the label's own space -- origin at the anchor, y down,
// in px -- which is the space dx/dy are in and the one the GUI scales with the
// frame. Nothing derived is stored: the shape is worked out from the anchor,
// the text box and the callout-* fields every time the label is drawn.
//
// See docs/development/text-annotation-design.md.

var DEFAULT_PADDING = 3;
var DEFAULT_LINE_WIDTH = 1;
var DEFAULT_LINE_HEIGHT = '1.1em';
// Space left between the anchor's symbol and the end of the line
var SYMBOL_CLEARANCE = 2;
// How far an automatic curve bows out, as a fraction of its chord
var CURVE_BEND = 0.2;
// The shortest first leg an automatic elbow into the top or bottom of the text
// is drawn with, px
var MIN_LEG = 8;
// The angle at an arrowhead's point, degrees. The open one is wider, since a
// narrow chevron drawn with a line reads as a thickened line more than as an
// arrow.
var ARROW_ANGLE = 44;
var OPEN_ARROW_ANGLE = 70;
// Where glyphs sit relative to their baseline, in ems, for estimating the
// height of a block of text that is measured only for its width
var ASCENT = 0.8;
var DESCENT = 0.2;
var MIDLINE = 0.35;

export function labelHasCallout(rec) {
  var type = rec && rec.callout ? parseCalloutType(rec.callout) : null;
  return !!type && type != 'none';
}

// The callout for @rec as an SVG object, or null if it has none or there is no
// room to draw one.
// @symbolRadius: radius of the symbol drawn at the anchor, or 0; the default
//   gap keeps the line clear of it
export function renderLabelCallout(rec, symbolRadius) {
  var shape = getLabelCalloutShape(rec, symbolRadius);
  return shape ? renderCalloutShape(shape, rec) : null;
}

// The shape renderLabelCallout() draws for @rec, from getCalloutShape(), or
// null. The GUI places its handles on this, so they sit where the line is.
export function getLabelCalloutShape(rec, symbolRadius) {
  if (!labelHasCallout(rec)) return null;
  return getCalloutShape({
    type: parseCalloutType(rec.callout),
    end: getCalloutEndType(rec),
    box: getLabelTextBox(rec),
    via: parsePointPair(rec['callout-via'] || ''),
    attach: parsePointPair(rec['callout-attach'] || ''),
    padding: getNumber(rec['callout-padding'], DEFAULT_PADDING),
    gap: getCalloutGap(rec, symbolRadius),
    width: getLineWidth(rec),
    endSize: getNumber(rec['callout-end-size'], 0)
  });
}

// An arrowhead's size when callout-end-size does not say, in px: 10 for the
// default line, and growing with the line, so that a heavier line does not end
// in a head too small to read.
export function getDefaultCalloutEndSize(end, lineWidth) {
  var w = lineWidth > 0 ? lineWidth : DEFAULT_LINE_WIDTH;
  return 7 + 3 * w;
}

// 'arrow', 'open-arrow' or 'none'
export function getCalloutEndType(rec) {
  return rec && parseCalloutEnd(rec['callout-end'] || '') || 'none';
}

// How far short of the anchor the line stops. Unset, an arrowhead stops clear
// of the symbol there, so that its point reads against the background; a
// plain line runs to the symbol's edge, so that the two read as one object.
// The line's round cap then reaches under the symbol, which is drawn over it.
export function getCalloutGap(rec, symbolRadius) {
  if (isSvgNumber(rec['callout-gap'])) return Math.max(0, Number(rec['callout-gap']));
  if (!(symbolRadius > 0)) return 0;
  return getCalloutEndType(rec) == 'none' ? symbolRadius : symbolRadius + SYMBOL_CLEARANCE;
}

// The block of text a label draws, in the label's space: {xmin, ymin, xmax,
// ymax, midline}, where midline is the middle of the first line's capitals.
//
// The width is measured, since it depends on the font, and the height is
// estimated from the font size and line height, since only the width is. With
// no measurement the box takes the label's width if it is a text block, and is
// otherwise a vertical line through the text's origin -- a callout then meets
// the text where it starts rather than not being drawn.
export function getLabelTextBox(rec) {
  var fontSize = getFontSizeInPx(rec);
  var offset = getDrawnLabelOffset(rec);
  var lines = splitLabelLines(toLabelString(rec['label-text']));
  var lineHeight = measureToPx(rec['line-height'] || DEFAULT_LINE_HEIGHT, fontSize);
  var width = getMeasuredTextWidth(rec) || getNumber(rec['label-width'], 0);
  // An anchor the record does not set is inherited from the layer's group,
  // which is 'middle' -- see getLabelTextDefaults().
  var anchor = offset['text-anchor'] || 'middle';
  var xmin = offset.dx - width * (anchor == 'middle' ? 0.5 : anchor == 'end' ? 1 : 0);
  var baseline = offset.dy + getBaselineShift(rec['dominant-baseline']) * fontSize;
  if (!(lineHeight > 0)) lineHeight = fontSize * 1.1;
  return {
    xmin: xmin,
    xmax: xmin + width,
    ymin: baseline - ASCENT * fontSize,
    ymax: baseline + (lines.length - 1) * lineHeight + DESCENT * fontSize,
    midline: baseline - MIDLINE * fontSize
  };
}

// Where a line meets a callout's text and how it gets there from the anchor.
//
// o.type     'line', 'elbow' or 'curve'
// o.end      'arrow' (filled), 'open-arrow' (stroked) or 'none'
// o.box      the text box, from getLabelTextBox()
// o.via      [x, y] the elbow's corner or a point the curve passes through, or null
// o.attach   [fx, fy] where the line meets the text, as fractions of the padded
//            box, or null
// o.padding  clearance around the text, px
// o.gap      how far short of the anchor the line stops, px
// o.width    line width, px
// o.endSize  an arrowhead's size, px, or 0 for the default, which grows with
//            the line width. The size is the length of the head's sides, as
//            drawn, stroke and all: the two styles are different shapes, and
//            what makes one look the size of the other is sides the same
//            length, not the same length along the line.
//
// Returns {kind, coords, head, openHead, box, attach, via, tip} with coords
// from the anchor end to the text end -- a polyline's vertices, or a quadratic
// Bezier's three points -- or null when there is nothing to draw: the anchor
// inside the padded box, or a gap that leaves no line. head is a filled
// triangle, openHead the three points of a stroked chevron, wing to tip to
// wing. The rest is what the shape was worked out from: the padded box, the
// point where the line meets it, the elbow's corner or the curve's midpoint
// (null for a straight line), and where the line stops short of the anchor.
export function getCalloutShape(o) {
  var box = padBox(o.box, o.padding || 0);
  var a = [0, 0];
  var size = o.endSize > 0 ? o.endSize : getDefaultCalloutEndSize(o.end, o.width);
  var t, v, path, tip, dir, out, lineWidth;
  if (boxContains(box, a)) return null;
  t = o.attach ? getBoxPoint(box, o.attach) :
    getAutoAttachment(o.type, box, o.via || null);
  // A leg too short to read as one, or to hold the marker, is a jog: the line
  // goes straight up or down to the text instead.
  if (o.type == 'elbow' && !o.attach && !o.via && isOnTopOrBottom(box, t) &&
      Math.abs(t[0]) < getMinimumLeg(o.end, size)) {
    t = [0, t[1]];
  }
  if (o.type == 'elbow') {
    v = o.via || getAutoElbow(a, t, box);
    // A corner on either end is no corner -- straight under the text, say --
    // and a leg of no length has no direction for an arrowhead to take.
    path = {kind: 'polyline', coords: distance(a, v) > 0 && distance(v, t) > 0 ?
      [a, v, t] : [a, t]};
  } else if (o.type == 'curve') {
    v = o.via || getAutoBend(a, t);
    path = {kind: 'bezier', coords: [a, getControlPoint(a, v, t), t]};
  } else {
    path = {kind: 'polyline', coords: [a, t]};
  }
  path = trimPath(path, o.gap || 0);
  if (!path) return null;
  tip = path.coords[0];
  out = {kind: path.kind, coords: path.coords, head: null, openHead: null,
    box: box, attach: t, via: v || null, tip: tip};
  if (o.end == 'arrow') {
    dir = getStartDirection(path);
    if (!dir) return null;
    out.head = getArrowHead(tip, dir, size, ARROW_ANGLE);
    // The line stops inside the head, so that its cap does not show past the
    // tip. A line too short to reach past the head is drawn as the head alone.
    path = trimPath(path, getArrowHeadLength(size, ARROW_ANGLE) * 0.7);
    out.coords = path ? path.coords : null;
  } else if (o.end == 'open-arrow') {
    // Stroked with the line's round join, which reaches half a line width past
    // the chevron's point: the point is set back by that much, so that the
    // arrow ends where a filled one would. The join and the round cap at the
    // far end each add half a line width to an arm, which is taken off it.
    lineWidth = o.width > 0 ? o.width : DEFAULT_LINE_WIDTH;
    path = trimPath(path, lineWidth / 2) || path;
    dir = getStartDirection(path);
    if (!dir) return null;
    out.coords = path.coords;
    out.openHead = getArrowHead(path.coords[0], dir,
      Math.max(size - lineWidth, size / 2), OPEN_ARROW_ANGLE);
    out.openHead = [out.openHead[1], out.openHead[0], out.openHead[2]];
  }
  return out;
}

function renderCalloutShape(shape, rec) {
  var color = rec['callout-color'] || rec.fill || 'black';
  var opacity = isSvgNumber(rec['callout-opacity']) ? Number(rec['callout-opacity']) :
    isSvgNumber(rec.opacity) ? Number(rec.opacity) : 1;
  var props = {class: 'label-callout'};
  var children = [];
  if (shape.coords) {
    children.push({
      tag: 'path',
      properties: {
        d: getPathData(shape),
        fill: 'none',
        stroke: color,
        'stroke-width': getLineWidth(rec),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }
    });
  }
  if (shape.head) {
    children.push({
      tag: 'path',
      properties: {d: getPolygonData(shape.head), fill: color}
    });
  }
  if (shape.openHead) {
    children.push({
      tag: 'path',
      properties: {
        d: 'M ' + shape.openHead.map(formatPoint).join(' L '),
        fill: 'none',
        stroke: color,
        'stroke-width': getLineWidth(rec),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }
    });
  }
  if (opacity < 1) props.opacity = opacity;
  return {tag: 'g', properties: props, children: children};
}

// Drawn from the text to the anchor, which is the direction a leader is read in
// and the one a dash pattern starts from. A quadratic's control point is the
// same in both directions.
function getPathData(shape) {
  var c = shape.coords;
  if (shape.kind == 'bezier') {
    return 'M ' + formatPoint(c[2]) + ' Q ' + formatPoint(c[1]) + ' ' + formatPoint(c[0]);
  }
  return 'M ' + c.slice().reverse().map(formatPoint).join(' L ');
}

function getPolygonData(coords) {
  return 'M ' + coords.map(formatPoint).join(' L ') + ' Z';
}

function formatPoint(p) {
  return roundToTenths(p[0]) + ' ' + roundToTenths(p[1]);
}

// Attachment

function getBoxPoint(box, f) {
  var fx = Math.max(0, Math.min(1, f[0]));
  var fy = Math.max(0, Math.min(1, f[1]));
  return [box.xmin + fx * (box.xmax - box.xmin), box.ymin + fy * (box.ymax - box.ymin)];
}

// An elbow meets the side of the text facing the way it comes from, level with
// the first line, which is the usual form of an elbowed leader. A straight or
// curved line is aimed at the middle of the block and stops at its edge.
//
// An elbow coming from directly above or below the text cannot reach a side
// without crossing the block, so it meets the facing edge instead: in the
// middle when it comes from the anchor, and straight above or below a via
// point, whose landing is then vertical.
function getAutoAttachment(type, box, via) {
  var cx = (box.xmin + box.xmax) / 2;
  var cy = (box.ymin + box.ymax) / 2;
  var from = via || [0, 0];
  if (type == 'elbow' && isAboveOrBelow(box, from)) {
    return [via ? from[0] : cx, from[1] > box.ymax ? box.ymax : box.ymin];
  }
  if (type == 'elbow') {
    return [from[0] < cx ? box.xmin : box.xmax,
      Math.max(box.ymin, Math.min(box.ymax, box.midline))];
  }
  return clipToBox(from, [cx, cy], box);
}

function getMinimumLeg(end, size) {
  return end == 'none' ? MIN_LEG : Math.max(MIN_LEG, size * 1.5);
}

function isAboveOrBelow(box, p) {
  return p[0] >= box.xmin && p[0] <= box.xmax && (p[1] > box.ymax || p[1] < box.ymin);
}

// Whether @t is on the top or bottom edge of @box, away from its corners
function isOnTopOrBottom(box, t) {
  return t[0] > box.xmin && t[0] < box.xmax && (t[1] == box.ymin || t[1] == box.ymax);
}

// Where the segment from @p (outside the box) to @c (inside it) enters the box.
function clipToBox(p, c, box) {
  var dx = c[0] - p[0];
  var dy = c[1] - p[1];
  var s;
  if (boxContains(box, p)) return c;
  s = Math.max(0, getEntry(p[0], dx, box.xmin, box.xmax),
    getEntry(p[1], dy, box.ymin, box.ymax));
  return [p[0] + s * dx, p[1] + s * dy];
}

function getEntry(p, d, min, max) {
  if (d === 0) return -Infinity;
  return Math.min((min - p) / d, (max - p) / d);
}

// Shapes

// The segment from the anchor rises at 45 degrees to meet a horizontal landing
// into the side of the text, or goes straight up or down when the text is too
// close horizontally for that.
//
// Into the top or bottom of the text, the landing is vertical and the line
// leaves the anchor horizontally, which keeps the corner clear of the block.
function getAutoElbow(a, t, box) {
  var dx = t[0] - a[0];
  var dy = Math.abs(t[1] - a[1]);
  if (isOnTopOrBottom(box, t)) return [t[0], a[1]];
  if (Math.abs(dx) <= dy) return [a[0], t[1]];
  return [a[0] + (dx > 0 ? dy : -dy), t[1]];
}

// The chord's midpoint, pushed to its left as seen from the anchor -- which
// bows a callout to text on its right upward.
function getAutoBend(a, t) {
  var dx = t[0] - a[0];
  var dy = t[1] - a[1];
  return [(a[0] + t[0]) / 2 + dy * CURVE_BEND, (a[1] + t[1]) / 2 - dx * CURVE_BEND];
}

// The control point of the quadratic from @a to @t that passes through @v at
// its midpoint. That is also the curve's farthest point from its chord, so a
// handle at @v sits where the bend visibly is.
export function getControlPoint(a, v, t) {
  return [2 * v[0] - (a[0] + t[0]) / 2, 2 * v[1] - (a[1] + t[1]) / 2];
}

// Trimming

// @path with its start moved to where it leaves a circle of radius @r around
// that start, or null if it never does. A circle rather than a length along the
// path, because what the gap has to clear is a symbol drawn at the anchor.
function trimPath(path, r) {
  if (!(r > 0)) return hasLength(path) ? path : null;
  if (path.kind == 'bezier') return trimBezier(path.coords, r);
  return trimPolyline(path.coords, r);
}

function hasLength(path) {
  var c = path.coords;
  for (var i = 1; i < c.length; i++) {
    if (distance(c[0], c[i]) > 0) return true;
  }
  return false;
}

function trimPolyline(coords, r) {
  var p0 = coords[0];
  for (var i = 1; i < coords.length; i++) {
    if (distance(p0, coords[i]) > r) {
      return {
        kind: 'polyline',
        coords: [getCircleExit(p0, r, coords[i - 1], coords[i])].concat(coords.slice(i))
      };
    }
  }
  return null;
}

// The point where segment @p-@q, which starts inside the circle and ends
// outside it, crosses it.
function getCircleExit(c, r, p, q) {
  var dx = q[0] - p[0];
  var dy = q[1] - p[1];
  var ex = p[0] - c[0];
  var ey = p[1] - c[1];
  var a = dx * dx + dy * dy;
  var b = 2 * (dx * ex + dy * ey);
  var k = ex * ex + ey * ey - r * r;
  var s = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * k))) / (2 * a);
  s = Math.max(0, Math.min(1, s));
  return [p[0] + s * dx, p[1] + s * dy];
}

function trimBezier(c, r) {
  var steps = 64;
  var lo = 0, hi = -1, mid, i;
  for (i = 1; i <= steps; i++) {
    if (distance(c[0], getBezierPoint(c, i / steps)) > r) {
      hi = i / steps;
      lo = (i - 1) / steps;
      break;
    }
  }
  if (hi < 0) return null;
  for (i = 0; i < 24; i++) {
    mid = (lo + hi) / 2;
    if (distance(c[0], getBezierPoint(c, mid)) > r) hi = mid;
    else lo = mid;
  }
  return {kind: 'bezier', coords: splitBezier(c, hi)};
}

function getBezierPoint(c, t) {
  var u = 1 - t;
  return [
    u * u * c[0][0] + 2 * u * t * c[1][0] + t * t * c[2][0],
    u * u * c[0][1] + 2 * u * t * c[1][1] + t * t * c[2][1]
  ];
}

// The part of the quadratic @c from @t to its end
function splitBezier(c, t) {
  return [getBezierPoint(c, t), lerp(c[1], c[2], t), c[2]];
}

// End markers

// Unit vector from the start of @path into it, or null for a path with no
// direction there.
function getStartDirection(path) {
  var c = path.coords;
  var next = c[1];
  if (path.kind == 'bezier' && distance(c[0], c[1]) === 0) next = c[2];
  return getUnitVector(c[0], next);
}

// [tip, wing, wing], for a head with sides @side long meeting at @angle degrees
function getArrowHead(tip, dir, side, angle) {
  var len = getArrowHeadLength(side, angle);
  var half = side * Math.sin(angle / 2 * Math.PI / 180);
  var bx = tip[0] + dir[0] * len;
  var by = tip[1] + dir[1] * len;
  return [tip, [bx - dir[1] * half, by + dir[0] * half], [bx + dir[1] * half, by - dir[0] * half]];
}

// How far along the line a head with sides @side long reaches
function getArrowHeadLength(side, angle) {
  return side * Math.cos(angle / 2 * Math.PI / 180);
}

// Utilities

function padBox(box, pad) {
  return {
    xmin: box.xmin - pad,
    xmax: box.xmax + pad,
    ymin: box.ymin - pad,
    ymax: box.ymax + pad,
    midline: box.midline
  };
}

function boxContains(box, p) {
  return p[0] > box.xmin && p[0] < box.xmax && p[1] > box.ymin && p[1] < box.ymax;
}

function getUnitVector(p, q) {
  var dx = q[0] - p[0];
  var dy = q[1] - p[1];
  var len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? [dx / len, dy / len] : null;
}

function distance(p, q) {
  var dx = q[0] - p[0];
  var dy = q[1] - p[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(p, q, t) {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

function getNumber(val, defaultVal) {
  return isSvgNumber(val) && Number(val) >= 0 ? Number(val) : defaultVal;
}

function getLineWidth(rec) {
  var w = getNumber(rec['callout-width'], DEFAULT_LINE_WIDTH);
  return w > 0 ? w : DEFAULT_LINE_WIDTH;
}

function getFontSizeInPx(rec) {
  var val = rec['font-size'];
  var px = val === undefined || val === null || val === '' ? null :
    measureToPx(val, DEFAULT_LABEL_FONT_SIZE);
  return px > 0 ? px : DEFAULT_LABEL_FONT_SIZE;
}

// px for a number, a px value or an em value, or null
function measureToPx(val, emBasis) {
  var px = toPixels(val, emBasis);
  var match;
  if (px !== null) return px;
  match = /^(-?[.0-9]+)px$/.exec(String(val).trim());
  return match ? Number(match[1]) : null;
}

// Where the first baseline sits below the text's y, in ems
function getBaselineShift(baseline) {
  var val = String(baseline || '').toLowerCase();
  if (val == 'central' || val == 'middle') return MIDLINE;
  if (val == 'hanging' || val == 'text-before-edge') return ASCENT;
  if (val == 'text-after-edge' || val == 'ideographic') return -DESCENT;
  return 0;
}
