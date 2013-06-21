/** @requires core */

Utils.extend(C, {
  // alignment constants
  N: 'n',
  E: 'e',
  W: 'w',
  S: 's',
  NW: 'nw',
  NE: 'ne',
  SE: 'se',
  SW: 'sw',
  TOP: 'top',
  LEFT: 'left',
  RIGHT: 'right',
  BOTTOM: 'bottom',
  CENTER: 'c'
});


// Basic 2d point class
//
function Point(x, y) {
  this.x = x;
  this.y = y;
}

Point.prototype.clone = function() {
  return new Point(this.x, this.y);
};

Point.prototype.toString = function() {
  return "{x:" + this.x + ", y:" + this.y + "}";
};

/*
Point.prototype.distanceToXY = function(x, y) {
  return Point.distance(this.x, this.y, x, y);
};

Point.prototype.distanceToPoint = function(p) {
  return Point.distance(this.x, this.y, p.x, p.y);
};
*/

Point.distance = function(x1, y1, x2, y2) {
  var dx = x1 - x2,
      dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
};

/*
Point.prototype.equals = function(p) {
  return this.x === p.x && this.y === p.y;
};
*/


// Lat lon coordinate class.
//
function GeoPoint(lat, lng) {
  this.lat = lat;
  this.lng = lng;
}

GeoPoint.prototype.clone = function() {
  return new GeoPoint(this.lat, this.lng);
};

GeoPoint.prototype.toString = function() {
  var str = '[GeoPoint]: {lat:' + this.lat + ', lng:' + this.lng + '}';
  return str;
};


function FourSides(l, t, r, b) {
  this.left = l || 0;
  this.top = t || 0;
  this.right = r || 0;
  this.bottom = b || 0;
}

FourSides.prototype.toString = function() {
  return '{l:' + this.left + ', t:' + this.top + ', r:' +
    this.right + ', b:' + this.bottom + '}';
};



// BoundingBox class assumes ymax is top and ymin is bottom
// TODO: switch to using xmin, ymin, xmax, ymax instead of left, top, right, bottom
//
function BoundingBox() {
  if (arguments.length == 4) {
    this.setBounds.apply(this, arguments);
  }
}

BoundingBox.prototype.toString = FourSides.prototype.toString;

BoundingBox.prototype.hasBounds = function() {
  return this.left !== undefined;
};

BoundingBox.prototype.hasSameBounds = function(bb) {
  return this.left == bb.left && this.top == bb.top &&
    this.right == bb.right && this.bottom == bb.bottom;
};

BoundingBox.prototype.width = function() {
  return (this.right - this.left) || 0;
};

BoundingBox.prototype.height = function() {
  return Math.abs(this.top - this.bottom) || 0; // handle flipped v bounds.
};

BoundingBox.prototype.setBounds = function(l, t, r, b) {
  if (arguments.length == 1) {
    // assume first arg is a BoundingBox
    b = l.bottom;
    r = l.right;
    t = l.top;
    l = l.left;
  }
  this.left = l;
  this.top = t;
  this.right = r;
  this.bottom = b;
  return this;
};

BoundingBox.prototype.getCenterPoint = function() {
  if (!this.hasBounds()) error("Missing bounds");
  return new Point(this.centerX(), this.centerY());
};

BoundingBox.prototype.centerX = function() {
  var x = (this.left + this.right) * 0.5;
  return x;
};

BoundingBox.prototype.centerY = function() {
  var y = (this.top + this.bottom) * 0.5;
  return y;
};

BoundingBox.prototype.containsPoint = function(x, y) {
  if (x >= this.left && x <= this.right &&
    y <= this.top && y >= this.bottom) {
    return true;
  }
  return false;
};

// intended to speed up slightly bubble symbol detection; could use intersects() instead
// * FIXED * may give false positives if bubbles are located outside corners of the box
//
BoundingBox.prototype.containsBufferedPoint = function( x, y, buf ) {
  if ( x + buf > this.left && x - buf < this.right ) {
    if ( y - buf < this.top && y + buf > this.bottom ) {
      return true;
    }
  }
  return false;
};

BoundingBox.prototype.intersects = function(bb) {
  if (bb.left <= this.right && bb.right >= this.left &&
    bb.top >= this.bottom && bb.bottom <= this.top) {
    return true;
  }
  return false;
};

BoundingBox.prototype.contains = function(bb) {
  if (bb.left >= this.left && bb.top <= this.top &&
    bb.right <= this.right && bb.bottom >= this.bottom) {
    return true;
  }
  return false;
};

BoundingBox.prototype.translate = function(x, y) {
  this.setBounds(this.left + x, this.top + y, this.right + x,
    this.bottom + y);
};

BoundingBox.prototype.padBounds = function(l, t, r, b) {
  this.left -= l;
  this.top += t;
  this.right += r;
  this.bottom -= b;
}

/**
 * Rescale the bounding box by a fraction. TODO: implement focus.
 * @param {number} pct Fraction of original extents
 * @param {number} pctY Optional amount to scale Y
 */
BoundingBox.prototype.scale = function(pct, pctY) { /*, focusX, focusY*/
  var halfWidth = (this.right - this.left) * 0.5;
  var halfHeight = (this.top - this.bottom) * 0.5;
  var kx = pct - 1;
  var ky = pctY === undefined ? kx : pctY - 1;
  this.left -= halfWidth * kx;
  this.top += halfHeight * ky;
  this.right += halfWidth * kx;
  this.bottom -= halfHeight * ky;
};

/**
 * Return a bounding box with the same extent as this one.
 * @return {BoundingBox} Cloned bb.
 */
BoundingBox.prototype.cloneBounds = function() {
  var bb = new BoundingBox();
  if (this.hasBounds()) {
    bb.setBounds(this.left, this.top, this.right, this.bottom);
  }
  return bb;
};

BoundingBox.prototype.clearBounds = function() {
  this.setBounds(new BoundingBox());
}

BoundingBox.prototype.mergePoint = function(x, y) {
  if (this.left === void 0) {
    this.setBounds(x, y, x, y);
  } else {
    // this works even if x,y are NaN
    if (x < this.left)  this.left = x;
    else if (x > this.right)  this.right = x;

    if (y < this.bottom) this.bottom = y;
    else if (y > this.top) this.top = y;
  }
};

BoundingBox.prototype.mergeBounds = function(bb) {
  var l, t, r, b;
  if (bb.left !== void 0) {
    l = bb.left, r = bb.right, t = bb.top, b = bb.bottom;
  } else if (bb.length == 4) {
    l = bb[0], r = bb[2], b = bb[1], t = bb[3]; // expects array: [xmin, ymin, xmax, ymax]
  } else {
    if (!this.hasBounds()) {
      error("BoundingBox#mergeBounds() merging two empty boxes")
    }
    trace("BoundingBox#mergeBounds() invalid argument:", bb);
    // return;
  }

  if (this.left === void 0) {
    this.setBounds(l, t, r, b);
  } else {
    if (l < this.left) this.left = l;
    if (r > this.right) this.right = r;
    if (t > this.top) this.top = t;
    if (b < this.bottom) this.bottom = b;
  }
};


/**
 * TODO: remove 256
 */
function TileExtent(w, h) {
  this.mx = this.my = 1;
  this.bx = this.by = 0;
  this.widthInPixels = w || 256;
  this.heightInPixels = h || 256;
}

Opts.inherit(TileExtent, BoundingBox);

TileExtent.prototype.setBounds =  function() {
  /*
  if (b) {
    // accept four coords (instead of one BoundingBox)
    bb = new BoundingBox().setBounds(bb, t, r, b);
  }
  // trace("TileExtent() setBounds()", bb, t, r, b, "left:", bb.left)
  this.mergeBounds(this, bb);
  */
  BoundingBox.prototype.setBounds.apply(this, arguments);
  var bb = this;

  var ppm = this.widthInPixels / (bb.right - bb.left);
  this.mx = ppm;
  //this.my = -ppm;
  this.my = this.heightInPixels / (bb.bottom - bb.top);
  this.bx = -ppm * bb.left;
  this.by = -this.my * bb.top;
  this.metersPerPixel = 1 / ppm; // 
};

TileExtent.prototype.updateBounds = TileExtent.prototype.setBounds; // TODO: remove updateBounds

// apply after bounds have been set...
//
TileExtent.prototype.addPixelMargins = function(l, t, r, b) {
  this.bx += l;
  this.by -= b;
  this.mx *= 1 - (l + r) / this.widthInPixels;
  this.my *= 1 - (t + b) / this.heightInPixels;
};

TileExtent.prototype.transformXY = function(x, y, xy) {
  xy = xy || new Point();
  var xPix = x * this.mx + this.bx;
  var yPix = y * this.my + this.by;
  xy.x = xPix;
  xy.y = yPix;
  return xy;
};

TileExtent.prototype.clone = function() {
  var ext = new TileExtent(this.widthInPixels, this.heightInPixels);
  ext.setBounds(this);
  return ext;
};
