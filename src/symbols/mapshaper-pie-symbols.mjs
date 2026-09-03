import { getPlanarSegmentEndpoint } from '../geom/mapshaper-geodesic';
import {
  getSymbolRadius, flipY, roundCoordsForSVG, toItemList, toNumberList
} from './mapshaper-symbol-utils';
import { parseColor } from '../color/color-utils';
import { stop } from '../utils/mapshaper-logging';

// Matches the vertex density of the 72-sided circle made by getPolygonCoords()
var DEGREES_PER_SEGMENT = 5;

// Returns an svg-symbol object containing one polygon part per wedge, or null
// if the symbol has nothing to draw.
export function makePieSymbol(d, opts) {
  var wedges = getPieWedges(d, +opts.scale || 1);
  if (wedges.length === 0) return null;
  var parts = wedges.map(function(wedge) {
    flipY(wedge.coordinates); // the SVG y-axis points down
    roundCoordsForSVG(wedge.coordinates);
    var part = {
      type: 'polygon',
      coordinates: wedge.coordinates,
      fill: wedge.fill
    };
    if (d.stroke) part.stroke = d.stroke;
    if (d['stroke-width']) part['stroke-width'] = d['stroke-width'];
    // opacity is applied per-part, not to the group: renderComplexSymbol()
    // assumes a group symbol has a properties object, which group() only
    // provides for single-part groups.
    if (d.opacity) part.opacity = d.opacity;
    return part;
  });
  return {type: 'group', parts: parts};
}

// Returns an array of {fill, coordinates} objects, in the y-up coordinate space
// shared by the symbol generators, centered on [0, 0]. Coordinates are an array
// of rings, like flattened GeoJSON MultiPolygon coordinates.
//
// The first wedge starts at the top of the symbol and the rest follow in
// clockwise order. A wedge with no value, or without a usable fill color, is
// left out -- an unfilled wedge becomes a gap in the pie without shifting the
// wedges that follow it.
export function getPieWedges(d, scale) {
  var values = getPieValues(d);
  var fills = getPieFills(d);
  var radii = getPieRadii(d, scale || 1);
  var rotation = +d.rotation || 0;
  var total = sum(values);
  var wedges = [];
  var start = rotation;
  var fill, end;
  if (total > 0 === false || radii.outer > 0 === false) return wedges;
  for (var i=0; i<values.length; i++) {
    end = start + values[i] / total * 360;
    fill = getWedgeFill(fills[i]);
    if (fill && end > start) {
      wedges.push({
        fill: fill,
        coordinates: getWedgeCoords(start, end, radii.inner, radii.outer)
      });
    }
    start = end;
  }
  return wedges;
}

// Returns an array of rings outlining a wedge spanning two bearings.
function getWedgeCoords(startAngle, endAngle, inner, outer) {
  var ring;
  if (endAngle - startAngle >= 360) {
    // A single non-zero value covers the whole symbol: a circle, or a pair of
    // concentric rings if the symbol is a donut.
    ring = closeRing(getArcCoords(startAngle, startAngle + 360, outer));
    if (inner > 0) {
      // wind the hole in the opposite direction from the outer ring
      return [ring, closeRing(getArcCoords(startAngle + 360, startAngle, inner))];
    }
    return [ring];
  }
  ring = getArcCoords(startAngle, endAngle, outer);
  if (inner > 0) {
    // A wedge of a donut is a simple polygon, so the hole needs no ring of
    // its own -- the inner arc doubles back inside the outer one.
    ring = ring.concat(getArcCoords(endAngle, startAngle, inner));
  } else {
    ring.push([0, 0]);
  }
  ring.push(ring[0].concat());
  return [ring];
}

// A 360 degree arc starts and ends at the same angle, but rounding leaves its
// endpoints a hair apart, so the ring is closed explicitly.
function closeRing(ring) {
  ring[ring.length - 1] = ring[0].concat();
  return ring;
}

// Returns points along an arc, including both endpoints. Angles are bearings,
// which run clockwise from the top of the symbol -- the same convention as
// rotateCoords(), so the rotation= option is just an offset to the first angle.
function getArcCoords(startAngle, endAngle, radius) {
  var sweep = endAngle - startAngle;
  var segments = Math.max(1, Math.ceil(Math.abs(sweep) / DEGREES_PER_SEGMENT));
  var coords = [];
  for (var i=0; i<=segments; i++) {
    coords.push(getPlanarSegmentEndpoint(0, 0, startAngle + sweep * i / segments, radius));
  }
  return coords;
}

// Missing, non-numeric and negative values all count as zero.
function getPieValues(d) {
  if (!d.values) {
    stop('A pie symbol requires a values= option.');
  }
  return toNumberList(d.values).map(function(num) {
    return num > 0 ? num : 0;
  });
}

function getPieFills(d) {
  if (!d.fills) {
    stop('A pie symbol requires a fills= option.');
  }
  return toItemList(d.fills);
}

// Returns the color to fill a wedge with, or null if the wedge should be left
// out of the symbol.
function getWedgeFill(val) {
  var str = val === null || val === undefined ? '' : String(val).trim();
  var name = str.toLowerCase();
  var rgb;
  if (!str || name == 'none' || name == 'transparent') {
    return null;
  }
  rgb = parseColor(str);
  if (!rgb || rgb.a === 0) return null;
  return str;
}

// Returns {inner, outer} radii in pixels. The hole= option makes a donut. A
// negative hole is measured inward from the outer radius, which gives a band
// of wedges of a fixed width without having to repeat a data-driven radius=
// expression. A hole as wide as the symbol leaves a plain pie, and a
// non-positive outer radius is left for the caller to skip, like radius=0 on
// the other symbol types.
export function getPieRadii(d, scale) {
  var outer = getSymbolRadius(d);
  var hole = +d.hole;
  var inner = 0;
  if (hole > 0) {
    inner = hole;
  } else if (hole < 0) {
    inner = outer + hole;
  }
  if (!(inner > 0) || inner >= outer) inner = 0;
  return {
    inner: inner * scale,
    outer: outer * scale
  };
}

function sum(arr) {
  var total = 0;
  for (var i=0; i<arr.length; i++) {
    total += arr[i];
  }
  return total;
}
