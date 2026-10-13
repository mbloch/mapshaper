import { isSvgNumber } from './svg-properties';
import { lineHasArrows, getLineArrowOpts, getLineArrowShape } from './svg-line-arrows';
import { importMultiLineString } from './svg-geom-primitives';
import {
  parseLineTaper, getTaperedOutline, getTaperedLinePathData, makeTaperOutlineOpts
} from './svg-line-taper';

// A casing is a wider stroke drawn beneath a line, so that the line has an
// outline of another color, as roads are drawn on many maps.
//
//   casing-color    a casing is drawn when its color is set, and not
//                   otherwise (or if the color is "none")
//   casing-width    how far the casing reaches past each edge of the line, in
//                   px; default 1, and 0 draws no casing
//   casing-opacity  0-1, default 1
//
// The casing's stroke is the line's width plus the casing's width on either
// side, so it keeps its look when the line's width changes. It has the line's
// caps and joins, and is solid under a dashed line. A line's own opacity fades
// its casing too; its stroke-opacity does not, so that a translucent line
// shows its casing through it.
//
// The casings belong to the layer as a whole: all of them are drawn before any
// of the lines, so that where lines meet, the lines join over the casings
// instead of each casing cutting across the lines beneath it. The features can
// still have casings of different colors and widths.
//
// A line with arrowheads has its casing along the line itself, which stops
// at the heads (see getLineArrowShape()); the heads have no casing. A line
// with a fade has a casing that does not fade. A tapered line's casing is a
// fill the casing's width wider than the line on either side, along its
// length (see svg-line-taper.mjs), and solid under a dashed line.

export var casingFields = ['casing-color', 'casing-width', 'casing-opacity'];

export var DEFAULT_CASING_WIDTH = 1;

var DEFAULT_LINE_WIDTH = 1;

// {color, width, opacity} for a record's casing, or null if it has none.
// The opacity includes the line's own opacity.
export function getLineCasing(rec) {
  var color, width, opacity;
  if (!rec) return null;
  color = rec['casing-color'];
  if (isBlank(color) || String(color).trim().toLowerCase() == 'none') return null;
  width = rec['casing-width'];
  if (isBlank(width)) width = DEFAULT_CASING_WIDTH;
  if (!isSvgNumber(width) || !(Number(width) > 0)) return null;
  opacity = parseOpacity(rec['casing-opacity']) * parseOpacity(rec.opacity);
  if (opacity === 0) return null;
  return {color: String(color).trim(), width: Number(width), opacity: opacity};
}

// The width of a casing's stroke, for a line @lineWidth px wide
export function getCasingStrokeWidth(lineWidth, casing) {
  var w = isSvgNumber(lineWidth) && Number(lineWidth) >= 0 ?
    Number(lineWidth) : DEFAULT_LINE_WIDTH;
  return w + casing.width * 2;
}

// The cap a line is drawn with, if it is not the document's default (round):
// a dashed line has butt caps unless it has a cap of its own, as in
// applyStyleAttributes()
export function getLineCasingCap(rec) {
  if (!isBlank(rec['stroke-linecap'])) return rec['stroke-linecap'];
  return isBlank(rec['stroke-dasharray']) ? null : 'butt';
}

export function layerHasCasing(lyr) {
  if (!lyr || lyr.geometry_type != 'polyline' || !lyr.data) return false;
  if (!lyr.data.fieldExists('casing-color')) return false;
  return lyr.data.getRecords().some(function(rec) {
    return !!getLineCasing(rec);
  });
}

// The casings of a line layer's features, as a <g> to go before the
// features in the layer's own group, or null if none has a casing. Casings
// are copies of the lines' paths, which carry no id or data attributes, so
// that they are not mistaken for features.
// @features: GeoJSON features, in SVG coordinates
// @layerId: the id of the layer's group
export function renderLineCasings(features, layerId) {
  var children = [];
  features.forEach(function(feature) {
    var geom = feature && (feature.type == 'Feature' ? feature.geometry : feature);
    var rec = feature && feature.properties || {};
    var casing = getLineCasing(rec);
    var parts, obj;
    if (!casing || !geom || !geom.coordinates) return;
    if (geom.type == 'LineString') {
      parts = [geom.coordinates];
    } else if (geom.type == 'MultiLineString') {
      parts = geom.coordinates;
    } else {
      return;
    }
    if (parseLineTaper(rec['line-taper']) > 0) {
      obj = renderTaperedCasing(parts, rec, casing);
      if (obj) children.push(obj);
      return;
    }
    parts = getCasingParts(parts, rec);
    if (parts.length === 0) return;
    obj = importMultiLineString(parts);
    Object.assign(obj.properties, getCasingAttributes(rec, casing));
    children.push(obj);
  });
  if (children.length === 0) return null;
  return {tag: 'g', properties: {id: getCasingGroupId(layerId)}, children: children};
}

export function getCasingGroupId(layerId) {
  return layerId + '-casing';
}

function getCasingParts(parts, rec) {
  var opts;
  if (lineHasArrows(rec)) {
    opts = getLineArrowOpts(rec, 1);
    parts = parts.map(function(part) {
      return getLineArrowShape(part, opts).coords.map(roundPoint);
    });
  }
  return parts.filter(function(part) {
    return part && part.length > 1;
  });
}

function renderTaperedCasing(parts, rec, casing) {
  var opts = getLineArrowOpts(rec, 1);
  // solid, with the caps an untapered casing has
  var outline = makeTaperOutlineOpts(getLineCasingCap(rec), null, opts, 1);
  var extra = casing.width * 2;
  var d = parts.map(function(part) {
    var shape = getLineArrowShape(part, opts);
    return getTaperedLinePathData(getTaperedOutline(shape.coords,
      shape.widths[0] + extra, shape.widths[1] + extra, outline));
  }).filter(Boolean).join(' ');
  var props;
  if (!d) return null;
  props = {d: d, fill: casing.color, 'fill-rule': 'nonzero', stroke: 'none'};
  if (casing.opacity < 1) props['fill-opacity'] = casing.opacity;
  return {tag: 'path', properties: props};
}

function getCasingAttributes(rec, casing) {
  var props = {
    stroke: casing.color,
    'stroke-width': Math.round(getCasingStrokeWidth(rec['stroke-width'], casing) * 1000) / 1000
  };
  var cap = getLineCasingCap(rec);
  if (casing.opacity < 1) props['stroke-opacity'] = casing.opacity;
  if (cap) props['stroke-linecap'] = cap;
  ['stroke-linejoin', 'stroke-miterlimit'].forEach(function(name) {
    if (!isBlank(rec[name])) props[name] = rec[name];
  });
  return props;
}

function parseOpacity(val) {
  if (!isSvgNumber(val)) return 1;
  return Math.min(Math.max(Number(val), 0), 1);
}

function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === '';
}

function roundPoint(p) {
  return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
}
