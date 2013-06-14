

function ShapeRenderer() {

  function drawCircle(x, y, size, col, ctx) {
    if (size > 0) {
      ctx.beginPath();
      ctx.fillStyle = col;
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2, true);
      ctx.fill();
    }
  }

  /*
  var index = {};
  function drawCircle(x, y, size, col, ctx) {
    var key = String(size) + col;
    var img = index[key];
    if (!img) {
      var pixRadius = Math.ceil(size * 0.5);
      var dw = pixRadius * 2;
      var dh = pixRadius * 2;

      img = document.createElement('canvas');
      img.width = dw;
      img.height = dh;
      var ctr = dw / 2;
      drawVectorCircle(ctr, ctr, size, col, img.getContext('2d'));

      var dx = Math.round(ctr - pixRadius);
      var dy = Math.round(ctr - pixRadius);

      index[key] = img;
    }

    var wpix = img.width;
    var xIns = (x - wpix * 0.5 + 0.5) | 0;
    var yIns = (y - wpix * 0.5 + 0.5) | 0;
    ctx.drawImage(img, xIns, yIns);
  };
  */

  this.drawPoints = function(paths, ctx) {
    var endCol = "#000000",
        midCol = "rgba(255, 50, 50, 0.6)",  // "#ffcccc", //
        endSize = 5,
        midSize = 4;

    paths.forEach(function(vec) {
      while (vec.hasNext()) {
        if (vec.node) {
          drawCircle(vec.x, vec.y, endSize, endCol, ctx);
        } else {
          drawCircle(vec.x, vec.y, midSize, midCol, ctx);
        }
      }
    });
  }


  this.drawShapes = function(paths, style, ctx) {
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

    var pathCount = 0, segCount = 0;
    paths.forEach(function(vec) {
      if (vec.hasNext()) {
        ctx.beginPath();
        ctx.moveTo(vec.x, vec.y);
        pathCount++;

        while (vec.hasNext()) {
          ctx.lineTo(vec.x, vec.y);
          segCount++;
        }

        if (filled) ctx.fill();
        if (stroked) ctx.stroke();
      }
    });
    return {
      paths: pathCount,
      segments: segCount
    }
  };
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
  }
}
