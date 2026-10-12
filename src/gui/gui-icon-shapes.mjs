// The icon shapes the label panel and the symbol panel offer, and how each is
// recognized in and written to a record. One list, so that a label's icon and
// a hand-placed symbol are chosen from the same shapes, drawn the same way on
// their buttons, and stored in the same fields.
//
// contexts: the panels that offer the shape. Data-driven icons (arrow, pie,
// concentric rings) and curves are left out of both: they need a direction,
// values or several points, which neither panel has controls for.
//
// A shape's size is its icon-size, in both panels, as -style and -labels
// write it. Pure, so that it can be tested without a map.
//
// paint: which of the icon's fill and stroke carries its color by default --
// 'fill', 'stroke' (a ring) or 'nyt' (the NYT star: a stroke of fixed width
// around a white middle). Both panels offer a Fill and a Stroke for every
// shape; this is only where a shape starts.

export var ICON_SHAPES = [{
  name: 'circle',
  title: 'Circle',
  paint: 'fill',
  icon: 'circle',
  contexts: ['label', 'symbol'],
  glyph: '<circle cx="8" cy="8" r="4.25"></circle>'
}, {
  name: 'square',
  title: 'Square',
  paint: 'fill',
  icon: 'square',
  contexts: ['label', 'symbol'],
  glyph: '<rect x="4" y="4" width="8" height="8"></rect>'
}, {
  name: 'triangle',
  title: 'Triangle',
  paint: 'fill',
  icon: 'polygon',
  sides: 3,
  contexts: ['label', 'symbol'],
  glyph: '<path d="M8 3.5l4.6 8H3.4z"></path>'
}, {
  name: 'star',
  title: 'Star',
  paint: 'fill',
  icon: 'star',
  contexts: ['label', 'symbol'],
  glyph: '<path d="M8 3.2l1.18 2.92 3.14.22-2.42 2 .76 3.06L8 9.75 5.34 11.4l.76-3.06-2.42-2 3.14-.22L8 3.2z"></path>'
}, {
  name: 'ring',
  title: 'Ring',
  paint: 'stroke',
  icon: 'ring',
  contexts: ['label', 'symbol'],
  glyph: '<circle cx="8" cy="8" r="3.8"></circle>'
}, {
  name: 'nyt-star',
  title: 'NYT star',
  paint: 'nyt',
  icon: 'nyt-star',
  contexts: ['label', 'symbol'],
  nytOnly: true,
  glyph: '<polygon transform="scale(0.4)" points="19.98 5.72 23.15 11.76 29.45 9.15 27.99 15.82 34.5 17.86 29.1 22.03 32.76 27.78 25.95 27.5 25.06 34.27 20.01 29.67 14.98 34.28 14.08 27.52 7.26 27.82 10.92 22.06 5.5 17.9 12 15.84 10.53 9.18 16.84 11.77"></polygon>'
}];

// The fields that select a shape, apart from icon itself
var SHAPE_FIELDS = ['icon-sides'];

// The shapes a panel offers.
//   context: 'label' or 'symbol'
//   opts.nyt: include the shapes only some users are offered
export function getIconShapes(context, opts) {
  var nyt = !!(opts && opts.nyt);
  return ICON_SHAPES.filter(function(o) {
    return o.contexts.indexOf(context) > -1 && (!o.nytOnly || nyt);
  });
}

export function findIconShape(name) {
  return ICON_SHAPES.filter(function(o) { return o.name == name; })[0] || null;
}

// The shape a record's icon is, or null for an icon no panel offers -- a
// hexagon, an arrow, concentric rings -- or for no icon. A record with r= and
// no icon is a circle, drawn the fast way.
export function getIconShapeName(rec) {
  var icon = rec && rec.icon;
  var shape;
  if (!icon) return rec && isNumber(rec.r) && rec.r > 0 ? 'circle' : null;
  if (icon == 'polygon') {
    return Number(rec['icon-sides']) == 3 ? 'triangle' : null;
  }
  if (icon == 'ring' && hasValue(rec['icon-radii'])) return null;
  shape = findIconShape(icon);
  return shape && !shape.sides ? shape.name : null;
}

// The [field, value] pairs that make @rec's icon a @name, other than its size
// and color: icon=, and the parameters of the shape (a triangle's
// icon-sides=3). A parameter of the old shape is cleared, but only if a
// record has it, so that changing shape does not add an empty field.
//   recs: a record or an array of them, or null for none
export function getIconShapeValues(name, recs) {
  var shape = findIconShape(name);
  var list = Array.isArray(recs) ? recs : recs ? [recs] : [];
  var out = [];
  if (!shape) return out;
  out.push(['icon', shape.icon]);
  SHAPE_FIELDS.forEach(function(field) {
    var val = field == 'icon-sides' ? shape.sides : undefined;
    if (val !== undefined) {
      out.push([field, val]);
    } else if (list.some(function(rec) { return rec && hasValue(rec[field]); })) {
      out.push([field, '']);
    }
  });
  return out;
}

// An icon's own paint -- see getIconPaint() in mapshaper-icon-symbols.mjs.
// icon-color is the field these replace, still drawn: a ring's stroke and
// other shapes' fill.
export var ICON_PAINT_FIELDS = ['icon-fill', 'icon-stroke', 'icon-stroke-width'];

// The fields an icon is drawn with, which go when it is removed
export var ICON_FIELDS = ['icon', 'icon-size', 'icon-color', 'icon-opacity']
  .concat(ICON_PAINT_FIELDS, SHAPE_FIELDS);

export var NYT_STAR_COLOR = '#cc0000';
var NYT_STAR_FILL = '#ffffff';
var NYT_STAR_STROKE_RATIO = 5 / 40;
var RING_STROKE_WIDTH = 1.5;

export function getIconShapePaint(name) {
  var shape = findIconShape(name);
  return shape ? shape.paint : 'fill';
}

// The width a stroke is given when it is added to a shape without one
export function getDefaultStrokeWidth(name) {
  return getIconShapePaint(name) == 'stroke' ? RING_STROKE_WIDTH : 1;
}

// The fill, stroke and stroke width that the icon in @rec, a @shape, is drawn
// with, as a panel shows them: a color, or '' for none, and a width, 0 with no
// stroke. Mirrors getIconPaint() in mapshaper-icon-symbols.mjs, which the GUI
// can't import without copying it into its bundle; a unit test keeps the two
// in step. A record with r= and no icon is a circle styled by fill=, stroke=
// and stroke-width=, which is what the fallbacks read.
//   defaultColor: what the renderer falls back to with no color at all -- for
//     a label, its text color
export function getShownIconPaint(rec, shape, defaultColor) {
  var kind = getIconShapePaint(shape);
  var color = rec['icon-color'] || rec.fill || defaultColor || '#000000';
  var fill, stroke, width;
  if (kind == 'fill') {
    fill = color;
    stroke = rec.stroke;
    width = rec['stroke-width'];
  } else {
    fill = kind == 'nyt' ? NYT_STAR_FILL : '';
    stroke = color;
    width = kind == 'stroke' ? rec['stroke-width'] : null;
  }
  if (hasValue(rec['icon-fill'])) fill = rec['icon-fill'];
  if (hasValue(rec['icon-stroke'])) stroke = rec['icon-stroke'];
  if (hasValue(rec['icon-stroke-width'])) width = rec['icon-stroke-width'];
  fill = hasValue(fill) && fill != 'none' ? fill : '';
  stroke = hasValue(stroke) && stroke != 'none' ? stroke : '';
  if (kind == 'nyt') {
    width = getRecordSize(rec) * NYT_STAR_STROKE_RATIO;
  } else if (!isNumber(width) || width < 0) {
    width = getDefaultStrokeWidth(shape);
  }
  return {fill: fill, stroke: stroke, strokeWidth: stroke ? Number(width) : 0};
}

// The paint fields to write when icons that are @prevShape become @shape, from
// the stored values they share: @vals has icon-fill, icon-stroke,
// icon-stroke-width and icon-color, each '' if unset or null if the icons
// disagree. Between shapes that paint alike (a circle and a square) nothing
// changes. Otherwise the color moves to where the new shape carries it -- a
// circle's fill becomes a ring's stroke -- and the rest goes back to the new
// shape's defaults. The NYT star brings its red, and takes it away again,
// unless the color was chosen by hand.
//   defaultColor: the color a panel gives a symbol it hasn't been told one for
//     ('' for a label's, which takes the text color)
// Returns {field: value}, with '' to clear a field. A field is only cleared
// if some icon has it, so that changing shape adds no empty fields.
export function getIconPaintChange(shape, prevShape, vals, defaultColor) {
  var from = getIconShapePaint(prevShape);
  var to = getIconShapePaint(shape);
  var out = {};
  var main;
  if (from == to) return out;
  main = from == 'fill' ? firstSet(vals['icon-fill'], vals['icon-color']) :
    firstSet(vals['icon-stroke'], vals['icon-color']);
  if (main == 'none') main = '';
  if (main !== null && from == 'nyt' && sameColor(main, NYT_STAR_COLOR)) {
    main = defaultColor || '';
  } else if (main !== null && to == 'nyt' && (!main || sameColor(main, defaultColor))) {
    main = NYT_STAR_COLOR;
  }
  set('icon-fill', to == 'fill' ? main : '');
  set('icon-stroke', to == 'fill' ? '' : main);
  set('icon-stroke-width', '');
  set('icon-color', '');
  return out;

  function set(field, val) {
    if (val === null) return;
    if (val !== '' || vals[field] !== '') out[field] = val;
  }
}

// getIconPaintChange() for a paint as a panel shows it ({fill, stroke,
// strokeWidth}, '' for none), giving the paint the new shape is shown with.
export function getShapeChangePaint(shape, prevShape, paint, defaultColor) {
  var vals = {
    'icon-fill': paint.fill || 'none',
    'icon-stroke': paint.stroke || 'none',
    'icon-stroke-width': paint.stroke ? paint.strokeWidth : '',
    'icon-color': ''
  };
  var change = getIconPaintChange(shape, prevShape, vals, defaultColor);
  return getShownIconPaint(Object.assign(vals, change), shape, defaultColor);
}

export function getIconShapeGlyph(name) {
  var shape = findIconShape(name);
  return '<svg class="label-icon-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
    (shape ? shape.glyph : '') + '</svg>';
}

function firstSet(a, b) {
  if (a === null) return null;
  return a !== '' && a !== undefined ? a : b === undefined ? '' : b;
}

function sameColor(a, b) {
  return !!a && !!b && String(a).toLowerCase() == String(b).toLowerCase();
}

function getRecordSize(rec) {
  return Number(rec['icon-size']) > 0 ? Number(rec['icon-size']) :
    Number(rec.r) > 0 ? rec.r * 2 : 10;
}

function hasValue(val) {
  return val !== undefined && val !== null && val !== '';
}

function isNumber(val) {
  return hasValue(val) && isFinite(Number(val));
}
