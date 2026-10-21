import { internal } from './gui-core';

// Canvas rendering of polygon glows, matching the SVG filters in svg-glow.mjs.
//
// What glows is drawn first into a scratch canvas: one shape, or a whole layer
// for a layer's outer glow. The glows are then made from that image's alpha,
// the way a filter works from SourceAlpha:
//
//   outer  the image's shadow, with the image itself cut out of it
//   inner  the shadow of the image's inverse, kept only inside the image
//
// A shadow is only drawn with the image that casts it, so the image is drawn
// off the edge of the canvas and its shadow is offset back into place. Drawn
// in place and clipped, the image leaks into its own antialiased edge.
//
// A shadow's shadowBlur is twice the standard deviation of its blur, and a
// glow's width is twice the standard deviation of the filter's, so the two
// are the same number. Shadows are drawn in device pixels whatever the
// transform, and the scratch canvases are never transformed when one is.
//
// A glow's width grows with the preview's magnification, and the time a blur
// takes grows with its width and the size of the image. A wide blur has no
// detail to lose, so it is made from a copy of the image scaled down until the
// blur is MAX_BLUR pixels wide, and scaled back up. Only the part of a glow
// that lands on the destination canvas is made at full size.

// Widest blur drawn at full size, in device pixels
var MAX_BLUR = 24;

// How far past the canvas the shapes casting glows into it are drawn, at most,
// in device pixels. Shapes farther away than this contribute only the faint
// tail of a wide glow.
export var MAX_GLOW_MARGIN = 1024;

// Browsers stop drawing into a canvas larger than about 32k pixels on a side
// or 268M pixels in all, and it stays broken after it is made smaller again.
var MAX_SCRATCH_SIDE = 16384;
var MAX_SCRATCH_AREA = 64e6;

var scratch = {};

// Returns null if the canvas would be too large to draw into.
function getScratchCanvas(name, w, h) {
  var o = scratch[name];
  var w2, h2;
  if (w > MAX_SCRATCH_SIDE || h > MAX_SCRATCH_SIDE || w * h > MAX_SCRATCH_AREA) {
    return null;
  }
  if (!o) {
    o = scratch[name] = {canvas: document.createElement('canvas')};
    o.ctx = o.canvas.getContext('2d');
  }
  // Grown and never shrunk: resizing a canvas reallocates it, and there can
  // be a resize for every shape drawn.
  if (o.canvas.width < w || o.canvas.height < h) {
    w2 = Math.max(o.canvas.width, w);
    h2 = Math.max(o.canvas.height, h);
    if (w2 * h2 > MAX_SCRATCH_AREA) {
      w2 = w;
      h2 = h;
    }
    o.canvas.width = w2;
    o.canvas.height = h2;
  }
  o.ctx.setTransform(1, 0, 0, 1, 0, 0);
  o.ctx.clearRect(0, 0, w, h);
  return o;
}

// A canvas to draw what glows into, @w by @h device pixels. Separate from the
// ones compositeGlows() uses, so a shape can be drawn into it while a layer is
// being drawn into another. Null if it would be too large.
// @name: 'shape' or 'layer'
export function getGlowSourceCanvas(name, w, h) {
  return getScratchCanvas('source-' + name, w, h);
}

// How far past a shape its glows reach, in device pixels.
export function getGlowMargin(outer, inner, pxScale) {
  var width = Math.max(outer ? outer.width : 0, inner ? inner.width : 0);
  return Math.ceil(width * pxScale * internal.svg.GLOW_REACH) + 2;
}

// Draws @src (the top-left @w by @h pixels of a canvas) into @ctx at @x, @y,
// with its glows: the outer one underneath and the inner one on top.
// @ctx may be translated, but not scaled.
// @pxScale: device pixels per px of glow width
export function compositeGlows(ctx, src, x, y, w, h, outer, inner, pxScale) {
  var vis = getVisibleRect(ctx, x, y, w, h);
  if (!vis) return;
  if (outer) drawGlow(ctx, src, x, y, w, h, vis, outer, pxScale, false);
  ctx.drawImage(src, vis.x, vis.y, vis.w, vis.h, x + vis.x, y + vis.y, vis.w, vis.h);
  if (inner) drawGlow(ctx, src, x, y, w, h, vis, inner, pxScale, true);
}

// The part of @src that lands on @ctx's canvas, in @src's pixels
function getVisibleRect(ctx, x, y, w, h) {
  var m = ctx.getTransform();
  var x0 = Math.max(0, Math.floor(-m.e - x));
  var y0 = Math.max(0, Math.floor(-m.f - y));
  var x1 = Math.min(w, Math.ceil(ctx.canvas.width - m.e - x));
  var y1 = Math.min(h, Math.ceil(ctx.canvas.height - m.f - y));
  if (x1 <= x0 || y1 <= y0) return null;
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}

// Draws one of @src's glows into @ctx, made at 1/k the size of @src, where k
// keeps the blur within MAX_BLUR pixels.
// @vis: the part of @src that lands on @ctx
function drawGlow(ctx, src, x, y, w, h, vis, glow, pxScale, inner) {
  var blur = glow.width * pxScale;
  var k = Math.max(1, blur / MAX_BLUR);
  var sw = Math.ceil(w / k);
  var sh = Math.ceil(h / k);
  var full = vis.w == w && vis.h == h;
  var caster, shadow, out;
  if (k > 1 || inner) {
    caster = getScratchCanvas('caster', sw, sh);
    if (!caster) return;
    if (k > 1) caster.ctx.imageSmoothingQuality = 'high';
    if (inner) {
      caster.ctx.fillStyle = '#000';
      caster.ctx.fillRect(0, 0, w / k, h / k);
      caster.ctx.globalCompositeOperation = 'destination-out';
    }
    caster.ctx.drawImage(src, 0, 0, w, h, 0, 0, w / k, h / k);
    caster.ctx.globalCompositeOperation = 'source-over';
    caster = caster.canvas;
  } else {
    caster = src;
  }
  out = getScratchCanvas('glow', vis.w, vis.h);
  if (!out) return;
  if (k == 1 && full) {
    drawShadow(out.ctx, caster, sw, sh, glow, blur);
  } else {
    shadow = getScratchCanvas('shadow', sw, sh);
    if (!shadow) return;
    drawShadow(shadow.ctx, caster, sw, sh, glow, blur / k);
    out.ctx.drawImage(shadow.canvas, vis.x / k, vis.y / k, vis.w / k, vis.h / k,
      0, 0, vis.w, vis.h);
  }
  out.ctx.globalCompositeOperation = inner ? 'destination-in' : 'destination-out';
  out.ctx.drawImage(src, vis.x, vis.y, vis.w, vis.h, 0, 0, vis.w, vis.h);
  out.ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(out.canvas, 0, 0, vis.w, vis.h, x + vis.x, y + vis.y, vis.w, vis.h);
}

// The shadow of the top-left @w by @h pixels of @img, with no image. The glow's
// opacity is globalAlpha rather than part of the shadow's color, which can be
// any CSS color and would have to be parsed to take one.
// @blur: shadowBlur, in pixels of @img
function drawShadow(ctx, img, w, h, glow, blur) {
  var offset = w + blur * 4 + 10;
  ctx.save();
  ctx.globalAlpha = glow.opacity;
  ctx.shadowColor = glow.color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offset;
  ctx.shadowOffsetY = 0;
  ctx.drawImage(img, 0, 0, w, h, -offset, 0, w, h);
  ctx.restore();
}
