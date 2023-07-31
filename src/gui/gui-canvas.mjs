import { internal, utils, Bounds } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { getCanvasFillPattern, getCanvasFillEffect } from './gui-canvas-patterns';

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
    canv.drawStyledPaths(layer.shapes, arcs, style, filter);
    if (style.vertices) {
      canv.drawVertices(layer.shapes, arcs, style, filter);
    }
  }
  canv.clearStyles();
}


// Return a function for testing if an arc should be drawn in the current view
function getArcFilter(arcs, ext, usedFlag, arcCounts) {
  var MIN_PATH_LEN = 0.1;
  var minPathLen = ext.getPixelSize() * MIN_PATH_LEN, // * 0.5
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
  var ctx = canv.getContext('2d', {willReadFrequently: true});
  return function(col) {
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
      // TODO: compare performance of willReadFrequently setting
      // _ctx = _canvas.getContext('2d', {willReadFrequently: true}),
      _ctx = _canvas.getContext('2d'),
      _pixelColor = getPixelColorFunction(),
      _ext;

  _self.clearStyles = function() {
    _ctx.fillStyle = null;
    _ctx.strokeStyle = null;
  };

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
  _self.drawStyledPaths = function(shapes, arcs, style) {
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

  _self.drawVertices = function(shapes, arcs, style, filter) {
    var iter = new internal.ShapeIter(arcs);
    var t = getScaledTransform(_ext);
    var bounds = _ext.getBounds();
    var radius = (style.strokeWidth > 2 ? style.strokeWidth * 0.9 : 2) * GUI.getPixelRatio() * getScaledLineScale(_ext);
    var color = style.strokeColor || 'black';

    var i, j, p;
    _ctx.beginPath();
    _ctx.fillStyle = color;
    for (i=0; i<shapes.length; i++) {
      var shp = shapes[i];
      if (!shp || filter && !filter(shp)) continue;
      for (j=0; j<shp.length; j++) {
        iter.init(shp[j]);
        while (iter.hasNext()) {
          if (!bounds.containsPoint(iter.x, iter.y)) continue;
          drawCircle(iter.x * t.mx + t.bx, iter.y * t.my + t.by, radius, _ctx);
        }
      }
    }
    _ctx.fill();
    _ctx.closePath();

    if (style.vertex_overlay) {
      _ctx.beginPath();
      _ctx.fillStyle = style.vertex_overlay_color || 'black';
      p = style.vertex_overlay;
      drawCircle(p[0] * t.mx + t.bx, p[1] * t.my + t.by, radius * 1.6, _ctx);
      _ctx.fill();
      _ctx.closePath();
    }
  };

  // Optimized to draw paths in same-style batches (faster Canvas drawing)
  _self.drawStyledPaths = function(shapes, arcs, style, filter) {
    var styleIndex = {};
    var batchSize = 1500;
    var startPath = getPathStart(_ext, getScaledLineScale(_ext));
    var draw = getShapePencil(arcs, _ext);
    var key, item, shp;
    var styler = style.styler || null;
    for (var i=0; i<shapes.length; i++) {
      shp = shapes[i];
      if (!shp || filter && !filter(shp)) continue;
      if (styler) styler(style, i);
      if (style.overlay || style.opacity < 1 || style.fillOpacity < 1 || style.strokeOpacity < 1 || style.fillEffect) {
        // don't batch shapes with opacity, in case they overlap
        drawPaths([shp], startPath, draw, style);
        continue;
      }
      key = getStyleKey(style);
      if (key in styleIndex === false) {
        styleIndex[key] = {
          style: utils.defaults({}, style),
          shapes: []
        };
      }
      item = styleIndex[key];
      item.shapes.push(shp);
      if (item.shapes.length >= batchSize) {
        drawPaths(item.shapes, startPath, draw, item.style);
        item.shapes = [];
      }
    }
    Object.keys(styleIndex).forEach(function(key) {
      var item = styleIndex[key];
      drawPaths(item.shapes, startPath, draw, item.style);
    });
  };

  function drawPaths(shapes, beginPath, drawShape, style) {
    beginPath(_ctx, style);
    for (var i=0, n=shapes.length; i<n; i++) {
      drawShape(shapes[i], _ctx, style);
    }
    endPath(_ctx, style);
  }

  _self.drawSquareDots = function(shapes, style) {
    var t = getScaledTransform(_ext),
        scaleRatio = getDotScale(_ext),
        size = Math.round((style.dotSize || 1) * scaleRatio),
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
    if (size <= 6 && !styler) {
      // optimized drawing of many small same-colored dots
      _self.drawSquareDotsFaster(shapes, color, size, t);
      return;
    }
    _ctx.fillStyle = color;
    for (i=0, n=shapes.length; i<n; i++) {
      if (styler !== null) { // e.g. selected points
        styler(style, i);
        size = style.dotSize * scaleRatio;
        if (style.dotColor != color) {
          color = style.dotColor;
          _ctx.fillStyle = color;
        }
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
    var xmin = x < 0 ? 0 : (x - size * 0.5) | 0;
    var ymin = y < 0 ? 0 : (y - size * 0.5) | 0;
    var xmax = x >= w-1 ? w-1 : xmin + size - 1;
    var ymax = y >= h-1 ? h-1 : ymin + size - 1;
    for (var r = ymin; r <= ymax; r++) {
      for (var c = xmin; c <= xmax; c++) {
        pixels[r * w + c] = rgba;
      }
    }
  }

  // TODO: consider using drawStyledPaths(), which draws paths in batches
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
      // drawPath(iter, t, ctx, 0.1);
      drawPath2(iter, t, ctx, roundToHalfPix);
    }
    endPath(ctx, style);
  };

  function getStyleKey(style) {
    return (style.strokeWidth > 0 ? style.strokeColor + '~' + style.strokeWidth +
      '~' + (style.lineDash ? style.lineDash + '~' : '') : '') +
      (style.fillColor || '') +
      // styles with <1 opacity are no longer batch-rendered
      // (style.strokeOpacity >= 0 ? style.strokeOpacity + '~' : '') : '') +
      // (style.fillOpacity ? '~' + style.fillOpacity : '') +
      // (style.opacity < 1 ? '~' + style.opacity : '') +
      (style.fillPattern ? '~' + style.fillPattern : '');
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
    s *= Math.pow(mapScale - 99, 0.10);
  }
  return s;
}

function getDotScale(ext) {
  var smallSide = Math.min(ext.width(), ext.height());
  var mapScale = ext.scale();
  // reduce size on smaller screens
  var j = smallSide < 200 && 0.5 || smallSide < 400 && 0.75 || 1;
  // grow dots as map zooms in
  var k = 1;
  if (mapScale < 0.5) {
    k = Math.pow(mapScale + 0.5, 0.35);
  } else if (mapScale > 1) {
    // scale faster at first, so small dots in large datasets
    // become easily visible and clickable after zooming in a bit
    k *= Math.pow(Math.min(mapScale, 10), 0.3);
    k *= Math.pow(mapScale, 0.1);
  }
  // grow pixels more slowly on retina displays (to reduce number of pixels to
  // draw for large point datasets when slightly zoomed in)
  var l = Math.pow(GUI.getPixelRatio(), 0.8);
  return j * k * l;
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

// Draw a path, but skip vertices within a given pixel threshold from the prev. vertex
// This optimization introduces visible gaps between filled polygons unless the
// threshold is much smaller than a pixel, so switching to drawPath2.
function drawPath(vec, t, ctx, minLen) {
  // copy to local variables because of odd performance regression in Chrome 80
  var mx = t.mx,
      my = t.my,
      bx = t.bx,
      by = t.by;
  var x, y, xp, yp;
  if (!vec.hasNext()) return;
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


// Draw a path, optimized by snapping pixel coordinates and skipping
// duplicate coords.
function drawPath2(vec, t, ctx, round) {
  // copy to local variables because of odd performance regression in Chrome 80
  var mx = t.mx,
      my = t.my,
      bx = t.bx,
      by = t.by;
  var x, y, xp, yp;
  var count = 0;
  if (!vec.hasNext()) return;
  x = round(vec.x * mx + bx);
  y = round(vec.y * my + by);
  ctx.moveTo(x, y);
  while (vec.hasNext()) {
    xp = x;
    yp = y;
    x = round(vec.x * mx + bx);
    y = round(vec.y * my + by);
    if (x != xp || y != yp) {
      ctx.lineTo(x, y);
      count++;
    }
  }
  if (count === 0) {
    // draw a tiny line if all coords round to the same location,
    // so tiny shapes with strokes will consistently be drawn as dots,
    ctx.lineTo(x + 0.1, y);
  }
}

function roundToPix(x) {
  return x + 0.5 | 0;
}

function roundToHalfPix(x) {
  return (x * 2 | 0) / 2;
}

function getShapePencil(arcs, ext) {
  var t = getScaledTransform(ext);
  var iter = new internal.ShapeIter(arcs);
  return function(shp, ctx, style) {
    if (style.fillEffect) {
      ctx.fillStyle = getCanvasFillEffect(ctx, shp, arcs, ext, style);
    }
    for (var i=0, n=shp ? shp.length : 0; i<n; i++) {
      iter.init(shp[i]);
      // 0.2 trades visible seams for performance
      // drawPath(protectIterForDrawing(iter, ext), t, ctx, 0.2);
      drawPath2(protectIterForDrawing(iter, ext), t, ctx, roundToPix);
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
    // if (style.opacity >= 0) {
    //   ctx.globalAlpha = style.opacity;
    // }
    if (style.strokeWidth > 0) {
      strokeWidth = style.strokeWidth;
      if (pixRatio > 1) {
        // bump up thin lines on retina, but not to more than 1px
        // (tests on Chrome showed much faster rendering of 1px lines)
        strokeWidth = strokeWidth < 1 ? 1 : strokeWidth * pixRatio;
      }
      ctx.lineCap = style.lineCap || 'round';
      ctx.lineJoin = style.lineJoin || 'round';
      ctx.lineWidth = strokeWidth * lineScale;
      ctx.strokeStyle = style.strokeColor;
      if (style.lineDash){
        ctx.lineCap = 'butt';
        ctx.setLineDash(style.lineDash.split(' '));
      }
      if (style.miterLimit) {
        ctx.miterLimit = style.miterLimit;
      }
    }

    if (style.fillPattern) {
      ctx.fillStyle = getCanvasFillPattern(style);
    } else if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
    }
  };
}

function endPath(ctx, style) {
  var fo = style.opacity >= 0 ? style.opacity : 1,
      so = fo;
  if (style.strokeOpacity >= 0) so *= style.strokeOpacity;
  if (style.fillColor || style.fillPattern || style.fillEffect) {
    if (style.fillOpacity >= 0) {
      fo *= style.fillOpacity;
    } else if (style.fillEffect && style.opacity >= 0 === false) {
      fo = 0.35; // kludge: default opacity of sphere effect
    }
    ctx.globalAlpha = fo;
    ctx.fill();
  }
  if (style.strokeWidth > 0) {
    ctx.globalAlpha = so;
    ctx.stroke();
    if (style.lineDash) {
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
  ctx.closePath();
}
