

function ShapeRenderer() {

  this.drawShapes = function(shapes, style, tr, ctx) {
    var stroked = !!(style.strokeWidth && style.strokeColor),
        filled = !!style.fillColor;

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

    // TODO: consider moving filtering and transformation inside vertex iterator...
    //
    shapes.forEach(function(vec) {
      var mx = tr.mx, my = tr.my, bx = tr.bx, by = tr.by;
      var x, y, nextX, nextY, drawPoint;
      var minSeg = 0.6;

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
        }

        if (!drawPoint) {
          ctx.lineTo(nextX, nextY);
        }

        if (filled) ctx.fill();
        if (stroked) ctx.stroke();
      }

    });
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
