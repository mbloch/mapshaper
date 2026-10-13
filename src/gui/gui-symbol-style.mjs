// The symbol panel's model of a symbol's style, and how it maps to the fields
// -symbols writes. Pure functions, so that they can be tested without a map.
//
// The shapes are the label panel's (gui-icon-shapes.mjs), and a symbol's size
// is its icon-size, as it is a label icon's -- except for a circle, which is
// drawn by r= so that a layer of circles takes the fast canvas path, and
// whose size is 2r.
//
// See docs/development/symbol-tool-design.md.
import {
  getIconShapeName, getIconShapePaint, getShownIconPaint, getShapeChangePaint
} from './gui-icon-shapes';

// Which ends of a curve have a head. The heads themselves are the ones the
// layer panel gives lines (see gui-arrowhead-shapes.mjs): one shape for both
// ends, as there.
export var ARROWHEAD_POSITIONS = [
  {name: 'none', label: 'None', title: 'no arrowheads'},
  {name: 'start', label: 'Start', title: 'an arrowhead at the start of the curve'},
  {name: 'end', label: 'End', title: 'an arrowhead at the end of the curve'},
  {name: 'both', label: 'Both', title: 'arrowheads at both ends of the curve'}
];

// The color a symbol is placed in until the panel is given another
export var DEFAULT_SYMBOL_COLOR = '#333333';

// A symbol's paint is {fill, stroke, strokeWidth}: colors, '' for none, and a
// width that only counts with a stroke (see getShownIconPaint()).
export function getDefaultIconStyle() {
  return {shape: 'circle', size: 10, fill: DEFAULT_SYMBOL_COLOR, stroke: '',
    strokeWidth: 0, rotation: 0};
}

export function getDefaultCurveStyle() {
  // arrowSize: '' for the size the stroke width gives a head; fade: 0-1
  return {stroke: DEFAULT_SYMBOL_COLOR, strokeWidth: 1.5, arrowheads: 'end',
    arrowShape: 'arrow', arrowSize: '', fade: 0, fill: ''};
}

// Whether a shape takes a stroke width and a rotation. A circle or a ring
// looks the same however it is turned. The NYT star is a logo, drawn upright
// with an outline of its own weight.
export function shapeHasStrokeWidth(shape) {
  return shape != 'nyt-star';
}

export function shapeHasRotation(shape) {
  return shape != 'circle' && shape != 'ring' && shape != 'nyt-star';
}

// The paint a symbol of @shape shows after changing from @prevShape, from
// @paint (see getShapeChangePaint())
export function getShapeChangeStyle(shape, prevShape, paint) {
  return getShapeChangePaint(shape, prevShape, paint, DEFAULT_SYMBOL_COLOR);
}

// -symbols options for an icon placed with @style. -symbols radius= reaches
// a square's corners, so a square's is its side over root 2 -- to four
// places, which -symbols' own rounding of the side to hundredths brings back
// to the size asked for.
//
// A missing fill or stroke is whatever the shape has without one: -symbols
// fills a filled shape with a default color, so its "none" is said; a ring
// has no fill, and a ring or NYT star given no stroke= would be drawn in its
// fill, so their "none" is said too.
export function getAddIconOptions(style) {
  var o = {};
  var shape = style.shape || 'circle';
  var kind = getIconShapePaint(shape);
  var stroked = !!style.stroke && (kind == 'nyt' || style.strokeWidth > 0);
  if (shape == 'triangle') {
    o.type = 'polygon';
    o.sides = 3;
  } else {
    o.type = shape;
  }
  o.radius = shape == 'square' ? Math.round(style.size / Math.SQRT2 * 1e4) / 1e4 :
    round(style.size / 2);
  if (style.fill) {
    o.fill = style.fill;
  } else if (kind != 'stroke') {
    o.fill = 'none';
  }
  if (stroked) {
    o.stroke = style.stroke;
    if (kind != 'nyt') o['stroke-width'] = style.strokeWidth;
  } else if (kind != 'fill') {
    o.stroke = 'none';
  }
  if (style.rotation && shapeHasRotation(shape)) o.rotation = style.rotation;
  return o;
}

// -symbols options for a curve drawn with @style.
export function getAddCurveOptions(style, closed) {
  var o = {type: 'curve'};
  var heads = getArrowheadFields(closed ? 'none' : style.arrowheads, style.arrowShape);
  if (style.stroke) o.stroke = style.stroke;
  if (style.strokeWidth >= 0) o['stroke-width'] = style.strokeWidth;
  if (heads['line-start']) o['line-start'] = heads['line-start'];
  if (heads['line-end']) o['line-end'] = heads['line-end'];
  if ((heads['line-start'] || heads['line-end']) && style.arrowSize > 0) {
    o['line-end-size'] = style.arrowSize;
  }
  if (!closed && style.fade > 0) o['line-fade'] = style.fade;
  if (closed && style.fill) o.fill = style.fill;
  return o;
}

// The panel's shape for a symbol's record, or null for a symbol whose shape
// the panel does not offer (a pie, a hexagon, concentric rings).
export function getIconShape(rec) {
  return getIconShapeName(rec);
}

export function getIconSize(rec) {
  if (!getIconShape(rec)) return null;
  if (!rec.icon) return round(Number(rec.r) * 2);
  return isNumber(rec['icon-size']) ? round(Number(rec['icon-size'])) : null;
}

export function getIconPaint(rec) {
  return getShownIconPaint(rec || {}, getIconShape(rec), '#000000');
}

export function getIconRotation(rec) {
  return rec && isNumber(rec['icon-rotation']) ? Number(rec['icon-rotation']) : 0;
}

// The panel style ({shape, size, fill, stroke, strokeWidth, rotation}) of the
// symbol in @rec, or null for a symbol whose shape the panel does not offer
export function getIconStyle(rec) {
  var shape = getIconShape(rec);
  var paint;
  if (!shape) return null;
  paint = getIconPaint(rec);
  return {shape: shape, size: getIconSize(rec) || getDefaultIconStyle().size,
    fill: paint.fill, stroke: paint.stroke, strokeWidth: paint.strokeWidth,
    rotation: getIconRotation(rec)};
}

// -symbols options that make the symbol in @rec again with the panel style
// @style: the panel restyles a symbol with -symbols ids=, which replaces all
// of a symbol's fields.
//
// -symbols leaves a circle's stroke= on a point that becomes another shape,
// and the icon's stroke falls back to it, so no stroke is said, as "none".
// What the panel has no control for is carried over: an icon's opacity, and a
// star's number of points.
export function getRestyleIconOptions(rec, style) {
  var o = getAddIconOptions(style);
  if (!('stroke' in o)) o.stroke = 'none';
  if (style.shape == 'star' && isNumber(rec['icon-points'])) o.points = Number(rec['icon-points']);
  if (isNumber(rec['icon-opacity'])) o.opacity = Number(rec['icon-opacity']);
  return o;
}

export function getCurveStyle(rec) {
  return {
    stroke: rec.stroke || '',
    strokeWidth: isNumber(rec['stroke-width']) ? Number(rec['stroke-width']) : 1,
    arrowheads: getArrowheadPosition(rec),
    arrowShape: getArrowheadShape(rec),
    arrowSize: isNumber(rec['line-end-size']) && rec['line-end-size'] > 0 ?
      Number(rec['line-end-size']) : '',
    fade: isNumber(rec['line-fade']) && rec['line-fade'] > 0 ? Math.min(Number(rec['line-fade']), 1) : 0,
    fill: rec.fill || ''
  };
}

// 'none', 'start', 'end' or 'both'
export function getArrowheadPosition(rec) {
  var start = hasMarker(rec['line-start']);
  var end = hasMarker(rec['line-end']);
  if (start && end) return 'both';
  if (start) return 'start';
  if (end) return 'end';
  return 'none';
}

// The shape of a curve's heads -- the start's, if the ends differ -- or ''
// for none
export function getArrowheadShape(rec) {
  var start = rec['line-start'];
  var end = rec['line-end'];
  return hasMarker(start) ? start : hasMarker(end) ? end : '';
}

// line-start= and line-end= for an arrowhead position and shape (default
// 'arrow'), with '' for no marker
export function getArrowheadFields(position, shape) {
  var head = shape || 'arrow';
  return {
    'line-start': position == 'start' || position == 'both' ? head : '',
    'line-end': position == 'end' || position == 'both' ? head : ''
  };
}

function hasMarker(val) {
  return !!val && val != 'none';
}

function isNumber(val) {
  return val !== '' && val !== null && val !== undefined && isFinite(Number(val));
}

function round(n) {
  return Math.round(n * 100) / 100;
}
