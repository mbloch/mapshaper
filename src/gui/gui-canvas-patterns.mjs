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


export function getCanvasFillPattern(style) {
  var fill = hatches[style.fillPattern];
  if (fill === undefined) {
    fill = makePatternFill(style);
    hatches[style.fillPattern] = fill;
  }
  return fill || style.fill || '#000'; // use fill if hatches are invalid
}

function makePatternFill(style) {
  var o = internal.parsePattern(style.fillPattern);
  if (!o) return null;
  var canv = document.createElement('canvas');
  var ctx = canv.getContext('2d');
  var res = GUI.getPixelRatio();
  var w = o.tileSize[0] * res;
  var h = o.tileSize[1] * res;
  canv.setAttribute('width', w);
  canv.setAttribute('height', h);
  if (o.background) {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, w, h);
  }
  if (o.type == 'dots' || o.type == 'squares') makeDotFill(o, ctx, res);
  if (o.type == 'dashes') makeDashFill(o, ctx, res);
  if (o.type == 'hatches') makeHatchFill(o, ctx, res);
  var pattern = ctx.createPattern(canv, 'repeat');
  if (o.rotation) {
    pattern.setTransform(new DOMMatrix('rotate(' + o.rotation + 'deg)'));
  }
  return pattern;
}

function makeDashFill(o, ctx, res) {
  var x = 0;
  for (var i=0; i<o.colors.length; i++) {
    ctx.fillStyle = o.colors[i];
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
    ctx.fillStyle = o.colors[(i + Math.floor(i / n)) % n];
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
    ctx.fillStyle = o.colors[i];
    ctx.fillRect(x, 0, x + w, h);
    x += w;
  }
}
