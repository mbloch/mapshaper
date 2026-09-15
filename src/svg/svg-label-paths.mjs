import { getCurveSegments, getCurveLength } from '../curves/mapshaper-curve-fit';
import { stringifyLineStringCoords } from './svg-path-utils';
import { applyStyleAttributes, parseKnotIndexList } from './svg-properties';
import { getLabelFitState } from './svg-label-fit';
import { labelNewlineRxp, toLabelString } from './svg-labels';
import { featureHasLabel, featureIsLabel } from './svg-feature-utils';
import { message, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Renders a path-aligned label as <text><textPath>, with the path itself
// hoisted into <defs> by svg-definitions.mjs.
//
// A label's knots are its geometry, so a point label is an anchored label and a
// multipoint label is a path-aligned one. Note that this changes what a
// multipoint feature carrying label-text used to export as: previously the same
// label was drawn once at every point. Nothing depended on that -- the
// duplicate rendering was a known wart, flagged by a commented-out warning in
// layerHasLabels().
//
// See docs/development/label-tool-design.md.

// Number of dropped/stale ids to name in a report before summarizing the rest.
var MAX_REPORTED_IDS = 10;

// Property that carries a label's path data until a consumer moves it into a
// <defs> entry and replaces it with a reference. Export and the GUI both do
// this but assign ids differently -- export derives them from the path data so
// that output is byte-stable and identical paths share a definition, while the
// GUI namespaces them per rendered layer.
export var LABEL_PATH_PROPERTY = 'label-path-d';

// Class marking a label whose text is too long for its path. Only the GUI sets
// it, via keepOverflow; export drops such labels instead.
export var LABEL_OVERFLOW_CLASS = 'label-overflow';

export function featureIsPathLabel(geom, rec) {
  return !!(geom && geom.type == 'MultiPoint' && geom.coordinates &&
    geom.coordinates.length > 1 && featureHasLabel(rec));
}

// featureIsPathLabel() against a point layer's shape -- an array of coordinate
// pairs. Separate so that the GUI's render loop does not have to build a
// geometry object per shape just to ask the question.
//
// It is the GUI's test, and so it accepts a label whose text is still empty
// where the export test does not: a path label is one being typed into before
// it has any text, and it has to keep its curve while that is true.
export function shapeIsPathLabel(shp, rec) {
  return !!(shp && shp.length > 1 && featureIsLabel(rec));
}

// The 'd' attribute of a label's path, as true cubic curves rather than a
// densified polyline -- worth it here because an exported label path is
// re-editable in Illustrator, and because a smooth baseline is what the text
// is positioned against.
export function getLabelPathData(knots, corners) {
  var segments = getCurveSegments(knots, corners);
  var coords, seg, i;
  if (segments.length === 0) return null; // knots collapsed to a single point
  coords = [[segments[0].p0[0], segments[0].p0[1]]];
  for (i = 0; i < segments.length; i++) {
    seg = segments[i];
    // the 'C' tag marks a control point for the path writer, which then
    // consumes the following two coordinates as the second control point and
    // the segment's endpoint
    coords.push([seg.c1[0], seg.c1[1], 'C'], [seg.c2[0], seg.c2[1]],
      [seg.p3[0], seg.p3[1]]);
  }
  return stringifyLineStringCoords(coords);
}

export function initPathLabelReport() {
  return {dropped: [], stale: [], joined: []};
}

// Returns an SVG object, or null if the label is not rendered.
// knots: the feature's coordinates, in the units the label is drawn in
// opts:
//   report: optional collector, see initPathLabelReport()
//   id: feature id, used only in reports
//   keepOverflow: render a label that doesn't fit, marked with
//     LABEL_OVERFLOW_CLASS, instead of dropping it. The editor sets this,
//     because hiding a broken label makes it unfindable and so unfixable.
export function renderPathLabel(rec, knots, opts) {
  var corners = parseKnotIndexList(rec['label-corners']);
  var d = getLabelPathData(knots, corners);
  var report = opts && opts.report;
  var id = opts && opts.id;
  var state, text, textPath, o, cls;
  if (!d) return null;
  state = getLabelFitState(rec, getCurveLength(knots, corners));
  if (state == 'overflow') {
    if (!(opts && opts.keepOverflow)) {
      addToReport(report, 'dropped', id);
      return null;
    }
    cls = LABEL_OVERFLOW_CLASS;
  }
  if (state == 'stale') {
    addToReport(report, 'stale', id);
  }
  text = toLabelString(rec['label-text']);
  if (labelNewlineRxp.test(text)) {
    // a <tspan> inside a <textPath> advances along the path instead of
    // stacking below it, so the lines are joined rather than dropping
    // everything after the first one
    text = text.split(labelNewlineRxp).join(' ');
    addToReport(report, 'joined', id);
  }
  textPath = {
    tag: 'textPath',
    value: text,
    properties: {
      startOffset: rec['label-start-offset'] || getDefaultStartOffset(rec)
    }
  };
  // the caller replaces this with a reference to a <defs> entry
  textPath.properties[LABEL_PATH_PROPERTY] = d;
  if (rec['label-side']) {
    textPath.properties.side = rec['label-side'];
  }
  // dx and dy shift the text along and across the path respectively. They go
  // on the <textPath>, not the <text>: x and y on a <text> are ignored once it
  // has a <textPath> child, so renderLabel()'s trick of using x/y for offsets
  // does not carry over.
  if (rec.dx) textPath.properties.dx = rec.dx;
  if (rec.dy) textPath.properties.dy = rec.dy;
  o = {tag: 'text', properties: {}, children: [textPath]};
  applyStyleAttributes(o, 'label', rec);
  if (cls) {
    o.properties.class = o.properties.class ? o.properties.class + ' ' + cls : cls;
  }
  return o;
}

// Maps a label's knots into the coordinate space *inside* its rendered symbol
// group, which is translated to the label's first knot and scaled by
// @symbolScale. @transform maps CRS coordinates to screen pixels.
//
// The result depends only on the ratio between the two scales, which is what
// makes the framed case cheap: with a frame defined, zooming multiplies the
// view scale and the symbol scale by the same factor, so these coordinates --
// and the path built from them -- do not change. Panning cancels too, because
// the coordinates are relative to the first knot. With no frame the symbol
// scale is fixed at 1, so zooming does change them and the path has to be
// rebuilt.
export function getLabelPathCoords(knots, transform, symbolScale) {
  var origin = transform.transform(knots[0][0], knots[0][1]);
  var coords = [];
  var p, i;
  for (i = 0; i < knots.length; i++) {
    p = transform.transform(knots[i][0], knots[i][1]);
    coords.push([(p[0] - origin[0]) / symbolScale, (p[1] - origin[1]) / symbolScale]);
  }
  return coords;
}

// Replaces a rendered path label's marker property with a reference to a
// definition, and returns the path data the caller now has to define. Kept next
// to the renderer so that the element's shape is only assumed in one place.
export function referenceLabelPath(el, pathId) {
  var props = el.children[0].properties;
  var d = props[LABEL_PATH_PROPERTY];
  delete props[LABEL_PATH_PROPERTY];
  props.href = '#' + pathId;
  return d;
}

// startOffset positions the text's anchor along the path, so the default that
// leaves text where the anchor implies depends on text-anchor. 'middle' is the
// layer-level default set by getEmptyLayerForSVG().
function getDefaultStartOffset(rec) {
  var anchor = rec['text-anchor'] || 'middle';
  if (anchor == 'start') return '0%';
  if (anchor == 'end') return '100%';
  return '50%';
}

function addToReport(report, key, id) {
  if (report && report[key]) report[key].push(id);
}

export function reportPathLabels(report, lyr) {
  var name = lyr && lyr.name || '[unnamed]';
  if (!report) return;
  if (report.dropped.length > 0) {
    // A drop is reported rather than silent: an absent label is otherwise
    // indistinguishable from a bug.
    message(utils.format('Dropped %,d path label%s from layer "%s" because the text is longer than the path: %s.',
      report.dropped.length, utils.pluralSuffix(report.dropped.length), name,
      formatIds(report.dropped)));
  }
  if (report.stale.length > 0) {
    warn(utils.format('%,d path label%s in layer "%s" %s a text measurement that no longer matches the text or font, so %s drawn without checking the fit: %s.',
      report.stale.length, utils.pluralSuffix(report.stale.length), name,
      report.stale.length == 1 ? 'has' : 'have',
      report.stale.length == 1 ? 'it was' : 'they were',
      formatIds(report.stale)));
  }
  if (report.joined.length > 0) {
    warn(utils.format('%,d path label%s in layer "%s" contain%s a line break; multi-line text on a path is not supported, so the lines were joined: %s.',
      report.joined.length, utils.pluralSuffix(report.joined.length), name,
      report.joined.length == 1 ? 's' : '', formatIds(report.joined)));
  }
}

function formatIds(ids) {
  var extra = ids.length - MAX_REPORTED_IDS;
  var listed = extra > 0 ? ids.slice(0, MAX_REPORTED_IDS) : ids;
  var str = (listed.length == 1 ? 'feature ' : 'features ') + listed.join(', ');
  return extra > 0 ? str + ' and ' + extra + ' more' : str;
}
