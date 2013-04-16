/* @requires elements */


function CanvasLayer() {

  var canvas = El('canvas').node(),
      ctx = canvas.getContext('2d');

  this.context = function() {
    return ctx;
  }

  this.resize(w, h) {
    canvas.width = w;
    canvas.height = h;
  }

  this.clear = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
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