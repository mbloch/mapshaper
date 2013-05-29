

function ShapeRenderer() {
  this.drawShapes = function(shapes, style, tr, ctx) {
    var mx = tr.mx, my = tr.my, bx = tr.bx, by = tr.by;
    var shp, vec, x, y, nextX, nextY, drawPoint;
    var stroked = !!(style.strokeWidth && style.strokeColor),
        filled = !!style.fillColor;

    var minSeg = 0.6;
    var minShp = 1;

    if (stroked) {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      //ctx.lineJoin = 'round';
    }
    if (filled) {
      ctx.fillStyle = style.fillColor;
    }
    if (!stroked && !filled) {
      trace("#drawLine() Line is missing stroke and fill; style:", style);
      return;
    }
    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      //if (shp.bounds.width() * mx < minShp && shp.bounds.height() * mx < minShp) continue;
      for (var j=0; j<shp.partCount; j++) {
        vec = shp.getShapeIter(j);
        if (vec.hasNext()) {
          ctx.beginPath();
          drawPoint = true;
          x = vec.x * mx + bx;
          y = vec.y * my + by;
          ctx.moveTo(x, y);
          while (vec.hasNext()) {
            nextX = vec.x * mx + bx;
            nextY = vec.y * my + by;
            drawPoint = Math.abs(nextX - x) > minSeg || Math.abs(nextY - y) > minSeg;
            if (drawPoint) {
              x = nextX, y = nextY;
              ctx.lineTo(x, y);
            }
            /*
            x = vec.x * mx + bx;
            y = vec.y * my + by;
            ctx.lineTo(x, y);     */

          }

          if (!drawPoint) {
            ctx.lineTo(nextX, nextY);
          }

          if (filled) ctx.fill();
          if (stroked) ctx.stroke();
        }
      }
    }
    //trace("tot:", tot, "skipped:", skipped)
  };
}


function CanvasLayer() {

  var canvas = El('canvas').css('position:absolute;').node(),
      ctx = canvas.getContext('2d');

  this.getContext = function() {
    return ctx;
  };

  this.prepare = function(w, h) {
    if (w != canvas.width || h != canvas.height) this.resize(w, h);
    this.clear();
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
  }
}


CanvasLayer.prototype.clear = function() {
  if (!this.__updateCanvasSize()) {
    var c = this._canvas;
    var ctx = c.getContext('2d');

    // Note: the commented-out lines would preserve a transform on the canvas.
    // ctx.save();
    // ctx.setTransform(1, 0, 0, 1, 0, 0);// Use the identity matrix while clearing the canvas
    ctx.clearRect(0, 0, c.width, c.height);
    // ctx.restore();
  }
};