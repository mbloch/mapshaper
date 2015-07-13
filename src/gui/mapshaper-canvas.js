/* @requires mapshaper-common */

MapShaper.drawPoints = function(paths, style, canvas) {
  var color = style.dotColor || "rgba(255, 50, 50, 0.5)",
      size = style.dotSize || 3,
      drawPoint = style.roundDot ? drawCircle : drawSquare,
      ctx = canvas.getContext('2d');
  paths.forEach(function(vec) {
    while (vec.hasNext()) {
      drawPoint(vec.x, vec.y, size, color, ctx);
    }
  });
};

MapShaper.drawPaths = function(paths, style, canvas) {
  var stroked = style.strokeColor && style.strokeWidth !== 0,
      filled = !!style.fillColor,
      ctx = canvas.getContext('2d'),
      strokeColor;

  if (stroked) {
    ctx.lineWidth = style.strokeWidth || 1;
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
        x, y, xp, yp;
    if (!vec.hasNext()) return;
    ctx.beginPath();
    if (strokeColor) ctx.strokeStyle = strokeColor(i);
    x = xp = vec.x;
    y = yp = vec.y;
    ctx.moveTo(x, y);
    while (vec.hasNext()) {
      x = vec.x;
      y = vec.y;
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
