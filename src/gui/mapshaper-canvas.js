/* @requires mapshaper-common */

MapShaper.drawShapes = function(shapes, style, ctx) {
  if (style.dotColor) {
    this.drawPoints(shapes, style, ctx);
  } else {
    this.drawPaths(shapes, style, ctx);
  }
};

MapShaper.drawPoints = function(paths, style, ctx) {
  var midCol = style.dotColor || "rgba(255, 50, 50, 0.5)",
      endCol = style.nodeColor || midCol,
      midSize = style.dotSize || 3,
      endSize = style.nodeSize >= 0 ? style.nodeSize : midSize,
      drawPoint = style.squareDot ? drawSquare : drawCircle,
      prevX, prevY;

  paths.forEach(function(vec) {
    if (vec.hasNext()) {
      drawPoint(vec.x, vec.y, endSize, endCol, ctx);
    }
    if (vec.hasNext()) {
      prevX = vec.x;
      prevY = vec.y;
      while (vec.hasNext()) {
        drawPoint(prevX, prevY, midSize, midCol, ctx);
        prevX = vec.x;
        prevY = vec.y;
      }
      drawPoint(prevX, prevY, endSize, endCol, ctx);
    }
  });
};

MapShaper.drawPaths = function(paths, style, ctx) {
  var stroked = style.strokeColor && style.strokeWidth !== 0,
      filled = !!style.fillColor;

  if (stroked) {
    ctx.lineWidth = style.strokeWidth || 1;
    ctx.strokeStyle = style.strokeColor;
    //ctx.lineJoin = 'round';
  }
  if (filled) {
    ctx.fillStyle = style.fillColor;
  }

  paths.forEach(function(vec) {
    if (vec.hasNext()) {
      ctx.beginPath();
      ctx.moveTo(vec.x, vec.y);
      while (vec.hasNext()) {
        ctx.lineTo(vec.x, vec.y);
      }
      if (filled) ctx.fill();
      if (stroked) ctx.stroke();
    }
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


function CanvasLayer() {
  var canvas = El('canvas').css('position:absolute;').node(),
      ctx = canvas.getContext('2d');

  this.getContext = function() {
    return ctx;
  };

  this.prepare = function(w, h) {
    if (w != canvas.width || h != canvas.height) {
      this.resize(w, h);
    } else {
      this.clear();
    }
  };

  this.resize = function(w, h) {
    canvas.width = w;
    canvas.height = h;
  };

  this.clear = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  this.getElement = function() {
    return El(canvas);
  };
}
