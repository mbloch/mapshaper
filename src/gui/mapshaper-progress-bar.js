/* @requires mapshaper-gui-lib */

function ProgressBar(el) {
  var size = 80,
      posCol = '#285d7e',
      negCol = '#bdced6',
      outerRadius = size / 2,
      innerRadius = outerRadius / 2,
      cx = outerRadius,
      cy = outerRadius,
      bar = El('div').addClass('progress-bar'),
      canv = El('canvas').appendTo(bar).node(),
      ctx = canv.getContext('2d'),
      msg = El('div').appendTo(bar);

  canv.width = size;
  canv.height = size;

  this.appendTo = function(el) {
    bar.appendTo(el);
  };

  this.update = function(pct, str) {
    var twoPI = Math.PI * 2;
    ctx.clearRect(0, 0, size, size);
    if (pct > 0) {
      drawCircle(negCol, outerRadius, twoPI);
      drawCircle(posCol, outerRadius, twoPI * pct);
      drawCircle(null, innerRadius, twoPI);
    }
    msg.html(str || '');
  };

  this.remove = function() {
    bar.remove();
  };

  function drawCircle(color, radius, radians) {
    var halfPI = Math.PI / 2;
    if (!color) ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = color || '#000';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, -halfPI, radians - halfPI, false);
    ctx.closePath();
    ctx.fill();
    if (!color) ctx.globalCompositeOperation = 'source-over';
  }
}
