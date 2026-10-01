import { isSvgNumber } from './svg-properties';

// Soft glows along the edges of polygons: an outer glow outside the shape and
// an inner glow inside it, each with a color, an opacity and a width.
//
//   outer-glow-color    a glow is drawn when its color is set, and not
//   inner-glow-color    otherwise (or if the color is "none")
//   outer-glow-width    how far the glow reaches from the edge, in px;
//   inner-glow-width    default 10, and 0 draws no glow
//   outer-glow-opacity  0-1, default 1
//   inner-glow-opacity
//
// A glow is a Gaussian blur of the shape's coverage, with a standard deviation
// of half the width: it has faded to about 2% of its opacity at that distance.
// The canvas renders the same blur as a shadow, whose shadowBlur is defined as
// twice the standard deviation -- so shadowBlur is the width itself.
//
// A glow is computed from everything the shape paints, its fill and its
// stroke, faded by its opacity -- which is what an SVG filter on a group sees.
//
// Inner glows belong to each shape. An outer glow belongs to the layer as a
// whole when every shape in the layer has the same one: it then follows the
// outline of all of them together, like a drop shadow, instead of spilling
// over each neighbor's edge. See getLayerOuterGlow().
//
// Illustrator drops a filter that is applied to a <path> with more than one
// ring (it imports one as a compound path), and keeps one that is applied to a
// group. A glowing shape is therefore always wrapped in a <g> that carries the
// filter.

export var glowFields = [
  'outer-glow-color', 'outer-glow-opacity', 'outer-glow-width',
  'inner-glow-color', 'inner-glow-opacity', 'inner-glow-width'
];

export var DEFAULT_GLOW_WIDTH = 10;

// How far a glow is drawn past the edge, as a multiple of its width: three
// standard deviations, where the blur is gone for all practical purposes.
export var GLOW_REACH = 1.5;

// Filter regions are given as a percentage of the bounding box of what they
// filter, and a small shape needs a larger percentage than a big one to leave
// room for the same glow. Rounding up to one of these keeps the number of
// distinct filters small; Illustrator lists every one of them in its menu.
var regionMargins = [10, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000];

// {color, opacity, width} for one of a record's glows, or null if it has none.
// @type: 'outer' or 'inner'
export function getPolygonGlow(rec, type) {
  var prefix = type + '-glow-';
  var width, color, opacity;
  if (!rec) return null;
  color = rec[prefix + 'color'];
  if (isBlank(color) || String(color).trim().toLowerCase() == 'none') return null;
  width = rec[prefix + 'width'];
  if (isBlank(width)) width = DEFAULT_GLOW_WIDTH;
  if (!isSvgNumber(width) || !(Number(width) > 0)) return null;
  opacity = rec[prefix + 'opacity'];
  opacity = isSvgNumber(opacity) ? Math.min(Math.max(Number(opacity), 0), 1) : 1;
  if (opacity === 0) return null;
  return {color: String(color).trim(), opacity: opacity, width: Number(width)};
}

function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === '';
}

export function polygonHasGlow(rec) {
  return !!(getPolygonGlow(rec, 'outer') || getPolygonGlow(rec, 'inner'));
}

export function getGlowKey(glow) {
  return glow ? glow.color + ' ' + glow.opacity + ' ' + glow.width : '';
}

// The outer glow of a polygon layer as a whole, or null. A layer has one when
// every feature with a shape has the same outer glow; features without a shape
// are left out, since they draw nothing. Decided from the data rather than
// from what is drawn, so that it does not change with the view.
export function getLayerOuterGlow(lyr) {
  var records, shapes, glow, key, g, k;
  if (!lyr || lyr.geometry_type != 'polygon' || !lyr.data || !lyr.shapes) return null;
  records = lyr.data.getRecords();
  shapes = lyr.shapes;
  glow = null;
  for (var i=0, n=shapes.length; i<n; i++) {
    if (!shapes[i] || shapes[i].length === 0) continue;
    g = getPolygonGlow(records[i], 'outer');
    if (!g) return null;
    k = getGlowKey(g);
    if (!glow) {
      glow = g;
      key = k;
    } else if (k != key) {
      return null;
    }
  }
  return glow;
}

// The widest glow of any feature in a layer, in px, or 0.
export function getMaxGlowWidth(records) {
  var max = 0, g;
  for (var i=0, n=records ? records.length : 0; i<n; i++) {
    g = getPolygonGlow(records[i], 'outer');
    if (g && g.width > max) max = g.width;
    g = getPolygonGlow(records[i], 'inner');
    if (g && g.width > max) max = g.width;
  }
  return max;
}

// What a <g> needs for a glow filter: the glows and the size of what it
// wraps, so that the filter region can be made large enough.
// @bbox: [xmin, ymin, xmax, ymax] of the wrapped content, in px
// @strokeWidth: the widest stroke in it, which reaches past the bbox
export function getGlowFilterSpec(outer, inner, bbox, strokeWidth) {
  var width = Math.max(outer ? outer.width : 0, inner ? inner.width : 0);
  var reach = width * GLOW_REACH + (strokeWidth > 0 ? strokeWidth / 2 : 0) + 1;
  return {
    outer: outer || null,
    inner: inner || null,
    marginX: getRegionMargin(reach, bbox[2] - bbox[0]),
    marginY: getRegionMargin(reach, bbox[3] - bbox[1])
  };
}

function getRegionMargin(reach, size) {
  var pct = size > 0 ? reach / size * 100 : Infinity;
  for (var i=0; i<regionMargins.length; i++) {
    if (regionMargins[i] >= pct) return regionMargins[i];
  }
  return regionMargins[regionMargins.length - 1];
}

export function getGlowFilterKey(spec) {
  return getGlowKey(spec.outer) + '|' + getGlowKey(spec.inner) + '|' +
    spec.marginX + ' ' + spec.marginY;
}

// The <filter> element for @spec. The outer glow is the blurred coverage of
// the source outside the source; the inner glow is the blurred coverage of
// everything outside the source, inside the source. The inversion is made
// by cutting the source out of a flood rather than with feComponentTransfer,
// which Safari fades toward the corners of the source's bounding box.
export function renderGlowFilter(id, spec) {
  var mx = spec.marginX, my = spec.marginY;
  var parts = [];
  var merge = [];
  if (spec.outer) {
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${getGlowDeviation(spec.outer)}" result="outer-blur"/>`,
      `<feFlood flood-color="${escapeAttr(spec.outer.color)}" flood-opacity="${spec.outer.opacity}"/>`,
      '<feComposite in2="outer-blur" operator="in"/>',
      '<feComposite in2="SourceAlpha" operator="out" result="outer"/>');
    merge.push('outer');
  }
  merge.push('SourceGraphic');
  if (spec.inner) {
    parts.push(
      '<feFlood flood-color="#000000" flood-opacity="1"/>',
      '<feComposite in2="SourceAlpha" operator="out"/>',
      `<feGaussianBlur stdDeviation="${getGlowDeviation(spec.inner)}" result="inner-blur"/>`,
      `<feFlood flood-color="${escapeAttr(spec.inner.color)}" flood-opacity="${spec.inner.opacity}"/>`,
      '<feComposite in2="inner-blur" operator="in"/>',
      '<feComposite in2="SourceAlpha" operator="in" result="inner"/>');
    merge.push('inner');
  }
  return `<filter id="${id}" x="${-mx}%" y="${-my}%" width="${100 + 2 * mx}%" height="${100 + 2 * my}%" color-interpolation-filters="sRGB">\n` +
    parts.join('\n') + '\n<feMerge>' +
    merge.map(function(name) { return `<feMergeNode in="${name}"/>`; }).join('') +
    '</feMerge>\n</filter>\n';
}

export function getGlowDeviation(glow) {
  return Math.round(glow.width / 2 * 1000) / 1000;
}

function escapeAttr(str) {
  return String(str).replace(/[&<>"]/g, '');
}

// Wraps each glowing shape in a <g> that will carry its filter, and marks the
// layer's own <g> if the layer has an outer glow of its own. The filters
// themselves are added to <defs> later, by convertGlowFilter().
// @children: the SVG objects for @features, one each, in order
export function applyPolygonGlows(layerObj, children, features, lyr) {
  var layerGlow = getLayerOuterGlow(lyr);
  var layerBBox = null;
  var maxStroke = 0;
  children.forEach(function(child, i) {
    var feature = features[i];
    var geom = feature && (feature.type == 'Feature' ? feature.geometry : feature);
    var rec = feature && feature.properties || {};
    var bbox, outer, inner, strokeWidth, wrapper;
    if (!child || !child.properties || !geom || !geom.coordinates) return;
    bbox = getCoordinatesBBox(geom.coordinates);
    if (!bbox) return;
    strokeWidth = getStrokeWidth(rec);
    if (strokeWidth > maxStroke) maxStroke = strokeWidth;
    layerBBox = layerBBox ? mergeBBoxes(layerBBox, bbox) : bbox;
    outer = layerGlow ? null : getPolygonGlow(rec, 'outer');
    inner = getPolygonGlow(rec, 'inner');
    if (!outer && !inner) return;
    wrapper = {tag: 'g', properties: {}, children: [child],
      glowFilter: getGlowFilterSpec(outer, inner, bbox, strokeWidth)};
    // The group is the feature now, so its id goes with it (and the data
    // attributes of svg-data=, which are added to the layer's children).
    if ('id' in child.properties) {
      wrapper.properties.id = child.properties.id;
      delete child.properties.id;
    }
    children[i] = wrapper;
  });
  if (layerGlow && layerBBox) {
    layerObj.glowFilter = getGlowFilterSpec(layerGlow, null, layerBBox, maxStroke);
  }
}

// Replaces the glow filter an object was marked with by a reference to a
// <filter> in @defs, which shapes with the same glows share.
export function convertGlowFilter(obj, defs) {
  var spec = obj.glowFilter;
  var key = getGlowFilterKey(spec);
  var item = defs.find(function(o) { return o.glowFilterKey === key; });
  var count;
  if (!item) {
    count = defs.filter(function(o) { return !!o.glowFilterKey; }).length;
    item = {glowFilterKey: key, id: 'glow-' + (count + 1)};
    item.svg = renderGlowFilter(item.id, spec);
    defs.push(item);
  }
  delete obj.glowFilter;
  if (!obj.properties) obj.properties = {};
  obj.properties.filter = 'url(#' + item.id + ')';
}

function getStrokeWidth(rec) {
  var w = rec['stroke-width'];
  if (!rec.stroke || rec.stroke == 'none') return 0;
  return isSvgNumber(w) ? Number(w) : 1;
}

function getCoordinatesBBox(coords) {
  var bbox = [Infinity, Infinity, -Infinity, -Infinity];
  extendBBox(bbox, coords);
  return bbox[0] <= bbox[2] ? bbox : null;
}

function extendBBox(bbox, coords) {
  var x, y;
  if (!coords || coords.length === 0) return;
  if (typeof coords[0] == 'number') {
    x = coords[0];
    y = coords[1];
    if (x < bbox[0]) bbox[0] = x;
    if (y < bbox[1]) bbox[1] = y;
    if (x > bbox[2]) bbox[2] = x;
    if (y > bbox[3]) bbox[3] = y;
    return;
  }
  for (var i=0; i<coords.length; i++) {
    extendBBox(bbox, coords[i]);
  }
}

function mergeBBoxes(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
