
// A matrix class that supports affine transformations (scaling, translation, rotation).
// Elements:
//   a  c  tx
//   b  d  ty
//   0  0  1  (u v w are not used)
//
export function Matrix2D() {
  this.a = 1;
  this.c = 0;
  this.tx = 0;
  this.b = 0;
  this.d = 1;
  this.ty = 0;
}

Matrix2D.prototype.transformXY = function(x, y, p) {
  p = p || {};
  p.x = x * this.a + y * this.c + this.tx;
  p.y = x * this.b + y * this.d + this.ty;
  return p;
};

Matrix2D.prototype.translate = function(dx, dy) {
  this.tx += dx;
  this.ty += dy;
};

// x, y: optional origin
Matrix2D.prototype.rotate = function(q, x, y) {
  var cos = Math.cos(q);
  var sin = Math.sin(q);
  x = x || 0;
  y = y || 0;
  this.a = cos;
  this.c = -sin;
  this.b = sin;
  this.d = cos;
  this.tx += x - x * cos + y * sin;
  this.ty += y - x * sin - y * cos;
};

// cx, cy: optional origin
Matrix2D.prototype.scale = function(sx, sy, cx, cy) {
  cx = cx || 0;
  cy = cy || 0;
  this.a *= sx;
  this.c *= sx;
  this.b *= sy;
  this.d *= sy;
  this.tx -= cx * (sx - 1);
  this.ty -= cy * (sy - 1);
};
