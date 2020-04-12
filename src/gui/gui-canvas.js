import { internal, utils, Bounds } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';

// TODO: consider moving this upstream
function getArcsForRendering(obj, ext) {
  var dataset = obj.source.dataset;
  var sourceArcs = dataset.arcs;
  if (obj.geographic && dataset.displayArcs) {
    return dataset.displayArcs.getScaledArcs(ext);
  }
  return obj.arcs;
}

export function drawOutlineLayerToCanvas(obj, canv, ext) {
  var arcs;
  var style = obj.style;
  var darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
      lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
  var filter;
  if (internal.layerHasPaths(obj.layer)) {
    if (!obj.arcCounts) {
      obj.arcCounts = new Uint8Array(obj.arcs.size());
      internal.countArcsInShapes(obj.layer.shapes, obj.arcCounts);
    }
    if (obj.arcCounts) {
      arcs = getArcsForRendering(obj, ext);
      if (lightStyle.strokeColor) {
        filter = getArcFilter(arcs, ext, false, obj.arcCounts);
        canv.drawArcs(arcs, lightStyle, filter);
      }
      if (darkStyle.strokeColor && obj.layer.geometry_type != 'point') {
        filter = getArcFilter(arcs, ext, true, obj.arcCounts);
        canv.drawArcs(arcs, darkStyle, filter);
      }
    }
  }
  if (obj.layer.geometry_type == 'point') {
    canv.drawSquareDots(obj.layer.shapes, style);
  }
}

export function drawStyledLayerToCanvas(obj, canv, ext) {
  // TODO: add filter for out-of-view shapes
  var style = obj.style;
  var layer = obj.layer;
  var arcs, filter;
  if (layer.geometry_type == 'point') {
    if (style.type == 'styled') {
      canv.drawPoints(layer.shapes, style);
    } else {
      canv.drawSquareDots(layer.shapes, style);
    }
  } else {
    arcs = getArcsForRendering(obj, ext);
    filter = getShapeFilter(arcs, ext);
    canv.drawPathShapes(layer.shapes, arcs, style, filter);
  }
}


// Return a function for testing if an arc should be drawn in the current view
function getArcFilter(arcs, ext, usedFlag, arcCounts) {
  var minPathLen = 0.5 * ext.getPixelSize(),
      geoBounds = ext.getBounds(),
      geoBBox = geoBounds.toArray(),
      allIn = geoBounds.contains(arcs.getBounds()),
      visible;
  // don't continue dropping paths if user zooms out farther than full extent
  if (ext.scale() < 1) minPathLen *= ext.scale();
  return function(i) {
      var visible = true;
      if (usedFlag != arcCounts[i] > 0) { // show either used or unused arcs
        visible = false;
      } else if (arcs.arcIsSmaller(i, minPathLen)) {
        visible = false;
      } else if (!allIn && !arcs.arcIntersectsBBox(i, geoBBox)) {
        visible = false;
      }
      return visible;
    };
  }

// Return a function for testing if a shape should be drawn in the current view
function getShapeFilter(arcs, ext) {
  var viewBounds = ext.getBounds();
  var bounds = new Bounds();
  if (ext.scale() < 1.1) return null; // full or almost-full zoom: no filter
  return function(shape) {
    bounds.empty();
    arcs.getMultiShapeBounds(shape, bounds);
    return viewBounds.intersects(bounds);
  };
}

function getPixelColorFunction() {
  var canv = El('canvas').node();
  canv.width = canv.height = 1;
  return function(col) {
    var ctx = canv.getContext('2d');
    var pixels;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 1, 1);
    pixels = new Uint32Array(ctx.getImageData(0, 0, 1, 1).data.buffer);
    return pixels[0];
  };
}

export function DisplayCanvas() {
  var _self = El('canvas'),
      _canvas = _self.node(),
      _ctx = _canvas.getContext('2d'),
      _pixelColor = getPixelColorFunction(),
      _ext;

  _self.prep = function(extent) {
    var w = extent.width(),
        h = extent.height(),
        pixRatio = GUI.getPixelRatio();
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _canvas.width = w * pixRatio;
    _canvas.height = h * pixRatio;
    _self.classed('retina', pixRatio == 2);
    _self.show();
    _ext = extent;
  };

  /*
  // Original function, not optimized
  _self.drawPathShapes = function(shapes, arcs, style) {
    var startPath = getPathStart(_ext),
        drawPath = getShapePencil(arcs, _ext),
        styler = style.styler || null;
    for (var i=0, n=shapes.length; i<n; i++) {
      if (styler) styler(style, i);
      startPath(_ctx, style);
      drawPath(shapes[i], _ctx);
      endPath(_ctx, style);
    }
  };
  */


  // Optimized to draw paths in same-style batches (faster Canvas drawing)
  _self.drawPathShapes = function(shapes, arcs, style, filter) {
    var styleIndex = {};
    var batchSize = 1500;
    var startPath = getPathStart(_ext, getScaledLineScale(_ext));
    var draw = getShapePencil(arcs, _ext);
    var key, item;
    var styler = style.styler || null;
    for (var i=0; i<shapes.length; i++) {
      if (filter && !filter(shapes[i])) continue;
      if (styler) styler(style, i);
      key = getStyleKey(style);
      if (key in styleIndex === false) {
        styleIndex[key] = {
          style: utils.defaults({}, style),
          shapes: []
        };
      }
      item = styleIndex[key];
      item.shapes.push(shapes[i]);
      // overlays should not be batched, so transparency of overlapping shapes
      // is drawn correctly
      if (item.shapes.length >= batchSize || style.overlay) {
        drawPaths(item.shapes, startPath, draw, item.style);
        item.shapes = [];
      }
    }
    Object.keys(styleIndex).forEach(function(key) {
      var item = styleIndex[key];
      drawPaths(item.shapes, startPath, draw, item.style);
    });
  };

  function drawPaths(shapes, begin, draw, style) {
    begin(_ctx, style);
    for (var i=0, n=shapes.length; i<n; i++) {
      draw(shapes[i], _ctx);
    }
    endPath(_ctx, style);
  }

  _self.drawSquareDots = function(shapes, style) {
    var t = getScaledTransform(_ext),
        scaleRatio = getDotScale2(shapes, _ext),
        size = Math.ceil((style.dotSize >= 0 ? style.dotSize : 3) * scaleRatio),
        styler = style.styler || null,
        xmax = _canvas.width + size,
        ymax = _canvas.height + size,
        color = style.dotColor || "black",
        shp, x, y, i, j, n, m,
        mx = t.mx,
        my = t.my,
        bx = t.bx,
        by = t.by;
    if (size === 0) return;
    if (size <= 4 && !styler) {
      // optimized drawing of many small same-colored dots
      _self.drawSquareDotsFaster(shapes, color, size, t);
      return;
    }
    _ctx.fillStyle = color;
    for (i=0, n=shapes.length; i<n; i++) {
      if (styler !== null) { // e.g. selected points
        styler(style, i);
        size = style.dotSize * scaleRatio;
        _ctx.fillStyle = style.dotColor;
      }
      shp = shapes[i];
      for (j=0, m=shp ? shp.length : 0; j<m; j++) {
        x = shp[j][0] * mx + bx;
        y = shp[j][1] * my + by;
        if (x > -size && y > -size && x < xmax && y < ymax) {
          drawSquare(x, y, size, _ctx);
        }
      }
    }
  };

  _self.drawSquareDotsFaster = function(shapes, color, size, t) {
    var w = _canvas.width,
        h = _canvas.height,
        rgba = _pixelColor(color),
        // imageData = _ctx.createImageData(w, h),
        imageData = _ctx.getImageData(0, 0, w, h),
        pixels = new Uint32Array(imageData.data.buffer),
        shp, x, y, i, j, n, m,
        mx = t.mx,
        my = t.my,
        bx = t.bx,
        by = t.by;
    for (i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      for (j=0, m=shp ? shp.length : 0; j<m; j++) {
        x = shp[j][0] * mx + bx;
        y = shp[j][1] * my + by;
        if (x >= 0 && y >= 0 && x <= w && y <= h) {
          drawSquareFaster(x, y, rgba, size, pixels, w, h);
        }
      }
    }
    _ctx.putImageData(imageData, 0, 0);
  };

  // color: 32-bit integer value containing rgba channel values
  // size: pixels on a side (assume integer)
  // x, y: non-integer center coordinates
  // pixels: Uint32Array of pixel colors
  // w, h: Size of canvas
  function drawSquareFaster(x, y, rgba, size, pixels, w, h) {
    var xmin = (x - size * 0.5) | 0;
    var ymin = (y - size * 0.5) | 0;
    var xmax = xmin + size - 1;
    var ymax = ymin + size - 1;
    var c, r;
    for (c = xmin; c <= xmax; c++) {
      if (c < 0 || c >= w) continue;
      for (r = ymin; r <= ymax && r >= 0 && r < h; r++) {
        pixels[r * w + c] = rgba;
      }
    }
  }

  // TODO: consider using drawPathShapes(), which draws paths in batches
  // for faster Canvas rendering. Downside: changes stacking order, which
  // is bad if circles are graduated.
  _self.drawPoints = function(shapes, style) {
    var t = getScaledTransform(_ext),
        scale = GUI.getPixelRatio() * (_ext.getSymbolScale() || 1),
        startPath = getPathStart(_ext),
        styler = style.styler || null,
        shp, p,
        mx = t.mx,
        my = t.my,
        bx = t.bx,
        by = t.by;

    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      if (styler) styler(style, i);
      startPath(_ctx, style);
      if (!shp || style.radius > 0 === false) continue;
      for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
        p = shp[j];
        drawCircle(p[0] * mx + bx, p[1] * my + by, style.radius * scale, _ctx);
      }
      endPath(_ctx, style);
    }
  };

  _self.drawArcs = function(arcs, style, filter) {
    var startPath = getPathStart(_ext, getLineScale(_ext)),
        t = getScaledTransform(_ext),
        ctx = _ctx,
        batch = 25, // render paths in batches of this size (an optimization)
        count = 0,
        n = arcs.size(),
        i, iter;

    startPath(ctx, style);
    for (i=0; i<n; i++) {
      if (filter && !filter(i)) continue;
      if (++count % batch === 0) {
        endPath(ctx, style);
        startPath(ctx, style);
      }
      iter = protectIterForDrawing(arcs.getArcIter(i), _ext);
      drawPath(iter, t, ctx, 0.6);
    }
    endPath(ctx, style);
  };

  function getStyleKey(style) {
    return (style.strokeWidth > 0 ? style.strokeColor + '~' + style.strokeWidth +
      '~' + (style.lineDash ? style.lineDash + '~' : '') : '') +
      (style.fillColor || '') + (style.opacity < 1 ? '~' + style.opacity : '');
  }

  return _self;
}

function getScaledLineScale(ext) {
  return ext.getSymbolScale() || getLineScale(ext);
}

// Vary line width according to zoom ratio.
// For performance and clarity don't start widening until zoomed quite far in.
function getLineScale(ext) {
  var mapScale = ext.scale(),
      s = 1;
  if (mapScale < 0.5) {
    s *= Math.pow(mapScale + 0.5, 0.35);
  } else if (mapScale > 100) {
    if (!internal.getStateVar('DEBUG')) // thin lines for debugging
      s *= Math.pow(mapScale - 99, 0.10);
  }
  return s;
}

function getDotScale(ext) {
  return Math.pow(getLineScale(ext), 0.7);
}

function countPoints(shapes, test, max) {
  var count = 0;
  var i, n, j, m, shp;
  max = max || Infinity;
  for (i=0, n=shapes.length; i<n && count<=max; i++) {
    shp = shapes[i];
    for (j=0, m=shp ? shp.length : 0; j<m; j++) {
      if (!test || test(shp[j])) {
        count++;
      }
    }
  }
  return count;
}


function getDotScale2(shapes, ext) {
  var pixRatio = GUI.getPixelRatio();
  var scale = ext.scale();
  var side = Math.min(ext.width(), ext.height());
  var bounds = ext.getBounds();
  var topTier = 50000;
  var test, n, k, j;
  if (scale >= 2) {
    test = function(p) {
      return bounds.containsPoint(p[0], p[1]);
    };
  }
  n = countPoints(shapes, test, topTier + 2); // short-circuit point counting above top threshold
  k = n >= topTier && 0.25 || n > 10000 && 0.45 || n > 2500 && 0.65 || n > 200 && 0.85 || 1;
  j = side < 200 && 0.5 || side < 400 && 0.75 || 1;
  return getDotScale(ext) * k * j * pixRatio;
}

function getScaledTransform(ext) {
  var t = ext.getTransform(GUI.getPixelRatio());
  // A recent Chrome update (v80?) seems to have introduced a performance
  // regression causing slow object property access.
  // the effect is intermittent and pretty mysterious.
  return {
    mx: t.mx,
    my: t.my,
    bx: t.bx,
    by: t.by
  };
}

function drawCircle(x, y, radius, ctx) {
  if (radius > 0) {
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2, true);
  }
}

function drawSquare(x, y, size, ctx) {
  var offs = size / 2;
  if (size > 0) {
    x = Math.round(x - offs);
    y = Math.round(y - offs);
    size = Math.ceil(size);
    ctx.fillRect(x, y, size, size);
  }
}

function drawPath(vec, t, ctx, minLen) {
  // copy to local variables because of odd performance regression in Chrome 80
  var mx = t.mx,
      my = t.my,
      bx = t.bx,
      by = t.by;
  var x, y, xp, yp;
  if (!vec.hasNext()) return;
  minLen = utils.isNonNegNumber(minLen) ? minLen : 0.4;
  x = xp = vec.x * mx + bx;
  y = yp = vec.y * my + by;
  ctx.moveTo(x, y);
  while (vec.hasNext()) {
    x = vec.x * mx + bx;
    y = vec.y * my + by;
    if (Math.abs(x - xp) > minLen || Math.abs(y - yp) > minLen) {
      ctx.lineTo(x, y);
      xp = x;
      yp = y;
    }
  }
}

function getShapePencil(arcs, ext) {
  var t = getScaledTransform(ext);
  var iter = new internal.ShapeIter(arcs);
  return function(shp, ctx) {
    for (var i=0, n=shp ? shp.length : 0; i<n; i++) {
      iter.init(shp[i]);
      // 0.2 trades visible seams for performance
      drawPath(protectIterForDrawing(iter, ext), t, ctx, 0.2);
    }
  };
}

function protectIterForDrawing(iter, ext) {
  var bounds, k;
  if (ext.scale() > 100) {
    // clip to rectangle when zoomed far in (canvas stops drawing shapes when
    // the coordinates become too large)
    // scale the bbox to avoid large fp errors
    // (affects projected datasets when zoomed very far in)
    // k too large, long segments won't render; too small, segments will jump around
    // TODO: consider converting to pixels before clipping
    k = Math.pow(ext.scale(), 0.45);
    bounds = ext.getBounds(k);
    iter = new internal.PointIter(internal.clipIterByBounds(iter, bounds));
  }
  return iter;
}

function getPathStart(ext, lineScale) {
  var pixRatio = GUI.getPixelRatio();
  if (!lineScale) lineScale = 1;
  return function(ctx, style) {
    var strokeWidth;
    ctx.beginPath();
    if (style.opacity >= 0) {
      ctx.globalAlpha = style.opacity;
    }
    if (style.strokeWidth > 0) {
      strokeWidth = style.strokeWidth;
      if (pixRatio > 1) {
        // bump up thin lines on retina, but not to more than 1px (too slow)
        strokeWidth = strokeWidth < 1 ? 1 : strokeWidth * pixRatio;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = strokeWidth * lineScale;
      ctx.strokeStyle = style.strokeColor;
      if (style.lineDash){
        ctx.lineCap = 'butt';
        ctx.setLineDash(style.lineDash.split(' '));
      }
    }
    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
    }
  };
}

function endPath(ctx, style) {
  if (style.fillColor) ctx.fill();
  if (style.strokeWidth > 0) {
    ctx.stroke();
    if (style.lineDash) {
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
    }
  }
  if (style.opacity >= 0) ctx.globalAlpha = 1;
  ctx.closePath();
}
