/* @requires bounds, arrayutils */


// @a and @b are [[x0, x1, ...], [y0, y1, ...]] arrays describing closed rings
// returns [a, b] if no intersection, else returns [x, y, z] where z
//   is the intersection of a and b, x is the remaining area of a and y is the
//   remaining area of y
// error conditions: a contains b, b contains a, a and b have more than one intersecting parts
//
function splitTwoShapes(a0, b0) {

  if (a0.bounds.intersects(b0.bounds) == false) {
    return [a0, b0];
  }

  if (a0.bounds.contains(b0.bounds) || b0.bounds.contains(a0.bounds)) {
    error("splitTwoShapes() one box contains the other...")
  }

  var inxx = [],
      inyy = [],
      outxx = [],
      outyy = [],
      i1 = -1,
      i2 = -1,
      inside = false,
      startInside = false;

  var axx = a0xx,
      ayy = a0.yy
}


function SimpleShape(xx, yy) {
  this.xx = xx;
  this.yy = yy;
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);

  this.bounds = new Bounds(xb.min, yb.min, xb.max, yb.max);
  this.size = function(return xx.length);

  this.containsXY(x, y) {
    if (this.bounds.containsXY(x, y) == false) {
      return false;
    }
  }
}

