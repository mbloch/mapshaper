import { internal } from './gui-core';

// The visible guide for a label path being placed: a line along the curve the
// text will follow, and a handle on each knot.
//
// This covers the curve under construction only. Once the curve is a label, its
// path and knots are drawn by the selection cue instead
// (gui-label-selection.mjs), which knows which knots can be grabbed and draws
// in the selection's colour; drawing both left a violet fringe around every
// handle.
//
// A path label's geometry is a multipoint, so the guide cannot be drawn the way
// vertex editing draws a path's vertices -- there is no path in the data to take
// vertices from. Both parts of the guide are synthesized here instead, as
// display-only layers that never enter the catalog.
//
// See docs/development/label-tool-design.md.

var violet = '#cc6acc';
var white = '#ffffff';

var KNOT_RADIUS = 3.2;

// Flattening tolerance as a fraction of the curve's own size, which keeps the
// guide smooth at any zoom and, because it does not depend on the view, lets
// the guide layers be cached across pan and zoom like other overlays.
var FLATTEN_RATIO = 0.002;

// Knots of a curve the user is drawing, in display coordinates, or null. Held
// here rather than in the data so that an abandoned curve leaves nothing
// behind: no layer, no undo entry, no session history entry.
var pendingPath = null;

// preview: (optional) the pointer's position, which the curve is drawn through
//   as if it were the next knot but which is not one yet. This is what makes
//   the far end of the path follow the pointer between clicks, so the user can
//   see the curve a click is about to commit to instead of inferring it.
export function setPendingLabelPath(knots, preview) {
  pendingPath = knots && knots.length > 0 ?
    {knots: knots, preview: preview || null} : null;
}

export function getPendingLabelPath() {
  return pendingPath;
}

export function clearPendingLabelPath() {
  pendingPath = null;
}

// Display-only layers drawing @curves over @activeLyr: a line along each curve
// and a handle on each knot. Either may be absent -- a single-knot curve has
// handles but no line.
// Returns [] | [knotLyr] | [lineLyr, knotLyr]
export function getLabelPathGuideLayers(activeLyr, curves) {
  var layers = [];
  var lineLyr, knotLyr;
  if (!activeLyr || !activeLyr.gui || !curves || curves.length === 0) return [];
  lineLyr = buildGuideLineLayer(activeLyr, curves);
  knotLyr = buildKnotLayer(activeLyr, curves);
  if (lineLyr) layers.push(lineLyr);
  if (knotLyr) layers.push(knotLyr);
  return layers;
}

// The points the curve is fitted through: the knots, plus the pointer if the
// curve is being drawn. Only the line uses this -- the pointer gets no handle,
// because a handle is something to grab and that one would move away.
function getFittedKnots(curve) {
  return curve.preview ? curve.knots.concat([curve.preview]) : curve.knots;
}

function buildGuideLineLayer(activeLyr, curves) {
  var xx = [], yy = [], nn = [], shapes = [];
  var pts, knots, i, j;
  for (i = 0; i < curves.length; i++) {
    knots = getFittedKnots(curves[i]);
    pts = internal.fitCurveThroughKnots(knots, getFlattenTolerance(knots));
    if (pts.length < 2) continue; // a single knot has no line yet
    shapes.push([[nn.length]]); // nn.length is this arc's id, before it is added
    nn.push(pts.length);
    for (j = 0; j < pts.length; j++) {
      xx.push(pts[j][0]);
      yy.push(pts[j][1]);
    }
  }
  if (shapes.length === 0) return null;
  return wrapGuideLayer(activeLyr, {
    name: 'label-path-guide',
    geometry_type: 'polyline',
    shapes: shapes
  }, {
    strokeColor: violet,
    strokeWidth: 1.2,
    fillColor: null
  }, new internal.ArcCollection(nn, xx, yy));
}

function buildKnotLayer(activeLyr, curves) {
  var shapes = [];
  var curve, i, j;
  // one point per shape, so that a handle can be addressed on its own
  for (i = 0; i < curves.length; i++) {
    curve = curves[i];
    for (j = 0; j < curve.knots.length; j++) {
      shapes.push([curve.knots[j]]);
    }
  }
  if (shapes.length === 0) return null;
  return wrapGuideLayer(activeLyr, {
    name: 'label-path-knots',
    geometry_type: 'point',
    shapes: shapes
  }, {
    // type: 'styled' is what gets these drawn as circles.
    type: 'styled',
    radius: KNOT_RADIUS,
    strokeColor: violet,
    strokeWidth: 1.5,
    fillColor: white
  });
}

// Presents a synthesized layer the way the canvas renderer expects, borrowing
// the active layer's gui context for the parts it does not replace.
function wrapGuideLayer(activeLyr, displayLayer, style, arcs) {
  var gui = Object.assign({}, activeLyr.gui, {
    displayLayer: displayLayer,
    displayArcs: arcs || null,
    // the synthesized coordinates are already in the display CRS, so they must
    // not be reprojected again
    geographic: false,
    arcCounts: null,
    bounds: null,
    style: Object.assign({overlay: true}, style)
  });
  return Object.assign({}, activeLyr, {gui: gui});
}

function getFlattenTolerance(knots) {
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  var span, i;
  for (i = 0; i < knots.length; i++) {
    if (knots[i][0] < xmin) xmin = knots[i][0];
    if (knots[i][0] > xmax) xmax = knots[i][0];
    if (knots[i][1] < ymin) ymin = knots[i][1];
    if (knots[i][1] > ymax) ymax = knots[i][1];
  }
  span = Math.max(xmax - xmin, ymax - ymin);
  return span > 0 ? span * FLATTEN_RATIO : 0;
}
