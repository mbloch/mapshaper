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

  _self.drawPathShapes = function(shapes, arcs, style) {
    var start = getPathStart(style, _ext),
        draw = getShapePencil(arcs, _ext),
        end = getPathEnd(style);
    for (var i=0, n=shapes.length; i<n; i++) {
      start(_ctx);
      draw(shapes[i], _ctx);
      end(_ctx);
    }
  };

  _self.drawPoints = function(shapes, style) {
    var t = getScaledTransform(_ext),
        size = (style.dotSize || 3) * gui.getPixelRatio(),
        drawPoint = style.roundDot ? drawCircle : drawSquare,
        shp, p;

    // TODO: don't try to draw offscreen points
    _ctx.fillStyle = style.dotColor || "black";
    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
        p = shp[j];
        drawPoint(p[0] * t.mx + t.bx, p[1] * t.my + t.by, size, _ctx);
      }
    }
  };

  _self.drawArcs = function(arcs, flags, style) {
    var darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
        lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
    setArcVisibility(flags, arcs);
    drawFlaggedArcs(2, flags, lightStyle, arcs);
    drawFlaggedArcs(3, flags, darkStyle, arcs);
  };

  function setArcVisibility(flags, arcs) {
    var minPathLen = 0.5 * _ext.getPixelSize(),
        geoBounds = _ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds()),
        visible;
    // don't continue dropping paths if user zooms out farther than full extent
    if (_ext.scale() < 1) minPathLen *= _ext.scale();
    for (var i=0, n=arcs.size(); i<n; i++) {
      visible = !arcs.arcIsSmaller(i, minPathLen) && (allIn ||
          arcs.arcIntersectsBBox(i, geoBBox));
      // mark visible arcs by setting second flag bit to 1
      flags[i] = (flags[i] & 1) | (visible ? 2 : 0);
    }
  }

  function drawFlaggedArcs(flag, flags, style, arcs) {
    var start = getPathStart(style, _ext),
        end = getPathEnd(style),
        t = getScaledTransform(_ext),
        ctx = _ctx,
        n = 25, // render paths in batches of this size (an optimization)
        count = 0;
    start(ctx);
    for (i=0, n=arcs.size(); i<n; i++) {
      if (flags[i] != flag) continue;
      if (++count % n === 0) {
        end(ctx);
        start(ctx);
      }
      drawPath(arcs.getArcIter(i), t, ctx);
    }
    end(ctx);
  }

  return _self;
}



function getScaledTransform(ext) {
  return ext.getTransform(gui.getPixelRatio());
}

function drawCircle(x, y, size, ctx) {
  if (size > 0) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2, true);
    ctx.fill();
  }
}

function drawSquare(x, y, size, ctx) {
  if (size > 0) {
    var offs = size / 2;
    x = Math.round(x - offs);
    y = Math.round(y - offs);
    ctx.fillRect(x, y, size, size);
  }
}

function drawPath(vec, t, ctx) {
  var minLen = gui.getPixelRatio() > 1 ? 1 : 0.6,
      x, y, xp, yp;
  if (!vec.hasNext()) return;
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
  if (x != xp || y != yp) {
    ctx.lineTo(x, y);
  }
}

function getShapePencil(arcs, ext) {
  var t = getScaledTransform(ext);
  return function(shp, ctx) {
    var iter = new MapShaper.ShapeIter(arcs);
    if (!shp) return;
    for (var i=0; i<shp.length; i++) {
      iter.init(shp[i]);
      drawPath(iter, t, ctx);
    }
  };
}

function getPathStart(style, ext) {
  var stroked = style.strokeColor && style.strokeWidth !== 0,
      filled = !!style.fillColor,
      mapScale = ext.scale(),
      lineWidth, strokeColor;
  if (stroked) {
    lineWidth = style.strokeWidth || 1;
     // bump up thin lines on retina, but not to more than 1px (too slow)
    if (gui.getPixelRatio() > 1 && lineWidth < 1) {
      lineWidth = 1;
    }
    // vary line width according to zoom ratio; for performance and clarity,
    // don't start thickening lines until zoomed quite far in.
    if (mapScale < 1) {
      lineWidth *= Math.pow(mapScale, 0.6);
    } else if (mapScale > 40) {
      lineWidth *= Math.pow(mapScale - 39, 0.2);
    }
    strokeColor = style.strokeColor;
  }

  return function(ctx) {
    ctx.beginPath();
    if (stroked) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
    }
    if (filled) {
      ctx.fillStyle = style.fillColor;
    }
  };
}

function getPathEnd(style) {
  var stroked = style.strokeColor && style.strokeWidth !== 0,
      filled = !!style.fillColor;
  return function(ctx) {
    if (filled) ctx.fill();
    if (stroked) ctx.stroke();
    ctx.closePath();
  };
}
