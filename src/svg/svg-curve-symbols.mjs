import { getCurveSegments, curveIsClosed, fitCurveThroughKnots } from '../curves/mapshaper-curve-fit';
import { applyStyleAttributes, isSvgNumber } from './svg-properties';
import { lineHasEndStyles, lineHasArrows, getLineArrowOpts, renderArrowLine } from './svg-line-arrows';
import { featureIsCurve } from './svg-feature-utils';

// Curve symbols (icon=curve) are smooth paths fitted through a multipoint
// feature's points, with Hobby's algorithm -- the fit that path labels use
// (see mapshaper-curve-fit.mjs). The knots are the only thing stored, so the
// curve is refitted whenever it is drawn, and stays editable as a curve.
//
// A curve whose last knot repeats its first is a closed loop, which can take
// a fill. An open curve can take the line-end markers, fade and taper of a
// line (line-start=, line-end=, line-end-size=, line-fade=, line-taper=).
// Stroke widths and marker sizes are in px, like the sizes of other point
// symbols.
//
// Coordinates are px, y down: the SVG export's space, or the space inside a
// symbol group in the GUI.

// Greatest distance of a flattened curve from the true one, in px. Only a
// curve with end markers is flattened, because the markers are fitted to a
// polyline (see svg-line-arrows.mjs); any other curve is written as true
// cubic Beziers.
var FLATTEN_TOLERANCE = 0.1;

var DEFAULT_STROKE_WIDTH = 1;

export { featureIsCurve, curveIsClosed };

// featureIsCurve() for a point layer's shape, an array of points. A curve needs
// two knots; a single-point feature with icon=curve draws nothing.
export function shapeIsCurve(shp, rec) {
  return !!(shp && shp.length > 1 && featureIsCurve(rec));
}

// Returns an SVG object, or null if the knots collapse to a single point
// knots: the feature's points, in the space the curve is drawn in
export function renderCurveSymbol(rec, knots) {
  var closed = curveIsClosed(knots);
  var stroke = getCurveStroke(rec, closed);
  var obj, d, pts;
  if (stroke != rec.stroke) {
    rec = Object.assign({}, rec, {stroke: stroke});
  }
  if (!closed && lineHasEndStyles(rec)) {
    pts = fitCurveThroughKnots(knots, FLATTEN_TOLERANCE);
    if (pts.length < 2) return null;
    obj = renderArrowLine([pts], rec);
  } else {
    d = getCurvePathData(knots, closed);
    if (!d) return null;
    obj = {tag: 'path', properties: {d: d}};
  }
  applyStyleAttributes(obj, closed ? 'polygon' : 'polyline', rec);
  // set explicitly, so that the layer's defaults (e.g. a point layer's fill)
  // don't apply
  obj.properties.fill = closed && rec.fill || 'none';
  obj.properties.stroke = stroke;
  return obj;
}

// An open curve has no fill, so a fill color given to one colors its line, as
// it does a stick arrow's. A closed curve with a fill and no stroke has none.
function getCurveStroke(rec, closed) {
  if (rec.stroke) return rec.stroke;
  if (closed) return rec.fill ? 'none' : 'black';
  return rec.fill || 'black';
}

// The path's 'd' attribute, as cubic curves
export function getCurvePathData(knots, closed) {
  var segments = getCurveSegments(knots, closed);
  var parts, seg, i;
  if (segments.length === 0) return null;
  parts = ['M', fmt(segments[0].p0)];
  for (i = 0; i < segments.length; i++) {
    seg = segments[i];
    parts.push('C', fmt(seg.c1), fmt(seg.c2), fmt(seg.p3));
  }
  if (closed) parts.push('Z');
  return parts.join(' ');
}

// How far the curve's stroke and end markers reach past its knots, in px.
// The curve itself can bow out past the knots, which this leaves out.
export function getCurvePadding(rec) {
  var sw = isSvgNumber(rec['stroke-width']) ? Number(rec['stroke-width']) : DEFAULT_STROKE_WIDTH;
  var pad = sw / 2;
  if (lineHasArrows(rec)) {
    pad = Math.max(pad, getLineArrowOpts(rec, 1).size);
  }
  return pad;
}

function fmt(p) {
  return round(p[0]) + ' ' + round(p[1]);
}

function round(n) {
  return Math.round(n * 100) / 100;
}
