import { internal } from './gui-core';

// The handles on a selected anchored label, and what dragging each one
// writes, as pure functions of the label's record and the pointer.
//
// - width: on a text block only, at the bottom corner of its column on the
//   side that is free to move -- the right for text that starts at its
//   anchor, the left for text that ends there, the right for centred text,
//   which grows both ways. Dragging it sets label-width. Point text has none:
//   a label stays the kind it was made as, and a handle that turned point
//   text into a block was a way to do that by accident.
// - via: the elbow's corner, or the point the curve passes through.
// - attach: where the line meets the text, which slides around the padded box.
// - gap: where the line stops short of the anchor.
//
// A corner rather than the middle of the free side for the width handle,
// because the middle of a side is where an elbow meets a one-line label, and
// the two handles would sit on top of each other.
//
// Everything is in the label's own space -- origin at the anchor, y down, px
// -- which is the space the callout is worked out in. See
// docs/development/text-annotation-design.md.

// The narrowest a text block can be dragged to, px. Narrower than a character
// or two, and every character gets a line of its own.
export var MIN_LABEL_WIDTH = 10;

// How far out from the anchor the line has to stop before its gap handle is
// drawn, in screen px. Nearer than that the handle sits on the anchor's own,
// and the anchor is the one that matters more.
var MIN_GAP_HANDLE = 6;

// rec:     the label's record
// textBox: the rendered text's bbox, {x, y, width, height}, or null
// opts:
//   symbolRadius: radius of the symbol at the anchor, which the default gap
//     clears
//   scale:   screen px per label px
//   padding: how far outside the text the selection box is drawn
// Returns {handles: [{kind, point}], column}, where column is the x-range
//   [xmin, xmax] a text block wraps within, or null for point text. The
//   width handle sits on the column's corner, not the text's.
export function getAnchoredLabelHandles(rec, textBox, opts) {
  var o = opts || {};
  var handles = [];
  var column = getLabelColumn(rec);
  var shape = internal.svg.getLabelCalloutShape(rec, o.symbolRadius || 0);
  var width = textBox && column ?
    getWidthHandlePoint(rec, textBox, column, o.padding || 0) : null;
  // Nearer-first matters only for ties, which go to the earlier handle: the
  // callout's own handles are smaller and sit on the line, so they win.
  if (shape) {
    if (shape.via) handles.push({kind: 'via', point: shape.via});
    handles.push({kind: 'attach', point: shape.attach});
    if (length(shape.tip) * (o.scale || 1) >= MIN_GAP_HANDLE) {
      handles.push({kind: 'gap', point: shape.tip});
    }
  }
  if (width) handles.push({kind: 'width', point: width});
  return {handles: handles, column: column};
}

// The x-range a text block's lines wrap within, from where its drawn anchor
// puts it, or null for a label with no width.
export function getLabelColumn(rec) {
  var w = Number(rec && rec['label-width']);
  var drawn, anchor;
  if (!(w > 0 && isFinite(w))) return null;
  drawn = internal.svg.getDrawnLabelOffset(rec);
  anchor = getDrawnAnchor(drawn);
  if (anchor == 'end') return [drawn.dx - w, drawn.dx];
  if (anchor == 'middle') return [drawn.dx - w / 2, drawn.dx + w / 2];
  return [drawn.dx, drawn.dx + w];
}

// An anchor the record does not set is inherited from the layer's group,
// which is 'middle' -- see getLabelTextDefaults().
export function getDrawnAnchor(drawn) {
  return drawn && drawn['text-anchor'] || 'middle';
}

function getWidthHandlePoint(rec, box, column, pad) {
  var anchor = getDrawnAnchor(internal.svg.getDrawnLabelOffset(rec));
  var xmin = Math.min(column[0], box.x);
  var xmax = Math.max(column[1], box.x + box.width);
  var y = box.y + box.height + pad;
  return anchor == 'end' ? [xmin - pad, y] : [xmax + pad, y];
}

// The label-width a drag on the width handle sets, in whole px.
// anchor: the drawn text-anchor; dx: the drawn dx, which is the edge (or for
//   centred text the middle) that stays put
// x:   where the handle has been dragged to
// pad: how far outside the text the handle is drawn
export function getDraggedWidth(anchor, dx, x, pad) {
  var w;
  if (anchor == 'end') w = dx - x - pad;
  else if (anchor == 'middle') w = 2 * (Math.abs(x - dx) - pad);
  else w = x - pad - dx;
  return Math.max(MIN_LABEL_WIDTH, Math.round(w));
}

// Where a dragged via point lands: on a line level with, or plumb with, the
// anchor or the attachment point @t when it comes within @tol of one. Those
// are the alignments that make an elbow's legs horizontal or vertical.
export function snapCalloutVia(p, t, tol) {
  return [snapTo(p[0], [0, t[0]], tol), snapTo(p[1], [0, t[1]], tol)];
}

// Where on the padded @box a dragged attachment point lands, as the
// [fx, fy] fractions callout-attach stores: on the edge nearest @p, and at the
// middle of that edge or at a corner when within @tol of one. A side also
// snaps to the first line's midline, where an automatic elbow meets it.
export function getAttachFraction(box, p, tol) {
  var w = box.xmax - box.xmin;
  var h = box.ymax - box.ymin;
  var x = clamp(p[0], box.xmin, box.xmax);
  var y = clamp(p[1], box.ymin, box.ymax);
  var edge = getNearestEdge(box, x, y);
  var fx, fy, midline;
  if (edge == 'left' || edge == 'right') {
    fx = edge == 'left' ? 0 : 1;
    midline = h > 0 && box.midline > box.ymin && box.midline < box.ymax ?
      (box.midline - box.ymin) / h : 0.5;
    fy = h > 0 ? snapTo((y - box.ymin) / h, [0, midline, 0.5, 1], tol / h) : 0.5;
  } else {
    fy = edge == 'top' ? 0 : 1;
    fx = w > 0 ? snapTo((x - box.xmin) / w, [0, 0.5, 1], tol / w) : 0.5;
  }
  return [roundTo(fx, 1000), roundTo(fy, 1000)];
}

function getNearestEdge(box, x, y) {
  var d = {
    left: x - box.xmin,
    right: box.xmax - x,
    top: y - box.ymin,
    bottom: box.ymax - y
  };
  return Object.keys(d).reduce(function(memo, key) {
    return d[key] < d[memo] ? key : memo;
  }, 'left');
}

// The callout-gap a drag on the gap handle sets: how far from the anchor the
// line now stops, px.
export function getDraggedGap(p) {
  return roundTo(length(p), 10);
}

// Where a callout's via point goes when its text moves, which takes the
// attachment point from @t0 to @t1.
//
// A curve keeps its shape: the via point is rotated and scaled about the
// anchor by whatever takes @t0 to @t1. An elbow keeps its corner in
// proportion across the span from anchor to text, and a leg that was level
// with the text (or plumb with it) stays so, since that is almost always what
// a corner was put there for.
//
// type: 'elbow' or 'curve'
export function followCalloutVia(type, via, t0, t1) {
  var d2, re, im;
  if (type == 'curve') {
    d2 = t0[0] * t0[0] + t0[1] * t0[1];
    if (!(d2 > 0)) return via.slice();
    re = (t1[0] * t0[0] + t1[1] * t0[1]) / d2;
    im = (t1[1] * t0[0] - t1[0] * t0[1]) / d2;
    return [via[0] * re - via[1] * im, via[0] * im + via[1] * re];
  }
  return [followElbowCoord(via[0], t0[0], t1[0]), followElbowCoord(via[1], t0[1], t1[1])];
}

// Close enough to count as level, in px: the values are stored in tenths.
var LEVEL_TOLERANCE = 0.05;

function followElbowCoord(v, t0, t1) {
  if (Math.abs(v - t0) < LEVEL_TOLERANCE) return t1;
  // Scaling by a span of almost nothing throws the corner miles away, so a
  // text that started nearly in line with its anchor moves the corner with it
  // instead.
  if (Math.abs(t0) < 1) return v + t1 - t0;
  return v * t1 / t0;
}

// 'x,y', as callout-via and callout-attach store a pair
export function formatPointPair(p) {
  return formatNumber(p[0]) + ',' + formatNumber(p[1]);
}

function formatNumber(n) {
  var val = roundTo(n, 10);
  return String(val === 0 ? 0 : val); // no "-0"
}

function snapTo(val, targets, tol) {
  var best = val, bestDist = tol;
  targets.forEach(function(t) {
    var d = Math.abs(val - t);
    if (d <= bestDist) {
      bestDist = d;
      best = t;
    }
  });
  return best;
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

function length(p) {
  return Math.sqrt(p[0] * p[0] + p[1] * p[1]);
}

function roundTo(n, k) {
  return Math.round(n * k) / k;
}
