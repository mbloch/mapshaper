import { Bounds } from '../geom/mapshaper-bounds';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { featureHasLabel } from '../svg/svg-feature-utils';
import {
  getPointSymbolBox,
  getPathLabelPadding,
  getPathStrokeOutset,
  getLineEndBox
} from '../svg/svg-symbol-bounds';
import { getLineArrowOpts, getLineEndType, lineHasArrows } from '../svg/svg-line-arrows';
import { getCircleExit, getUnitVector } from '../svg/svg-arrowheads';
import { warn } from '../utils/mapshaper-logging';

// Fitting a map frame to its content, including the symbols and labels drawn
// at points and the strokes drawn along paths, which take up room that the
// coordinates alone do not.
//
// Symbols are sized in output pixels, and how many map units a pixel covers is
// set by the frame being fitted, so the extent can't simply be padded. It is
// found by solving for the scale instead: the smallest scale s (map units per
// output pixel) at which the content -- points and their symbols, drawn at s --
// gets a frame whose own scale is no larger than s.
//
// Every point's box moves each side of the extent linearly with s, so the
// extent's width and height are convex, piecewise-linear functions of s, and so
// is the frame scale they produce. Newton's method converges on the smallest
// fixed point of such a function from below, without overshooting, in as many
// steps as there are pieces along the way -- usually two or three.

var MAX_ITERATIONS = 50;
var TOLERANCE = 1e-9;

// Returns the extent of @targets as a bbox array, padded to hold the symbols
// and labels at their points and the strokes along their paths, or null if the
// targets have no extent.
//
// @targets   [{layer, dataset}]
// @getScale  function(bbox) -> map units per output px of a frame fitted to
//            @bbox; this is where the caller's offsets and page shape come in.
//            May return NaN for a bbox the frame can't be fitted to.
// @opts.ignore_symbols  fit to the coordinates alone
export function getFrameContentBbox(targets, getScale, opts) {
  // a data-only layer has no bounds
  var bounds = targets.reduce(function(memo, o) {
    var b = getLayerBounds(o.layer, o.dataset.arcs);
    return b ? memo.mergeBounds(b) : memo;
  }, new Bounds());
  var raw, items, bbox;
  if (!bounds.hasBounds()) return null;
  raw = bounds.toArray();
  if (opts && opts.ignore_symbols) return raw;
  items = getSymbolExtents(targets).concat(getStrokeExtents(targets, getScale(raw)));
  if (items.length === 0) return raw;
  bbox = fitBboxToSymbols(raw, items, getScale);
  if (!bbox) {
    warn('Symbols, labels and strokes are too large to fit in the frame; ' +
      'fitting the frame to coordinates only.');
    return raw;
  }
  return bbox;
}

// The map units per output px of a frame with extent @bbox and nominal width
// @width. A frame with a fixed page shape is filled out to that shape when it is
// rendered (see fitDatasetToFrame()), so its scale is set by whichever of its
// width and height is the tighter fit.
export function getFrameScale(bbox, width, fixedAspect) {
  var w = bbox[2] - bbox[0];
  var h = bbox[3] - bbox[1];
  return fixedAspect > 0 ? Math.max(w, h * fixedAspect) / width : w / width;
}

// @raw     bbox of the content without symbols
// @items   flat array of [x, y, xmin, ymin, xmax, ymax, ...]: each point and the
//          box around it in px, oriented like the map (y up)
// Returns the padded bbox, or null if there is no scale at which the symbols
// fit -- when they add up to more than the width of the page.
export function fitBboxToSymbols(raw, items, getScale) {
  var s = getScale(raw);
  var bbox, h, delta, slope, i;
  for (i = 0; i < MAX_ITERATIONS; i++) {
    if (!isValidScale(s)) return null;
    bbox = expandBbox(raw, items, s);
    h = getScale(bbox);
    if (!isValidScale(h)) return null;
    // Content with no extent of its own, like a single point, stops here with
    // s = 0: nothing about it sets a scale.
    if (h <= s * (1 + TOLERANCE)) return bbox;
    if (!(s > 0)) return null;
    delta = s * 1e-7;
    slope = (getScale(expandBbox(raw, items, s + delta)) - h) / delta;
    if (!(slope < 1)) return null;
    s += (h - s) / (1 - slope);
  }
  return expandBbox(raw, items, s);
}

function isValidScale(s) {
  return s >= 0 && s < Infinity;
}

function expandBbox(raw, items, s) {
  var xmin = raw[0], ymin = raw[1], xmax = raw[2], ymax = raw[3];
  var x, y, v;
  for (var i = 0, n = items.length; i < n; i += 6) {
    x = items[i];
    y = items[i + 1];
    v = x + items[i + 2] * s;
    if (v < xmin) xmin = v;
    v = y + items[i + 3] * s;
    if (v < ymin) ymin = v;
    v = x + items[i + 4] * s;
    if (v > xmax) xmax = v;
    v = y + items[i + 5] * s;
    if (v > ymax) ymax = v;
  }
  return [xmin, ymin, xmax, ymax];
}

// Boxes come from the renderer's space, where y is down, and are flipped here
// to the map's.
export function getSymbolExtents(targets) {
  var items = [];
  var cache = new Map();
  targets.forEach(function(o) {
    var lyr = o.layer;
    var records;
    if (lyr.geometry_type != 'point' || !lyr.shapes || !lyr.data) return;
    records = lyr.data.getRecords();
    lyr.shapes.forEach(function(shp, i) {
      var rec = records[i];
      var box, pad;
      if (!shp || !rec) return;
      if (shp.length > 1 && featureHasLabel(rec)) {
        // a multipoint label is drawn along a path through its points,
        // with no symbol (see featureIsPathLabel())
        pad = getPathLabelPadding(rec);
        box = [-pad, -pad, pad, pad];
      } else {
        box = getPointSymbolBox(rec, cache);
      }
      if (!box) return;
      for (var j = 0; j < shp.length; j++) {
        if (!shp[j] || !isFinite(shp[j][0]) || !isFinite(shp[j][1])) continue;
        items.push(shp[j][0], shp[j][1], box[0], -box[3], box[2], -box[1]);
      }
    });
  });
  return items;
}

// The same, for the strokes of path layers and the heads at the ends of lines.
// A stroke reaches the same distance past every side of its feature's bbox, so
// a feature adds two items, at its bbox's corners; a layer whose features are
// all stroked alike adds two for the layer.
// @scale  map units per px of a frame fitted to the coordinates alone, for
//   finding which way an arrowhead points, which depends a little on the
//   scale (see getLineArrowShape())
export function getStrokeExtents(targets, scale) {
  var items = [];
  targets.forEach(function(o) {
    var type = o.layer.geometry_type;
    if (type != 'polyline' && type != 'polygon' || !o.layer.shapes) return;
    addPathLayerItems(items, o.layer, o.dataset.arcs, scale);
  });
  return items;
}

function addPathLayerItems(items, lyr, arcs, scale) {
  var type = lyr.geometry_type;
  var records = lyr.data ? lyr.data.getRecords() : null;
  var shapes = lyr.shapes;
  var outsets = [];
  var layerOutset = null;
  var uniform = true;
  var shp, rec, outset, i, bounds;
  for (i = 0; i < shapes.length; i++) {
    shp = shapes[i];
    outsets.push(0);
    if (!shp || shp.length === 0) continue;
    rec = records ? records[i] : null;
    outset = getPathStrokeOutset(rec, type);
    outsets[i] = outset;
    if (layerOutset === null) {
      layerOutset = outset;
    } else if (outset !== layerOutset) {
      uniform = false;
    }
    if (type == 'polyline' && rec && lineHasArrows(rec)) {
      addLineEndItems(items, shp, arcs, rec, scale);
    }
  }
  if (uniform) {
    bounds = layerOutset > 0 ? getLayerBounds(lyr, arcs) : null;
    if (bounds) addOutsetItems(items, bounds.toArray(), layerOutset);
    return;
  }
  for (i = 0; i < shapes.length; i++) {
    if (!(outsets[i] > 0)) continue;
    bounds = arcs.getMultiShapeBounds(shapes[i]);
    if (bounds.hasBounds()) addOutsetItems(items, bounds.toArray(), outsets[i]);
  }
}

function addOutsetItems(items, bbox, pad) {
  items.push(bbox[0], bbox[1], -pad, -pad, -pad, -pad,
    bbox[2], bbox[3], pad, pad, pad, pad);
}

// Every part of a line gets its own heads
function addLineEndItems(items, shp, arcs, rec, scale) {
  var opts = getLineArrowOpts(rec, 1);
  var start = getLineEndType(rec, 'line-start');
  var end = getLineEndType(rec, 'line-end');
  shp.forEach(function(ids) {
    var coords = getPathCoords(ids, arcs);
    if (coords.length < 2) return;
    if (start != 'none') addLineEndItem(items, coords, start, opts, scale);
    if (end != 'none') addLineEndItem(items, coords.reverse(), end, opts, scale);
  });
}

// A head at the first point of @coords
function addLineEndItem(items, coords, type, opts, scale) {
  var tip = coords[0];
  var dir = type == 'dot' ? null : getHeadDirection(coords, opts.size, scale);
  var box = getLineEndBox(type, dir, opts);
  if (!box) return;
  items.push(tip[0], tip[1], box[0], -box[3], box[2], -box[1]);
}

// Unit vector in px, y down, from the end of a line along the chord to where
// the line first gets @len px from it, as a head drawn at @scale points.
// Without a scale, along the first segment of any length.
function getHeadDirection(coords, len, scale) {
  var tip = coords[0];
  var origin = [0, 0];
  var k = scale > 0 ? 1 / scale : 1;
  var prev = origin, p, i;
  for (i = 1; i < coords.length; i++) {
    p = [(coords[i][0] - tip[0]) * k, (tip[1] - coords[i][1]) * k];
    if (!(scale > 0)) {
      if (p[0] !== 0 || p[1] !== 0) return getUnitVector(origin, p);
    } else if (Math.sqrt(p[0] * p[0] + p[1] * p[1]) > len) {
      return getUnitVector(origin, getCircleExit(origin, len, prev, p));
    }
    prev = p;
  }
  return getUnitVector(origin, prev);
}

function getPathCoords(ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  var coords = [];
  while (iter.hasNext()) {
    coords.push([iter.x, iter.y]);
  }
  return coords;
}
