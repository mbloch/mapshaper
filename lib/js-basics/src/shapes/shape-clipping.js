/* @requires shapes, browser */

/**
  * Optimized shape drawing -- vertices outside a bounding box are ignored
 **/



function ShapeClip(ext, pixelMargin) {
  var marg = pixelMargin === undefined ? 2 : pixelMargin;
  this.ext = ext.clone();
  // get expanded bounds, 
  var yfac = -1;
  var clipBounds = new BoundingBox();
  clipBounds.setBounds(ext.left - ext.mx * marg, ext.top + yfac * marg * ext.my, ext.right + ext.mx * marg, ext.bottom - yfac * marg);
  this.bounds = clipBounds;
}


/**
 *  Assume: x, y represent a point outside the shape
 *
 */
ShapeClip.prototype.__eatOutsidePoints = function(x, y, vec, bb) {
  var prevX = x, prevY = y;
  var arr = [];
  var side, bound, prevSide = 0;
  while(true) {
     // get side
    if (x < bb.left) {
      side = C.W;
    } else if (x > bb.right) {
      side = C.E;
    } else if (y > bb.top) {
      side = C.N;
    } else if (y < bb.bottom) {
      side = C.S;
    } else { // xy is inside the box
      // find entrance point... intersect

      return arr;
    }

    if (prevSide != 0 && side != prevSide) {
      // handle case where line cuts through the box...
      // add a corner point
    }

    prevX = x;
    prevY = y;
    prevSide = side;
    if (vec.hasNext()) {
      x = vec.nextX;
      y = vec.nextY;
    }
  }

  return arr;
};

ShapeClip.prototype.__getExitPoint = function(innerX, innerY, outerX, outerY, bb) {
  // debugging: make sure prevX, prevY is inside and x, y is outside box
  if (bb.containsPoint(prevX, prevY) == false || bb.containsPoint(x, y) == true) {
    trace("[ShapeClip.__getBorderPoint()] Assertion failed: segment moves from inside to outside the bounding box.");
    return null;
  }

  var p,
    l = bb.left,
    r = bb.right,
    t = bb.top,
    b = bb.bottom;
  var intersectX, intersectY;
  if (outerX < l && p = intersectX(innerX, innerY, outerX, outerY, t, b, l)) ;
  else if (outerX > r && p = intersectY(innerX, innerY, outerX, outerY, t, b, r)) ;
  else if (outerY > t && p = intersectY(innerX, innerY, outerX, outerY, r, l, t)) ;
  else if (p = intersectY(innterX, innerY, outerX, outerY, r, l, b)) ;

  return p;

};



ShapeClip.prototype.drawVectorToCanvas = function(vec, ctx) {

  var bb = this.bounds;
  var ext = this.ext;
  var prevX, prevY, prevInside;
  var startedDrawing = false;

  var mx = ext.mx;
  var my = ext.my;
  var bx = ext.bx;
  var by = ext.by;

  while (vec.hasNext()) {

    var x = vec.nextX;
    var y = vec.nextY;
    var inside = bb.containsPoint(x, y);

    // case: inside, no drawing yet (prev inside or outside)
    if (inside && startedDrawing === false) {
      ctx.moveTo(x * mx + bx, y * my + by);
      startedDrawing = true;
    }

    // case inside (assume prev inside)
    else if (inside) {
      ctx.lineTo(x * mx + bx, y * my + by);
    }

    // x, y vertex is outside box
    else {

       // case outside, prev inside
     if (startedDrawing) {
        var p = this.__getExitPoint(prevX, prevY, x, y, this.bounds);
        ctx.lineTo(p.x * mx + bx, p.y * my + by);
      }
      // case outside, no drawing yet
      else {
        // TODO: make sure interpolation happens at the end of the shape
      }

      var corners = this.__eatOutsidePoints(x, y, vec, this.bounds);

      // draw corners
    }


    //// case inside, prev outside : doesn't occur
    //// case outside, prev outside: doesn't occur


    prevX = x;
    prevY = y;

  }

  // TODO: make sure we're handling case where first vertex was outside the tile....



};