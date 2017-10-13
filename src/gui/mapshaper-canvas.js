/* @requires mapshaper-gui-lib */

gui.getPixelRatio = function() {
  var deviceRatio = window.devicePixelRatio || window.webkitDevicePixelRatio || 1;
  return deviceRatio > 1 ? 2 : 1;
};

function DisplayCanvas() {
  var _self = El('canvas'),
      _canvas = _self.node(),
      _ctx = _canvas.getContext('2d'),
      _ext;

  _self.prep = function(extent) {
    var w = extent.width(),
        h = extent.height(),
        pixRatio = gui.getPixelRatio();
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
  _self.drawPathShapes = function(shapes, arcs, style) {
    var styleIndex = {};
    var batchSize = 1500;
    var startPath = getPathStart(_ext, getLineScale(_ext));
    var draw = getShapePencil(arcs, _ext);
    var key, item;
    var styler = style.styler || null;
    for (var i=0; i<shapes.length; i++) {
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
        size = (style.dotSize || 3) * scaleRatio,
        styler = style.styler || null,
        xmax = _canvas.width + size,
        ymax = _canvas.height + size,
        shp, x, y, i, j, n, m;
    _ctx.fillStyle = style.dotColor || "black";
    for (i=0, n=shapes.length; i<n; i++) {
      if (styler !== null) { // e.g. selected points
        styler(style, i);
        size = style.dotSize * scaleRatio;
        _ctx.fillStyle = style.dotColor;
      }
      shp = shapes[i];
      for (j=0, m=shp ? shp.length : 0; j<m; j++) {
        x = shp[j][0] * t.mx + t.bx;
        y = shp[j][1] * t.my + t.by;
        if (x > -size && y > -size && x < xmax && y < ymax) {
          drawSquare(x, y, size, _ctx);
        }
      }
    }
  };

  // TODO: consider using drawPathShapes(), which draws paths in batches
  // for faster Canvas rendering. Downside: changes stacking order, which
  // is bad if circles are graduated.
  _self.drawPoints = function(shapes, style) {
    var t = getScaledTransform(_ext),
        pixRatio = gui.getPixelRatio(),
        startPath = getPathStart(_ext),
        styler = style.styler || null,
        shp, p;

    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      if (styler) styler(style, i);
      startPath(_ctx, style);
      if (!shp || style.radius > 0 === false) continue;
      for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
        p = shp[j];
        drawCircle(p[0] * t.mx + t.bx, p[1] * t.my + t.by, style.radius * pixRatio, _ctx);
      }
      endPath(_ctx, style);
    }
  };

  _self.drawArcs = function(arcs, style, filter) {
    var startPath = getPathStart(_ext, getLineScale(_ext)),
        t = getScaledTransform(_ext),
        clipping = _ext.scale() > 2000,
        ctx = _ctx,
        n = 25, // render paths in batches of this size (an optimization)
        count = 0;
    startPath(ctx, style);
    for (i=0, n=arcs.size(); i<n; i++) {
      if (filter && !filter(i)) continue;
      if (++count % n === 0) {
        endPath(ctx, style);
        startPath(ctx, style);
      }
      if (clipping) {
        drawPathSafe(arcs.getArcIter(i), t, ctx, _ext.getBounds());
      } else {
        drawPath(arcs.getArcIter(i), t, ctx, 0.6);
      }
    }
    endPath(ctx, style);
  };

  function getStyleKey(style) {
    return (style.strokeWidth > 0 ? style.strokeColor + '~' + style.strokeWidth +
      '~' : '') + (style.fillColor || '') + (style.opacity < 1 ? '~' + style.opacity : '');
  }

  return _self;
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

function getDotScale2(shapes, ext) {
  var pixRatio = gui.getPixelRatio();
  var scale = ext.scale();
  var side = Math.min(ext.width(), ext.height());
  var bounds = ext.getBounds();
  var test, n, k, j;
  if (scale >= 2) {
    test = function(p) {
      return bounds.containsPoint(p[0], p[1]);
    };
  }
  n = internal.countPoints2(shapes, test);
  k = n > 100000 && 0.25 || n > 10000 && 0.45 || n > 2500 && 0.65 || n > 200 && 0.85 || 1;
  j = side < 200 && 0.5 || side < 400 && 0.75 || 1;
  return getDotScale(ext) * k * j * pixRatio;
}

function getScaledTransform(ext) {
  return ext.getTransform(gui.getPixelRatio());
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

//  7 8 9
//  4 5 6
//  1 2 3
function getPointQuadrant(p, bounds) {
  var x = p[0], y = p[1];
  var col = x < bounds.xmin && 1 || x <= bounds.xmax && 2 || x > bounds.xmax && 3 || 0;
  var row = y < bounds.ymin && 1 || y <= bounds.ymax && 2 || y > bounds.ymax && 3 || 0;
  if (col === 0 || row === 0) return 0;
  return col + (row - 1) * 3;
}

function getSafeSegment(a, b, bounds) {
  var qa = getPointQuadrant(a, bounds),
      qb = getPointQuadrant(b, bounds),
      hits, i, j, p, xx, yy, seg;
  if (qa == 5 && qb == 5) {
    return [a, b]; // both points are inside box -- no clip
  } else if (qa == qb) {
    return null; // both points are in the same outer quadrant -- safely skip
  }
  hits = [];
  xx = [bounds.xmin, bounds.xmin, bounds.xmax, bounds.xmax];
  yy = [bounds.ymin, bounds.ymax, bounds.ymax, bounds.ymin];
  for (i=0; i<4; i++) {
    j = (i + 1) % 4;
    p = geom.segmentIntersection(a[0], a[1], b[0], b[1], xx[i], yy[i],
        xx[j], yy[j]);
    if (p) hits.push(p);
  }
  if (hits.length > 0) {
    if (qa == 5) {
      seg = [a, hits[0]];
    } else if (qb == 5) {
      seg = [b, hits[0]];
    } else if (hits.length == 2) {
      seg = hits;
    }
  }
  // TODO: handle edge cases (e.g. collinear hits, corner hits)
  return seg;
}

// Clip segments if they might be too long for the Canvas renderer to display
function drawPathSafe(vec, t, ctx, bounds) {
  var a, b, ab;
  bounds = bounds.clone().transform(t);
  while (vec.hasNext()) {
    b = t.transform(vec.x, vec.y);
    if (a) {
      ab = getSafeSegment(a, b, bounds);
    }
    if (ab) {
      ctx.moveTo(ab[0][0], ab[0][1]);
      ctx.lineTo(ab[1][0], ab[1][1]);
    }
    a = b;
  }
}

function drawPath(vec, t, ctx, minLen) {
  var x, y, xp, yp;
  if (!vec.hasNext()) return;
  minLen = utils.isNonNegNumber(minLen) ? minLen : 0.4;
  x = xp = vec.x * t.mx + t.bx;
  y = yp = vec.y * t.my + t.by;
  ctx.moveTo(x, y);
  while (vec.hasNext()) {
    x = vec.x * t.mx + t.bx;
    y = vec.y * t.my + t.by;
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
      drawPath(iter, t, ctx, 0.2);
    }
  };
}

function getPathStart(ext, lineScale) {
  var pixRatio = gui.getPixelRatio();
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
    }
    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
    }
  };
}

function endPath(ctx, style) {
  if (style.fillColor) ctx.fill();
  if (style.strokeWidth > 0) ctx.stroke();
  if (style.opacity >= 0) ctx.globalAlpha = 1;
  ctx.closePath();
}
