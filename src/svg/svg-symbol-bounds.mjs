import utils from '../utils/mapshaper-utils';
import { featureHasSvgSymbol, featureHasLabel } from './svg-feature-utils';
import { featureHasIcon, getIconRadius, RING_STROKE_WIDTH } from './svg-symbols';
import { getLabelTextBox, getLabelFontSize, labelHasCallout } from './svg-label-callout';
import { parsePointPair, isSvgNumber } from './svg-properties';
import { forEachSymbolCoord, getStrokeOutset } from '../symbols/mapshaper-symbol-utils';
import { getPolygonGlow } from './svg-glow';

// mapshaper-svg.mjs sets this on the document when any join is mitered
var SVG_EXPORT_MITER_LIMIT = 2;

// The space that a point's symbol and label, or a path's stroke, take up when
// drawn, for fitting a map frame around them.
//
// Boxes are [xmin, ymin, xmax, ymax] in px, relative to the point, with y down:
// the space symbols are drawn in (see renderPoint() in svg-symbols.mjs, which
// this follows). A box can leave out parts of what gets drawn -- anti-aliasing,
// miter joins, a curve bowing past its control points -- but not by more than a
// pixel or so.

// The box around what renderPoint() draws for @rec, or null if it draws nothing
// that can be sized.
// @cache: optional Map, for reusing the boxes of svg-symbol strings, which are
//   often the same for every feature in a layer
export function getPointSymbolBox(rec, cache) {
  var box = null;
  if (!rec) return null;
  if (featureHasSvgSymbol(rec)) {
    box = getSymbolBox(rec, cache);
  }
  if (featureHasLabel(rec)) {
    box = mergeBoxes(box, getLabelBox(rec));
  }
  return box;
}

// How far the text of a label drawn along a path can reach from the path, in
// px. The side the text sits on turns with the path, so it is allowed for on
// every side.
export function getPathLabelPadding(rec) {
  return getLabelFontSize(rec) + getHaloWidth(rec);
}

// How far what is drawn along a path can reach past its vertices, in px, on
// every side: half the stroke, as far as a miter join or a square cap
// takes it, plus a polygon's outer glow, at the width where it has faded to
// next to nothing. Follows the SVG export: a line is stroked 1px black unless
// its stroke is "none", a polygon only when it has a stroke, and joins are
// round unless stroke-linejoin says otherwise.
// @type: 'polyline' or 'polygon'
export function getPathStrokeOutset(rec, type) {
  var stroke = rec ? rec.stroke : null;
  var width = rec ? rec['stroke-width'] : null;
  var stroked = type == 'polyline' ? stroke != 'none' :
    !!stroke && stroke != 'none';
  var outset = 0, k = 1, glow;
  if (stroked) {
    width = isSvgNumber(width) ? Math.max(Number(width), 0) : 1;
    if (rec && rec['stroke-linejoin'] == 'miter') {
      k = isSvgNumber(rec['stroke-miterlimit']) ?
        Math.max(Number(rec['stroke-miterlimit']), 1) : SVG_EXPORT_MITER_LIMIT;
    }
    if (type == 'polyline' && rec && rec['stroke-linecap'] == 'square') {
      k = Math.max(k, Math.SQRT2);
    }
    outset = width / 2 * k;
  }
  glow = type == 'polygon' ? getPolygonGlow(rec, 'outer') : null;
  return glow ? outset + glow.width : outset;
}

function getLabelBox(rec) {
  var o = getLabelTextBox(rec, {estimate_width: true});
  var pad = getHaloWidth(rec);
  var box = [o.xmin - pad, o.ymin - pad, o.xmax + pad, o.ymax + pad];
  var via = labelHasCallout(rec) ? parsePointPair(rec['callout-via'] || '') : null;
  if (via) {
    box = mergeBoxes(box, [via[0], via[1], via[0], via[1]]);
  }
  return box;
}

function getHaloWidth(rec) {
  var w = +rec['halo-width'];
  return w > 0 ? w : 0;
}

function getSymbolBox(d, cache) {
  var sym = d['svg-symbol'];
  if (sym) return getComplexSymbolBox(sym, cache);
  if (featureHasIcon(d)) return getIconBox(d);
  if (d.r > 0) return getSquareBox(+d.r + getStrokeOutset(d), 0, 0);
  return null;
}

function getIconBox(d) {
  var type = d.icon || 'circle';
  var r = getIconRadius(d, type);
  var sw;
  if (!(r > 0)) return null;
  if (type == 'ring') {
    // drawn as a stroke, RING_STROKE_WIDTH wide unless stroke-width says otherwise
    sw = +d['stroke-width'];
    return getSquareBox(r + (sw > 0 ? sw : RING_STROKE_WIDTH) / 2, 0, 0);
  }
  if (type == 'circle' || type == 'square' || type == 'star') {
    return getSquareBox(r + getStrokeOutset(d), 0, 0);
  }
  if (type == 'nyt-star') {
    // the outline is part of the symbol's size (see nytStar())
    return getSquareBox(r, 0, 0);
  }
  return null; // unsupported icons are not drawn
}

function getComplexSymbolBox(sym, cache) {
  var box;
  if (!utils.isString(sym)) return getSymbolPartBox(sym, 0, 0);
  if (cache && cache.has(sym)) return cache.get(sym);
  try {
    box = getSymbolPartBox(JSON.parse(sym), 0, 0);
  } catch(e) {
    box = null;
  }
  if (cache) cache.set(sym, box);
  return box;
}

// Follows the renderers in svg-symbols.mjs: @x, @y is where the part is drawn,
// which circles, squares, images, lines and labels are placed at and polygons
// and polylines ignore.
function getSymbolPartBox(sym, x, y) {
  var type = sym && sym.type;
  var w, h;
  if (!sym || sym.tag) return null; // raw SVG can't be sized
  if (type == 'circle' || type == 'square') {
    return getSquareBox(getPositive(sym.r) + getStrokeOutset(sym), x, y);
  }
  if (type == 'image') {
    w = sym.width || 20;
    h = sym.height || 20;
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  }
  if (type == 'polygon') {
    return padBox(getCoordsBox(sym.coordinates), getStrokeOutset(sym));
  }
  if (type == 'polyline') {
    return padBox(getCoordsBox(sym.coordinates), getLineOutset(sym));
  }
  if (type == 'line') {
    return padBox(getCoordsBox([[x, y], [x + (sym.dx || 0), y + (sym.dy || 0)]]),
      getLineOutset(sym));
  }
  if (type == 'label') {
    return shiftBox(getLabelBox(sym), x, y);
  }
  if (type == 'group') {
    return getGroupBox(sym, x, y);
  }
  return null; // offset draws nothing, and unknown types are not drawn
}

// A line part moves the parts after it to its far end; an offset part moves
// them into a group translated by its offset.
function getGroupBox(sym, x, y) {
  var box = null;
  var ox = 0, oy = 0;
  (sym.parts || []).forEach(function(part) {
    box = mergeBoxes(box, shiftBox(getSymbolPartBox(part, x, y), ox, oy));
    if (!part) return;
    if (part.type == 'line') {
      x += part.dx || 0;
      y += part.dy || 0;
    } else if (part.type == 'offset') {
      ox += x + (part.dx || 0);
      oy += y + (part.dy || 0);
      x = y = 0;
    }
  });
  return box;
}

// A stroked line is one px wide unless stroke-width says otherwise
function getLineOutset(sym) {
  var sw = +sym['stroke-width'];
  return (sw > 0 ? sw : 1) / 2;
}

function getCoordsBox(coords) {
  var box = null;
  forEachSymbolCoord(coords || [], function(p) {
    if (!isFinite(p[0]) || !isFinite(p[1])) return;
    box = mergeBoxes(box, [p[0], p[1], p[0], p[1]]);
  });
  return box;
}

function getSquareBox(r, x, y) {
  return r > 0 ? [x - r, y - r, x + r, y + r] : null;
}

function padBox(box, pad) {
  return box ? [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad] : null;
}

function shiftBox(box, dx, dy) {
  if (!box || !dx && !dy) return box;
  return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy];
}

function mergeBoxes(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function getPositive(val) {
  var num = +val;
  return num > 0 ? num : 0;
}
