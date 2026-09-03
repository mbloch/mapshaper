import { getAffineTransform } from '../commands/mapshaper-affine';
import utils from '../utils/mapshaper-utils';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import { parseNumberList, splitListItems } from '../cli/mapshaper-option-parsing-utils';

var roundCoord = getRoundingFunction(0.01);

export function getSymbolFillColor(d) {
  return d.fill || 'magenta';
}

export function getSymbolStrokeColor(d) {
  return d.stroke || d.fill || 'magenta';
}

export function applySymbolStyles(sym, d) {
  if (sym.type == 'polyline') {
    sym.stroke = getSymbolStrokeColor(d);
  } else {
    sym.fill = getSymbolFillColor(d);
  }
  if (d.opacity) {
    sym.opacity = d.opacity;
  }
  return sym;
}

export function getSymbolRadius(d) {
  if (d.radius === 0 || d.length === 0 || d.r === 0) return 0;
  return d.radius || d.length || d.r || 5; // use a default value
}

// Converts the value of a list-valued option into an array of items. The value
// arrives either as a whole string (from a direct call, rather than from the
// -symbols option accessor) or as an array of items already resolved one by
// one. An item that holds an array of its own, as an expression like
// [R, R * 0.5] does, is flattened into the list. Items themselves are left
// unsplit, because a single item can contain a comma, as rgba() colors do.
export function toItemList(val) {
  var items = utils.isString(val) ? splitListItems(val) : [].concat(val);
  var list = [];
  for (var i=0; i<items.length; i++) {
    if (Array.isArray(items[i])) {
      list = list.concat(items[i]);
    } else {
      list.push(items[i]);
    }
  }
  return list;
}

// Like toItemList(), for options that take numbers. An item that is a string
// containing commas is split, so that a data field holding a value like "2,4"
// works as a list. Values that aren't numbers become NaN, for the caller to
// report or ignore.
export function toNumberList(val) {
  var list = [];
  toItemList(val).forEach(function(item) {
    if (utils.isString(item) && item.indexOf(',') > -1) {
      list = list.concat(parseNumberList(item));
    } else {
      list.push(Number(item));
    }
  });
  return list;
}

// Returns the radius of the smallest circle centered on a symbol's point that
// covers the symbol, or null if the symbol contains a part whose reach can't be
// measured.
//
// Only a symbol drawn around its point can be described this way: a circle, or
// a group of the circles and polygons that make up ring, pie and donut symbols.
// An arrow is drawn from its point outward, so the circle around its point that
// covers it says nothing useful about the space it occupies -- arrows are plain
// polygon symbols, which reach this function only as group parts, which they
// never are.
export function getSymbolBoundingRadius(sym) {
  var max = 0;
  var parts, r, i;
  if (!sym) return null;
  if (sym.type == 'circle') {
    // Half of a stroke lies outside the circle it follows, which is how a ring
    // symbol paints its bands.
    return getPositiveNumber(sym.r) + getStrokeOutset(sym);
  }
  if (sym.type == 'polygon') {
    forEachSymbolCoord(sym.coordinates || [], function(p) {
      var dist = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
      if (dist > max) max = dist;
    });
    return max + getStrokeOutset(sym);
  }
  if (sym.type == 'group') {
    parts = sym.parts || [];
    for (i=0; i<parts.length; i++) {
      r = getSymbolBoundingRadius(parts[i]);
      if (r === null) return null;
      if (r > max) max = r;
    }
    return max;
  }
  return null;
}

// A stroke straddles the path it is drawn on, so half of its width extends
// beyond the shape.
function getStrokeOutset(sym) {
  var width = sym['stroke-width'];
  if (!sym.stroke || sym.stroke == 'none') return 0;
  // an SVG stroke is one pixel wide unless stroke-width says otherwise
  if (width === undefined || width === null || width === '') return 0.5;
  return getPositiveNumber(width) / 2;
}

function getPositiveNumber(val) {
  var num = +val;
  return num > 0 ? num : 0;
}

export function forEachSymbolCoord(coords, cb) {
  var isPoint = coords && utils.isNumber(coords[0]);
  var isNested = !isPoint && coords && Array.isArray(coords[0]);
  if (isPoint) return cb(coords);
  for (var i=0; i<coords.length; i++) {
    if (isNested) forEachSymbolCoord(coords[i], cb);
  }
}

export function flipY(coords) {
  forEachSymbolCoord(coords, function(p) {
    p[1] = -p[1];
  });
}

export function scaleAndShiftCoords(coords, scale, shift) {
  forEachSymbolCoord(coords, function(xy) {
    xy[0] = xy[0] * scale + shift[0];
    xy[1] = xy[1] * scale + shift[1];
  });
}

export function roundCoordsForSVG(coords) {
  forEachSymbolCoord(coords, function(p) {
    p[0] = roundCoord(p[0]);
    p[1] = roundCoord(p[1]);
  });
}

export function rotateCoords(coords, rotation) {
  if (!rotation) return;
  var f = getAffineTransform(rotation, 1, [0, 0], [0, 0]);
  forEachSymbolCoord(coords, function(p) {
    var p2 = f(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
}

export function findArcCenter(p1, p2, degrees) {
  var p3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], // midpoint betw. p1, p2
      tan = 1 / Math.tan(degrees / 180 * Math.PI / 2),
      cp = getAffineTransform(90, tan, [0, 0], p3)(p2[0], p2[1]);
  return cp;
}

// export function addBezierArcControlPoints(p1, p2, degrees) {
export function addBezierArcControlPoints(points, degrees) {
  // source: https://stackoverflow.com/questions/734076/how-to-best-approximate-a-geometrical-arc-with-a-bezier-curve
  var p2 = points.pop(),
      p1 = points.pop(),
      cp = findArcCenter(p1, p2, degrees),
      xc = cp[0],
      yc = cp[1],
      ax = p1[0] - xc,
      ay = p1[1] - yc,
      bx = p2[0] - xc,
      by = p2[1] - yc,
      q1 = ax * ax + ay * ay,
      q2 = q1 + ax * bx + ay * by,
      k2 = 4/3 * (Math.sqrt(2 * q1 * q2) - q2) / (ax * by - ay * bx);

  points.push(p1);
  points.push([xc + ax - k2 * ay, yc + ay + k2 * ax, 'C']);
  points.push([xc + bx + k2 * by, yc + by - k2 * bx, 'C']);
  points.push(p2);
}
