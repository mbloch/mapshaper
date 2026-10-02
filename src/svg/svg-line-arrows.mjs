import {
  ARROW_ANGLE, OPEN_ARROW_ANGLE, ARROW_LINE_OVERLAP, getDefaultArrowSize,
  getArrowHead, getArrowHeadLength, trimPolyline, getUnitVector, distance
} from './svg-arrowheads';
import { parseLineEnd, isSvgNumber } from './svg-properties';
import { importLineString, importMultiLineString } from './svg-geom-primitives';
import { parseColor } from '../color/color-utils';

// Markers at the ends of line features: line-start= and line-end= take
// arrow (a filled triangle), open-arrow (a stroked chevron), dot (a filled
// circle centred on the end) or none, and line-end-size= is the length of a
// head's sides in px, for both ends, or a dot's diameter. A dot with no size
// of its own is DOT_SIZE_RATIO of an arrowhead's default size.
//
// The heads are drawn as shapes rather than as SVG <marker>s, so that the
// canvas in the GUI and the exported SVG draw the same thing, and so that a
// solid head can have the line stop inside it, where its cap is hidden. Every
// part of a multi-part line gets its own heads: part order is not something
// the commands that make multi-part lines preserve.
//
// line-fade= fades the line in from its tail: 0-1, the share of the line's
// length over which it goes from transparent to its full opacity. The tail is
// the start, unless only the start has a head. The fade is a straight linear
// gradient from the tail to the point that far along the line, which follows a
// straight or gently curved line closely; SVG and canvas have no gradient that
// follows a path, so a line that bends sharply within its fade will not fade
// evenly along its length.
//
// Coordinates are px, y down: the SVG export's space, or the canvas's.

var DEFAULT_LINE_WIDTH = 1;
// 6px across at the default size for a 1px line
var DOT_SIZE_RATIO = 0.6;

// 'arrow', 'open-arrow', 'dot' or 'none'
export function getLineEndType(rec, field) {
  return rec && rec[field] && parseLineEnd(rec[field]) || 'none';
}

export function lineHasArrows(rec) {
  return getLineEndType(rec, 'line-start') != 'none' ||
    getLineEndType(rec, 'line-end') != 'none';
}

// The share of the line that fades, 0 for none
export function parseLineFade(val) {
  return isSvgNumber(val) && Number(val) > 0 ? Math.min(Number(val), 1) : 0;
}

// Whether a line is drawn by renderArrowLine() rather than as a plain path
export function lineHasEndStyles(rec) {
  return lineHasArrows(rec) || parseLineFade(rec && rec['line-fade']) > 0;
}

// What getLineArrowShape() needs from a record, at scale @scale (the factor
// the canvas multiplies line widths by; 1 for SVG).
export function getLineArrowOpts(rec, scale) {
  return makeLineArrowOpts(rec['line-start'], rec['line-end'], rec['line-end-size'],
    rec['stroke-width'], scale, rec['line-fade']);
}

// The same, from the values themselves, for the canvas, which has them in a
// style object rather than a record.
export function makeLineArrowOpts(start, end, size, strokeWidth, scale, fade) {
  var k = scale > 0 ? scale : 1;
  var w = isSvgNumber(strokeWidth) && Number(strokeWidth) >= 0 ?
    Number(strokeWidth) : DEFAULT_LINE_WIDTH;
  var hasSize = isSvgNumber(size) && Number(size) > 0;
  var side = hasSize ? Number(size) : getDefaultArrowSize(w);
  return {
    start: start && parseLineEnd(start) || 'none',
    end: end && parseLineEnd(end) || 'none',
    size: side * k,
    dotSize: (hasSize ? side : side * DOT_SIZE_RATIO) * k,
    width: w * k,
    fade: parseLineFade(fade)
  };
}

// Field names, for a layer that may have them
export var lineArrowFields = ['line-start', 'line-end', 'line-end-size', 'line-fade'];

// One part of a line, with its heads: {coords, heads, fade}, where coords is
// the line to stroke -- cut back into a solid head, so that its cap does not
// show past the tip -- and heads is a list of {type, points}: a solid head's
// triangle, tip first, or an open head's chevron, wing to tip to wing. A dot
// is {type, center, radius}. fade is the axis of the line's fade (see
// getLineFadeAxis()), or null.
//
// A head points along the chord from its tip to where the line first reaches
// the head's length from it, rather than along the last segment, which on
// detailed or noisy data can be a jog of a fraction of a pixel pointing
// anywhere. The line is then straightened to meet the head along its axis. An
// end whose part is too short to hold its head gets none.
export function getLineArrowShape(coords, opts) {
  var out = {coords: coords, heads: [], fade: null};
  var end;
  if (opts.fade > 0) {
    out.fade = getLineFadeAxis(coords, opts.start != 'none' && opts.end == 'none', opts.fade);
  }
  if (opts.start != 'none') {
    addHead(out, opts.start, opts);
  }
  if (opts.end != 'none') {
    end = {coords: out.coords.slice().reverse(), heads: out.heads};
    addHead(end, opts.end, opts);
    out.coords = end.coords.reverse();
  }
  return out;
}

// {from, to}: the line's tail, where the fade is transparent, and the point
// @fraction of the line's length along it from there, where the fade ends.
// Measured on the whole line, before the heads trim it. Null for a line too
// short to fade, or a closed one faded all the way round, whose two points
// would be the same.
export function getLineFadeAxis(coords, fromEnd, fraction) {
  var path = fromEnd ? coords.slice().reverse() : coords;
  var total = 0, target, d, i, to, k;
  for (i=1; i<path.length; i++) {
    total += distance(path[i - 1], path[i]);
  }
  target = total * fraction;
  to = path[path.length - 1];
  for (i=1; i<path.length && target > 0; i++) {
    d = distance(path[i - 1], path[i]);
    if (d >= target) {
      k = target / d;
      to = [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k];
      break;
    }
    target -= d;
  }
  if (!(total > 0) || distance(path[0], to) < 0.5) return null;
  return {from: path[0], to: to};
}

// The fade's two colours: the stroke's, and the same with no opacity, so
// that the colour does not shift on its way to transparent. Null for a stroke
// colour that cannot be faded (e.g. 'none').
export function getLineFadeColors(color) {
  var rgb = parseColor(color || 'black');
  if (!rgb) return null;
  return {
    transparent: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0)',
    solid: color || 'black'
  };
}

// Puts a head of @type at the first point of @shape.coords
function addHead(shape, type, opts) {
  var coords = shape.coords;
  var width = opts.width > 0 ? opts.width : DEFAULT_LINE_WIDTH;
  var tip, side, angle, len, rest, dir, head;
  if (!coords || coords.length < 2) return;
  if (type == 'dot') {
    addDot(shape, (opts.dotSize || opts.size * DOT_SIZE_RATIO) / 2);
    return;
  }
  if (type == 'open-arrow') {
    // Stroked with a round join, which reaches half a line width past the
    // chevron's point: the point is set back by that much, so that the arrow
    // ends where a solid one would, and the arms lose half a line width each
    // to the join and the cap.
    coords = trimPolyline(coords, width / 2);
    if (!coords) return;
    side = Math.max(opts.size - width, opts.size / 2);
    angle = OPEN_ARROW_ANGLE;
  } else {
    side = opts.size;
    angle = ARROW_ANGLE;
  }
  tip = coords[0];
  len = getArrowHeadLength(side, angle);
  rest = trimPolyline(coords, len);
  dir = rest ? getUnitVector(tip, rest[0]) : null;
  if (!dir) return;
  head = getArrowHead(tip, dir, side, angle);
  if (type == 'open-arrow') {
    shape.heads.push({type: type, points: [head[1], head[0], head[2]]});
    shape.coords = [tip].concat(rest);
  } else {
    shape.heads.push({type: type, points: head});
    shape.coords = [[tip[0] + dir[0] * len * ARROW_LINE_OVERLAP,
      tip[1] + dir[1] * len * ARROW_LINE_OVERLAP]].concat(rest);
  }
}

// The line stops halfway to the dot's edge, which hides its cap in the dot
// (for lines narrower than the dot's radius) while overlapping it no more than
// a solid head does. A part too short to be cut back keeps its dot.
function addDot(shape, radius) {
  var center = shape.coords[0];
  var rest = trimPolyline(shape.coords, radius / 2);
  shape.heads.push({type: 'dot', center: center, radius: radius});
  if (rest) shape.coords = rest;
}

// A line feature with arrowheads or a fade, as SVG: a group holding the line
// and its heads, for the feature's style attributes to go on. @parts is a list
// of polylines (a LineString's coordinates are one). A faded part is a path of
// its own, since each part has its own gradient.
export function renderArrowLine(parts, rec) {
  var opts = getLineArrowOpts(rec, 1);
  var color = rec.stroke || 'black';
  var fadeColors = opts.fade > 0 ? getLineFadeColors(color) : null;
  var lines = [];
  var fadedLines = [];
  var heads = [];
  parts.forEach(function(part) {
    var shape = getLineArrowShape(part, opts);
    var coords = shape.coords.map(roundPoint);
    if (shape.fade && fadeColors) {
      fadedLines.push(renderFadedLine(coords, shape.fade, fadeColors));
    } else {
      lines.push(coords);
    }
    shape.heads.forEach(function(head) {
      heads.push(renderHead(head, color, rec));
    });
  });
  var children = lines.length > 0 ? [importMultiLineString(lines)] : [];
  return {tag: 'g', properties: {}, children: children.concat(fadedLines, heads)};
}

// The gradient is added to the SVG's <defs> by convertLineFade(), which also
// points the path's stroke at it.
function renderFadedLine(coords, axis, colors) {
  var obj = importLineString(coords);
  var from = roundPoint(axis.from);
  var to = roundPoint(axis.to);
  obj.lineFade = {x1: from[0], y1: from[1], x2: to[0], y2: to[1], color: colors.solid};
  return obj;
}

// Replaces the fade an object was marked with by a reference to a
// <linearGradient> in @defs, which lines with the same fade share. The
// gradient is in the path's own coordinates (userSpaceOnUse): the default, the
// path's bounding box, has no height for a horizontal line, and a gradient
// over an empty box paints nothing.
export function convertLineFade(obj, defs) {
  var f = obj.lineFade;
  var color = String(f.color).replace(/"/g, '');
  var body = 'gradientUnits="userSpaceOnUse" x1="' + f.x1 + '" y1="' + f.y1 +
    '" x2="' + f.x2 + '" y2="' + f.y2 + '"><stop offset="0" stop-color="' + color +
    '" stop-opacity="0"/><stop offset="1" stop-color="' + color + '"/></linearGradient>';
  var item = defs.find(function(o) { return o.lineFadeKey === body; });
  var count;
  if (!item) {
    count = defs.filter(function(o) { return !!o.lineFadeKey; }).length;
    item = {lineFadeKey: body, id: 'line-fade-' + (count + 1)};
    item.svg = '<linearGradient id="' + item.id + '" ' + body + '\n';
    defs.push(item);
  }
  delete obj.lineFade;
  obj.properties.stroke = 'url(#' + item.id + ')';
}

function renderHead(head, color, rec) {
  var points, center;
  if (head.type == 'dot') {
    center = roundPoint(head.center);
    return {tag: 'circle', properties: addFillOpacity({cx: center[0], cy: center[1],
      r: Math.round(head.radius * 100) / 100, fill: color, stroke: 'none'}, rec)};
  }
  points = head.points.map(roundPoint);
  var d = 'M ' + points.map(function(p) { return p[0] + ' ' + p[1]; }).join(' L ');
  var props;
  if (head.type == 'arrow') {
    props = addFillOpacity({d: d + ' Z', fill: color, stroke: 'none'}, rec);
  } else {
    // The line's own dashes would break the chevron up, and its cap may be
    // square or butt; the chevron is always drawn whole and rounded.
    props = {d: d, fill: 'none', 'stroke-dasharray': 'none',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'};
  }
  return {tag: 'path', properties: props};
}

// A filled marker is as transparent as the line it is drawn in
function addFillOpacity(props, rec) {
  if (isSvgNumber(rec['stroke-opacity'])) {
    props['fill-opacity'] = Number(rec['stroke-opacity']);
  }
  return props;
}

function roundPoint(p) {
  return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
}
