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

var scratch = {};

function getScratchCanvas(name, w, h) {
  var o = scratch[name];
  if (!o) {
    o = scratch[name] = {canvas: document.createElement('canvas')};
    o.ctx = o.canvas.getContext('2d');
  }
  // Grown and never shrunk: resizing a canvas reallocates it, and there can
  // be a resize for every shape drawn.
  if (o.canvas.width < w || o.canvas.height < h) {
    o.canvas.width = Math.max(o.canvas.width, w);
    o.canvas.height = Math.max(o.canvas.height, h);
  }
  o.ctx.setTransform(1, 0, 0, 1, 0, 0);
  o.ctx.clearRect(0, 0, w, h);
  return o;
}

// A canvas to draw what glows into, @w by @h device pixels. Separate from the
// ones compositeGlows() uses, so a shape can be drawn into it while a layer is
// being drawn into another.
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
// @pxScale: device pixels per px of glow width
export function compositeGlows(ctx, src, x, y, w, h, outer, inner, pxScale) {
  var glow, inverse;
  if (outer) {
    glow = getScratchCanvas('glow', w, h);
    drawShadow(glow.ctx, src, w, h, outer, pxScale);
    glow.ctx.globalCompositeOperation = 'destination-out';
    glow.ctx.drawImage(src, 0, 0, w, h, 0, 0, w, h);
    glow.ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(glow.canvas, 0, 0, w, h, x, y, w, h);
  }
  ctx.drawImage(src, 0, 0, w, h, x, y, w, h);
  if (inner) {
    inverse = getScratchCanvas('inverse', w, h);
    inverse.ctx.fillStyle = '#000';
    inverse.ctx.fillRect(0, 0, w, h);
    inverse.ctx.globalCompositeOperation = 'destination-out';
    inverse.ctx.drawImage(src, 0, 0, w, h, 0, 0, w, h);
    inverse.ctx.globalCompositeOperation = 'source-over';
    glow = getScratchCanvas('glow', w, h);
    drawShadow(glow.ctx, inverse.canvas, w, h, inner, pxScale);
    glow.ctx.globalCompositeOperation = 'destination-in';
    glow.ctx.drawImage(src, 0, 0, w, h, 0, 0, w, h);
    glow.ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(glow.canvas, 0, 0, w, h, x, y, w, h);
  }
}

// The shadow of the top-left @w by @h pixels of @img, with no image. The glow's
// opacity is globalAlpha rather than part of the shadow's color, which can be
// any CSS color and would have to be parsed to take one.
function drawShadow(ctx, img, w, h, glow, pxScale) {
  var offset = w + glow.width * pxScale * 4 + 10;
  ctx.save();
  ctx.globalAlpha = glow.opacity;
  ctx.shadowColor = glow.color;
  ctx.shadowBlur = glow.width * pxScale;
  ctx.shadowOffsetX = offset;
  ctx.shadowOffsetY = 0;
  ctx.drawImage(img, 0, 0, w, h, -offset, 0, w, h);
  ctx.restore();
}
