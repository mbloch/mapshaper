/** @requires core.geo */


/**
 * A matrix class that supports affine transformations (scaling, translation, rotation).
 *
 * Elements:
   a  c  tx
   b  d  ty
   0  0  1  (u v w are not used)
 *
 * @constructor
 */

function Matrix2D() {
  this.identity();
  this._p = new Point(0, 0);
};

Matrix2D.prototype.identity = function() {
  this.a = 1;
  this.c = 0;
  this.tx = 0;
  this.b = 0;
  this.d = 1;
  this.ty = 0;
  // u, v, w are not used
};


Matrix2D.prototype.transformXY = function(x, y, p) {
  var p = p || new Point(); // this._p;
  p.x = x * this.a + y * this.c + this.tx;
  p.y = x * this.b + y * this.d + this.ty;
  return p;
};

Matrix2D.prototype.clone = function() {
  var m = new Matrix2D();
  Opts.copyAllParams(m, this);
};

Matrix2D.prototype.translate = function(dx, dy) {
  this.tx += dx;
  this.ty += dy;
  //this.tx += dx * this.a + dy * this.c;
  //this.ty += dx * this.b + dy * this.d;
};


Matrix2D.prototype.rotate = function(q, x, y) {
  x = x || 0;
  y = y || 0;
  var cos = Math.cos(q);
  var sin = Math.sin(q);
  this.a = cos;
  this.c = -sin;
  this.b = sin;
  this.d = cos;
  this.tx += x - x * cos + y * sin;
  this.ty += y - x * sin - y * cos;
};

Matrix2D.prototype.scale = function(sx, sy) {
  //this.a = sx;
  //this.d = sy;
  this.a *= sx;
  this.c *= sx;
  this.b *= sy;
  this.d *= sy;
};

Matrix2D.prototype.getDeterminant = function() {
  return this.a * this.d - this.c * this.b;
};

Matrix2D.prototype.invert = function() {
  var det = this.getDeterminant();
  if (det == 0 || isNaN(det)) {
    trace("[Matrix2D.invert()] matrix is not invertible.");
    return;
  }
  var m = this.clone();
  this.a = m.d / det;
  this.b = -m.b / det;
  this.c = -m.c / det;
  this.d = m.a / det;
  this.tx = (m.c * m.ty - m.d * m.tx) / det;
  this.ty = (m.b * m.tx - m.a * m.ty) / det;
};

