import { GUI } from './gui-lib';
import { internal, Bounds } from './gui-core';

var hatches = {}; // cached patterns

export function getCanvasFillEffect(ctx, shp, arcs, ext, style) {
  var bounds = arcs.getMultiShapeBounds(shp);
  if (!bounds.hasBounds() || style.fillEffect != 'sphere') {
    return null;
  }
  bounds.transform(ext.getTransform(GUI.getPixelRatio()));
  bounds.fillOut(1); // convert to square
  var o = convertSvgSphereParams(bounds);
  var fill = ctx.createRadialGradient(o.x0, o.y0, o.r0, o.x1, o.y1, o.r1);
  o.stops.forEach(function(stop) {
    fill.addColorStop(stop.offset, stop.color);
  });
  return fill;
}

function convertSvgSphereParams(bounds) {
  var bbox = bounds.toArray(),
      d = Math.max(bounds.width(), bounds.height()),
      cx = bounds.centerX(),
      cy = bounds.centerY(),
      o = internal.getSphereEffectParams();
  return {
    x0: bbox[0] + d * o.fx,
    y0: bbox[1] + d * o.fy,
    r0: 0,
    x1: bbox[0] + d * o.cx,
    y1: bbox[1] + d * o.cy,
    r1: d * o.r,
    stops: o.stops.map(function(stop) {
      return {offset: stop.offset, color: `rgba(0,0,0,${stop.opacity})`};
    })
  };
}


// symbolScale: the preview symbol scale (1 outside preview). Pattern sizes are
// in output pixels, like stroke widths, so the tile grows with the page.
// anchor: canvas-pixel position the pattern origin is pinned to, so the tile
// travels with the map instead of sticking to the viewport. Panning only
// updates this matrix. The tile image is rebuilt when the scale changes,
// which is at most once per pattern per render.
export function getCanvasFillPattern(style, symbolScale, anchor) {
  var scale = symbolScale > 0 ? symbolScale : 1;
  var entry = hatches[style.fillPattern];
  if (!entry || entry.scale != scale) {
    entry = makePatternEntry(style, scale);
    hatches[style.fillPattern] = entry;
  }
  if (!entry || !entry.pattern) return style.fill || '#000';
  if (anchor) applyPatternAnchor(entry, anchor);
  return entry.pattern;
}

function makePatternEntry(style, scale) {
  var o = internal.parsePattern(style.fillPattern);
  if (!o) return null;
  var canv = document.createElement('canvas');
  var ctx = canv.getContext('2d');
  var k = GUI.getPixelRatio() * scale;
  var tw = o.tileSize[0], th = o.tileSize[1];
  // A canvas has whole-pixel dimensions, but the scaled tile generally does
  // not. The tile is drawn into the nearest whole-pixel canvas, and the
  // pattern transform stretches it back to its exact size so that the
  // repeat period doesn't drift across a large polygon.
  var w = Math.max(1, Math.round(tw * k));
  var h = Math.max(1, Math.round(th * k));
  canv.setAttribute('width', w);
  canv.setAttribute('height', h);
  ctx.scale(w / tw, h / th);
  if (o.background) {
    ctx.fillStyle = getCanvasColor(o.background);
    ctx.fillRect(0, 0, tw, th);
  }
  if (o.type == 'dots' || o.type == 'squares') makeDotFill(o, ctx, 1);
  if (o.type == 'dashes') makeDashFill(o, ctx, 1);
  if (o.type == 'hatches') makeHatchFill(o, ctx, 1);
  return {
    scale: scale,
    pattern: ctx.createPattern(canv, 'repeat'),
    rotation: o.rotation || 0,
    sx: tw * k / w,
    sy: th * k / h,
    w: w,
    h: h
  };
}

// Pins the cached pattern to @anchor. Skipped when the view has not moved,
// so a hover redraw does not touch the pattern.
function applyPatternAnchor(entry, anchor) {
  if (entry.ax == anchor.x && entry.ay == anchor.y) return;
  entry.ax = anchor.x;
  entry.ay = anchor.y;
  var t = getPatternTransform(entry, anchor);
  entry.pattern.setTransform(new DOMMatrix([t.a, t.b, t.c, t.d, t.e, t.f]));
}

// Matrix taking pattern-image pixels to canvas pixels: translate to the
// anchor, then rotate, then scale. The anchor is folded into one tile so a
// map origin far outside the viewport does not blow the matrix precision.
export function getPatternTransform(entry, anchor) {
  var p = wrapPatternAnchor(anchor.x, anchor.y, entry);
  var rad = (entry.rotation || 0) * Math.PI / 180;
  var c = Math.cos(rad);
  var s = Math.sin(rad);
  return {
    a: c * entry.sx,
    b: s * entry.sx,
    c: -s * entry.sy,
    d: c * entry.sy,
    e: p.x,
    f: p.y
  };
}

// @entry.sx/sy scale image pixels to canvas pixels; the image repeats every
// @entry.w by @entry.h pixels. Returns a point in the same place on the
// pattern, within one tile of the origin.
export function wrapPatternAnchor(x, y, entry) {
  var rad = (entry.rotation || 0) * Math.PI / 180;
  var c = Math.cos(rad);
  var s = Math.sin(rad);
  var rx = c * x + s * y;
  var ry = -s * x + c * y;
  var qx = rx / entry.sx - Math.floor(rx / entry.sx / entry.w) * entry.w;
  var qy = ry / entry.sy - Math.floor(ry / entry.sy / entry.h) * entry.h;
  var lx = qx * entry.sx;
  var ly = qy * entry.sy;
  return {
    x: c * lx - s * ly,
    y: s * lx + c * ly
  };
}

// SVG's "none" is not a canvas colour, and a canvas ignores a fillStyle it
// cannot parse -- keeping the last one set, which on a fresh tile is black.
export function getCanvasColor(color) {
  return String(color).trim().toLowerCase() == 'none' ? 'transparent' : color;
}

function makeDashFill(o, ctx, res) {
  var x = 0;
  for (var i=0; i<o.colors.length; i++) {
    ctx.fillStyle = getCanvasColor(o.colors[i]);
    ctx.fillRect(x, 0, o.width * res, o.dashes[0] * res);
    x += res * (o.spacing + o.width);
  }
}

function makeDotFill(o, ctx, res) {
  var dotSize = o.size * res;
  var r = dotSize / 2;
  var n = o.colors.length;
  var dist = dotSize + o.spacing * res;
  var dots = n * n;
  var x = 0, y = 0;
  for (var i=0; i<dots; i++) {
    if (o.type == 'dots') ctx.beginPath();
    ctx.fillStyle = getCanvasColor(o.colors[(i + Math.floor(i / n)) % n]);
    if (o.type == 'dots') {
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    } else {
      ctx.fillRect(x, y, dotSize, dotSize);
    }
    if (o.type == 'dots') ctx.fill();
    x = ((i + 1) % n) * dist;
    if (x == 0) y += dist;
  }
}

function makeHatchFill(o, ctx, res) {
  var h = o.tileSize[1] * res;
  var w;
  for (var i=0, x=0; i<o.widths.length; i++) {
    w = o.widths[i] * res;
    ctx.fillStyle = getCanvasColor(o.colors[i]);
    ctx.fillRect(x, 0, w, h);
    x += w;
  }
}
