/* @requires mapshaper-gui-lib */

gui.getPixelRatio = function() {
  var deviceRatio = window.devicePixelRatio || window.webkitDevicePixelRatio || 1;
  return deviceRatio > 1 ? 2 : 1;
};

MapShaper.drawPoints = function(paths, style, canvas) {
  var color = style.dotColor || "rgba(255, 50, 50, 0.5)",
      size = (style.dotSize || 3) * gui.getPixelRatio(),
      drawPoint = style.roundDot ? drawCircle : drawSquare,
      k = gui.getPixelRatio(),
      ctx = canvas.getContext('2d');
  paths.forEach(function(vec) {
    while (vec.hasNext()) {
      drawPoint(vec.x * k, vec.y * k, size, color, ctx);
    }
  });
};

MapShaper.drawPaths = function(paths, style, canvas) {
  var stroked = style.strokeColor && style.strokeWidth !== 0,
      filled = !!style.fillColor,
      pixRatio = gui.getPixelRatio(),
      ctx = canvas.getContext('2d'),
      strokeColor;

  if (stroked) {
    ctx.lineWidth = style.strokeWidth || 1; // don't adjust width for retina -- too slow
    if (utils.isFunction(style.strokeColor)) {
      strokeColor = style.strokeColor;
    } else {
      ctx.strokeStyle = style.strokeColor;
    }
    //ctx.lineJoin = 'round';
  }
  if (filled) {
    ctx.fillStyle = style.fillColor;
  }

  paths.forEach(function(vec, i) {
    var minLen = 0.6,
        k = pixRatio,
        x, y, xp, yp;
    if (!vec.hasNext()) return;
    ctx.beginPath();
    if (strokeColor) ctx.strokeStyle = strokeColor(i);
    x = xp = vec.x * k;
    y = yp = vec.y * k;
    ctx.moveTo(x, y);
    while (vec.hasNext()) {
      x = vec.x * k;
      y = vec.y * k;
      if (Math.abs(x - xp) > minLen || Math.abs(y - yp) > minLen) {
        ctx.lineTo(x, y);
        xp = x;
        yp = y;
      }
    }
    if (x != xp || y != yp) {
      ctx.lineTo(x, y);
    }
    if (filled) ctx.fill();
    if (stroked) ctx.stroke();
  });
};

function drawCircle(x, y, size, col, ctx) {
  if (size > 0) {
    ctx.beginPath();
    ctx.fillStyle = col;
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2, true);
    ctx.fill();
  }
}

function drawSquare(x, y, size, col, ctx) {
  if (size > 0) {
    var offs = size / 2;
    x = Math.round(x - offs);
    y = Math.round(y - offs);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, size, size);
  }
}
