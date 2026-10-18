import { getArrowCoords } from './mapshaper-arrow-symbols';
import { getPolygonCoords } from './mapshaper-basic-symbols';
import { getStarCoords } from './mapshaper-star-symbols';
import { getPieWedges } from './mapshaper-pie-symbols';
import { makeRingSymbol } from './mapshaper-ring-symbols';
import { rotateCoords, flipY, roundCoordsForSVG } from './mapshaper-symbol-utils';
import { roundToTenths } from '../geom/mapshaper-rounding';

// Point symbols are described by attribute fields: icon= names the shape, and
// the icon-* fields (shared with the icons drawn at label anchors) and arrow-*
// fields give its parameters. Nothing derived is stored -- a symbol is drawn
// from its fields every time, so a panel can show and change any of them.
//
// Circles, unrotated squares, single rings and five-pointed stars are drawn by
// renderIcon() in svg-symbols.mjs. The shapes below are generated as objects
// in the format of the legacy svg-symbol field, so that the renderer, the
// frame-fitting bounds and -repel can handle them with the code that already
// handles that format.
//
// Coordinates are px, y down, centered on the point. Rotation is in degrees
// clockwise.

// A ring icon's stroke, unless the record sets one; 1px read as too faint.
export var RING_STROKE_WIDTH = 1.5;

// The NYT star's outline, as a fraction of its icon-size (5 units of the
// artwork's 40-unit box -- see nytStar() in svg-symbols.mjs), and its middle
export var NYT_STAR_STROKE_RATIO = 5 / 40;
export var NYT_STAR_FILL = '#ffffff';

// Fields that hold a point's symbol. -symbols clears them all before writing
// the ones a symbol needs, so that a symbol never inherits a parameter from
// the one it replaces.
export var symbolFields = ['svg-symbol', 'r', 'icon', 'icon-size', 'icon-color',
  'icon-fill', 'icon-stroke', 'icon-stroke-width',
  'icon-opacity', 'icon-rotation', 'icon-sides', 'icon-points', 'icon-radii',
  'icon-values', 'icon-fills', 'icon-hole', 'arrow-style', 'arrow-stem-width',
  'arrow-head-width', 'arrow-head-length', 'arrow-head-angle', 'arrow-stem-taper',
  'arrow-stem-curve', 'arrow-stem-length', 'arrow-min-stem-ratio', 'arrow-anchor'];

// arrow-* field -> parameter name used by getArrowCoords()
var arrowParams = {
  'arrow-stem-width': 'stem-width',
  'arrow-head-width': 'head-width',
  'arrow-head-length': 'head-length',
  'arrow-head-angle': 'head-angle',
  'arrow-stem-taper': 'stem-taper',
  'arrow-stem-curve': 'stem-curve',
  'arrow-stem-length': 'stem-length',
  'arrow-min-stem-ratio': 'min-stem-ratio'
};

// Style properties of the record that a generated shape is drawn with
var shapeStyleFields = ['stroke', 'stroke-width', 'stroke-dasharray',
  'stroke-opacity', 'fill-opacity'];

// NYT targets: a dot inside one or two rings, drawn in the icon's stroke color
// over its fill (none unless icon-fill gives one). Radii are fractions of the
// outer radius, measured from the NYT artwork.
var NYT_TARGETS = {
  'nyt-target': {dot: 0.46, rings: [[0.8, 1]]},
  'nyt-target2': {dot: 0.3, rings: [[0.51, 0.67], [0.91, 1]]}
};

// Which paint carries an icon's color by default: a ring is a stroke with no
// fill, and the rest are filled. The NYT icons are drawn in their stroke
// color, at line widths fixed by their size: the star around a white middle,
// the targets over no fill.
// 'fill', 'stroke' or 'nyt'
export function getIconPaintKind(type) {
  if (type == 'ring') return 'stroke';
  if (type == 'nyt-star' || type in NYT_TARGETS) return 'nyt';
  return 'fill';
}

// The fill, stroke and stroke width an icon is drawn with, from icon-fill,
// icon-stroke and icon-stroke-width. Each one that is unset falls back to the
// way icons were drawn before those fields: icon-color (then the record's
// fill, which on a label is its text color) is a filled shape's fill and the
// stroke of a ring or the NYT star, and a filled shape takes the record's own
// stroke. The NYT star's outline is always the same width for its size.
// Returns {fill, stroke, strokeWidth}: colors or 'none', and a width that is
// 0 when there is no stroke.
export function getIconPaint(d, type) {
  var kind = getIconPaintKind(type);
  var color = d['icon-color'] || d.fill || 'black';
  var fill, stroke, width;
  if (kind == 'fill') {
    fill = color;
    stroke = d.stroke;
    width = d['stroke-width'];
  } else {
    fill = type == 'nyt-star' ? NYT_STAR_FILL : 'none';
    stroke = color;
    width = kind == 'stroke' ? d['stroke-width'] : null;
  }
  if (hasValue(d['icon-fill'])) fill = d['icon-fill'];
  if (hasValue(d['icon-stroke'])) stroke = d['icon-stroke'];
  if (hasValue(d['icon-stroke-width'])) width = d['icon-stroke-width'];
  if (!hasValue(stroke)) stroke = 'none';
  if (kind == 'nyt') {
    width = getIconSize(d) * NYT_STAR_STROKE_RATIO;
  } else if (!hasValue(width) || !isFinite(width) || width < 0) {
    width = kind == 'stroke' ? RING_STROKE_WIDTH : 1;
  }
  return {
    fill: hasValue(fill) ? fill : 'none',
    stroke: stroke,
    strokeWidth: stroke == 'none' ? 0 : Number(width)
  };
}

// The radius an icon is drawn at. Circles, rings and stars are adjusted so
// that the three read as the same size at the same icon-size.
export function getIconRadius(d, type) {
  var size;
  if (d['icon-size'] > 0 === false) {
    return d.r > 0 ? d.r : 5;
  }
  size = d['icon-size'];
  if (type == 'circle') {
    size -= 1;
  } else if (type == 'ring') {
    // the stroke's outer half is inside icon-size
    size -= getIconPaint(d, 'ring').strokeWidth;
  } else if (type == 'star') {
    size += 1;
  }
  return size / 2;
}

// The icon's shape in the legacy svg-symbol format, or null for an icon that
// renderIcon() draws itself (or that is not supported).
export function getIconSymbol(d) {
  var type = d && d.icon;
  var rotation = getNumber(d && d['icon-rotation']);
  // a curve is drawn through a feature's points (see svg-curve-symbols.mjs),
  // so at a single point there is nothing to draw
  if (type == 'curve') return emptySymbol();
  if (type == 'polygon') return getPolygonIcon(d, rotation);
  if (type == 'arrow') return getArrowIcon(d, rotation);
  if (type == 'pie') return getPieIcon(d, rotation);
  if (type == 'ring' && hasValue(d['icon-radii'])) return getRingsIcon(d);
  if (type in NYT_TARGETS) return getNytTargetIcon(d);
  if (type == 'star' && (getNumber(d['icon-points']) > 0 || rotation)) {
    return getStarIcon(d, rotation);
  }
  if (type == 'square' && rotation) return getSquareIcon(d, rotation);
  return null;
}

// The arrow parameters that getArrowCoords() takes, from a record's fields
export function getArrowParams(d) {
  var len = getNumber(d['icon-size']);
  var o = {
    length: len > 0 ? len : 0,
    direction: getNumber(d['icon-rotation'])
  };
  Object.keys(arrowParams).forEach(function(field) {
    var val = d[field];
    if (hasValue(val) && isFinite(val)) o[arrowParams[field]] = Number(val);
  });
  if (hasValue(d['arrow-anchor'])) o.anchor = d['arrow-anchor'];
  return o;
}

// Points of the star drawn for icon=star, which has a fatter center than the
// stars made by getStarCoords(). Already y down.
export function getIconStarCoords(r) {
  var coords = [];
  var innerR = r * 0.42;
  var angle, len;
  for (var i=0; i<10; i++) {
    len = i % 2 === 0 ? r : innerR;
    angle = -Math.PI / 2 + i * Math.PI / 5;
    coords.push([roundToTenths(Math.cos(angle) * len), roundToTenths(Math.sin(angle) * len)]);
  }
  coords.push(coords[0].concat());
  return coords;
}

function getPolygonIcon(d, rotation) {
  var sides = Math.round(getNumber(d['icon-sides'])) || 4;
  var coords;
  if (sides < 3) return emptySymbol();
  coords = getPolygonCoords({radius: getIconSize(d) / 2, sides: sides});
  return getFilledShape(d, toScreenCoords(coords, rotation));
}

function getStarIcon(d, rotation) {
  var points = Math.round(getNumber(d['icon-points']));
  var coords;
  if (points > 0) {
    if (points < 5) return emptySymbol();
    coords = toScreenCoords(getStarCoords({radius: getIconSize(d) / 2, points: points}), rotation);
  } else {
    coords = [getIconStarCoords(getIconRadius(d, 'star'))];
    rotateScreenCoords(coords, rotation);
    roundCoordsForSVG(coords);
  }
  return getFilledShape(d, coords);
}

function getSquareIcon(d, rotation) {
  var h = getIconRadius(d, 'square');
  var coords = [[[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]]];
  rotateScreenCoords(coords, rotation);
  roundCoordsForSVG(coords);
  return getFilledShape(d, coords);
}

function getArrowIcon(d, rotation) {
  var stick = d['arrow-style'] == 'stick';
  var coords, sym;
  try {
    coords = getArrowCoords(getArrowParams(d), stick ? 'stick' : 'standard');
  } catch(e) {
    // an impossible arrow (e.g. a head narrower than its stem) is reported by
    // -symbols; drawing must not fail on one that -style made
    coords = null;
  }
  if (!coords) return emptySymbol();
  coords = toScreenCoords(coords, 0); // the direction is already applied
  if (!stick) return getFilledShape(d, coords);
  sym = {
    type: 'polyline',
    coordinates: coords,
    stroke: d['icon-color'] || d.stroke || 'black',
    'stroke-width': getNumber(d['stroke-width']) > 0 ? Number(d['stroke-width']) : 2
  };
  return addOpacity(sym, d);
}

function getPieIcon(d, rotation) {
  var wedges;
  if (!hasValue(d['icon-values']) || !hasValue(d['icon-fills'])) return emptySymbol();
  wedges = getPieWedges({
    values: d['icon-values'],
    fills: d['icon-fills'],
    radius: getIconSize(d) / 2,
    hole: d['icon-hole'],
    rotation: rotation
  }, 1);
  return {
    type: 'group',
    parts: wedges.map(function(wedge) {
      var part = {type: 'polygon', coordinates: toScreenCoords(wedge.coordinates, 0)};
      addShapeStyle(part, d);
      part.fill = wedge.fill;
      // opacity goes on the parts: renderComplexSymbol() assumes a group has a
      // properties object, which group() only gives a single-part group
      return addOpacity(part, d);
    })
  };
}

// Concentric bands, from a list of radii. The record's stroke is not applied:
// each band is drawn as a stroke of its own.
function getRingsIcon(d) {
  return makeRingSymbol({radii: d['icon-radii'], fill: getIconFill(d)},
    {opacity: getIconOpacity(d)});
}

// The fill is a disc under the whole icon. Opacity goes on the group, so that
// the parts don't show through each other.
function getNytTargetIcon(d) {
  var spec = NYT_TARGETS[d.icon];
  var r = getIconSize(d) / 2;
  var paint = getIconPaint(d, d.icon);
  var parts = [];
  var sym;
  if (paint.fill != 'none') {
    parts.push({type: 'circle', fill: paint.fill, r: roundToHundredths(r)});
  }
  if (paint.stroke != 'none') {
    spec.rings.forEach(function(ring) {
      parts.push({
        type: 'circle',
        fill: 'none',
        stroke: paint.stroke,
        'stroke-width': roundToHundredths((ring[1] - ring[0]) * r),
        r: roundToHundredths((ring[0] + ring[1]) / 2 * r)
      });
    });
    parts.push({type: 'circle', fill: paint.stroke, r: roundToHundredths(spec.dot * r)});
  }
  sym = {type: 'group', parts: parts};
  if (parts.length > 0) addOpacity(sym, d);
  return sym;
}

function roundToHundredths(n) {
  return Math.round(n * 100) / 100;
}

function getFilledShape(d, coords) {
  var sym = {type: 'polygon', coordinates: coords};
  var paint = getIconPaint(d, d.icon);
  addShapeStyle(sym, d);
  sym.fill = paint.fill;
  delete sym.stroke;
  delete sym['stroke-width'];
  if (paint.stroke != 'none') {
    sym.stroke = paint.stroke;
    sym['stroke-width'] = paint.strokeWidth;
  }
  return addOpacity(sym, d);
}

function addShapeStyle(sym, d) {
  shapeStyleFields.forEach(function(field) {
    if (hasValue(d[field])) sym[field] = d[field];
  });
  return sym;
}

function addOpacity(sym, d) {
  var opacity = getIconOpacity(d);
  if (opacity !== undefined) sym.opacity = opacity;
  return sym;
}

// icon-opacity is the icon's own, apart from a label drawn with it
function getIconOpacity(d) {
  if (hasValue(d['icon-opacity']) && isFinite(d['icon-opacity'])) return Number(d['icon-opacity']);
  return hasValue(d.opacity) ? d.opacity : undefined;
}

function getIconFill(d) {
  return d['icon-color'] || d.fill || 'black';
}

// The icon's full size: a diameter, or an arrow's length. Falls back like
// getIconRadius().
function getIconSize(d) {
  return d['icon-size'] > 0 ? Number(d['icon-size']) : d.r > 0 ? d.r * 2 : 10;
}

// From the y-up space the symbol generators work in to y-down px
function toScreenCoords(coords, rotation) {
  rotateCoords(coords, rotation);
  flipY(coords);
  roundCoordsForSVG(coords);
  return coords;
}

// Clockwise, in y-down coordinates
function rotateScreenCoords(coords, rotation) {
  if (!rotation) return;
  flipY(coords);
  rotateCoords(coords, rotation);
  flipY(coords);
}

function emptySymbol() {
  return {type: 'group', parts: []};
}

function getNumber(val) {
  var num = Number(val);
  return hasValue(val) && isFinite(num) ? num : 0;
}

function hasValue(val) {
  return val !== undefined && val !== null && val !== '';
}
