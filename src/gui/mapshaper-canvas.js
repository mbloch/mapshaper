/* @requires mapshaper-gui-lib */

gui.getPixelRatio = function() {
  var deviceRatio = window.devicePixelRatio || window.webkitDevicePixelRatio || 1;
  return deviceRatio > 1 ? 2 : 1;
};

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
    var iter = new ShapeIter(arcs);
    if (!shp) return;
    for (var i=0; i<shp.length; i++) {
      iter.init(shp[i]);
      drawPath(iter, t, ctx);
    }
  };
}

function getPathStart(style) {
  var stroked = style.strokeColor && style.strokeWidth !== 0,
      filled = !!style.fillColor,
      lineWidth, strokeColor;
  if (stroked) {
    lineWidth = style.strokeWidth || 1;
    if (gui.getPixelRatio() > 1 && lineWidth < 1) {
      lineWidth = 1; // bump up thin lines on retina, but not more than 1 (too slow)
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
  };
}
