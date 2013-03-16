/** @requires core */

/**
 * "C" object contains global constants.
 */
Opts.copyNewParams(C, {

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


/**
 * Basic 2-d point class.
 * @constructor
 * @param {number=} x X coordinate.
 * @param {number=} y Y coordinate.
 */
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

Point.prototype.distanceToXY = function(x, y) {
  return Point.distance(this.x, this.y, x, y);
};

Point.prototype.distanceToPoint = function(p) {
  return Point.distance(this.x, this.y, p.x, p.y);
};

Point.distance = function(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
};

Point.prototype.equals = function(p) {
  return this.x === p.x && this.y === p.y;
};



/**
 * Lat lon coordinate class.
 * @param {number} lat Latitude.
 * @param {number} lng Longitude.
 * @constructor
 */
function GeoPoint(lat, lng) {
  this.lat = lat;
  this.lng = lng;
}

GeoPoint.prototype.clone = function() {
  return new GeoPoint(this.lat, this.lng);
};

/**
 * Return a string representation for debugging.
 * @return {string} String.
 */
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


/**
 * View bounds as string.
 * @return {string} String.
 */
FourSides.prototype.toString = function() {
  return '{l:' + this.left + ', t:' + this.top + ', r:' +
    this.right + ', b:' + this.bottom + '}';
};


/**
 * A rectangle class for projected coordinates, where 
 * b.left <= b.right == true and b.top >= b.bottom == true
 * @constructor
 */
function BoundingBox() {
  // this._flipped = false;
  if (arguments.length == 4) {
    this.setBounds.apply(this, arguments);
  }
}

BoundingBox.prototype.toString = FourSides.prototype.toString;


/**
 * Test whether bounds have been set.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.hasBounds = function() {
  return this.left !== undefined;
};


/**
 * Test for identical bounds.
 * @param {FourSides} bb Seconds bounding box.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.hasSameBounds = function(bb) {
  return this.left == bb.left && this.top == bb.top &&
    this.right == bb.right && this.bottom == bb.bottom;
};

/**
 * Get width of bounding box.
 * @return {number} Width (in meters).
 */
BoundingBox.prototype.width = function() {
  return (this.right - this.left) || 0;
};

/**
 * Get height of bounding box.
 * @return {number} Height (in meters).
 */
BoundingBox.prototype.height = function() {
  return Math.abs(this.top - this.bottom) || 0; // handle flipped v bounds.
};

//BoundingBox.prototype.area = function() {
//  return this.width() * this.height();
//};


/**
 * Init bounding box with bounds.
 * @param {number} l Left bound or BoundingBox
 * @param {number} t Top bound or undefined.
 * @param {number} r Right bound or undefined.
 * @param {number} b Bottom bound or undefined.
 */
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
  // this._flipped = b > t;
  return this;
};

/**
 * Get x, y coords of box center.
 * @return {Point} Center point.
 */
BoundingBox.prototype.getCenterPoint = function() {
  assert(this.hasBounds(), "Missing bounds");
  return new Point(this.centerX(), this.centerY());
};

/**
 * Get x coord of center point.
 * @return {number} X coordinate.
 */
BoundingBox.prototype.centerX = function() {
  var x = (this.left + this.right) * 0.5;
  return x;
};

/**
 * Get y coord of center point.
 * @return {number} Y coordinate.
 */
BoundingBox.prototype.centerY = function() {
  var y = (this.top + this.bottom) * 0.5;
  return y;
};


/**
 * Is an x, y point inside or on the edge of the bounding box?
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {boolean} True or false.
 */
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
}		


/**
 * Tests whether a second BoundingBox intersect this bb.
 * TODO: Handle case where argument is not a valid bb.
 * @param {BoundingBox} bb Bounding box to test.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.intersects = function(bb) {
  if (bb.left < this.right && bb.right > this.left &&
    bb.top > this.bottom && bb.bottom < this.top) {
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


/**
 * Shift (translates) the bounding box.
 * @param {number} x Amount to shift horizontally.
 * @param {number} y Amount to shift vertically.
 */
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

/**
 * Enlarge this bb to incorporate a point.
 * @param {number} x X coord.
 * @param {number} y Y coord.
 */
BoundingBox.prototype.mergePoint = function(x, y) {
  if (this.left === undefined) {
    this.setBounds(x, y, x, y);
  }
  else {
    // this works even if x,y are NaN
    if (x < this.left)  this.left = x;
    else if (x > this.right)  this.right = x;

    if (y < this.bottom) this.bottom = y;
    else if (y > this.top) this.top = y;
  }
};


/**
 * Modify this bb to include a second bounding box.
 * @param {BoundingBox} bb Second bounding box.
 */
BoundingBox.prototype.mergeBounds = function(bb) {

  if (arguments.length == 0 || bb.left === void 0) {
    return;
  }

  if (this.left !== void 0) {
    if (bb.left < this.left) {
      this.left = bb.left;
    }
    if (bb.right > this.right) {
      this.right = bb.right;
    }
    if (bb.top > this.top) {
      this.top = bb.top;
    }
    if (bb.bottom < this.bottom) {
      this.bottom = bb.bottom;
    }
  }
  else {
    this.left = bb.left;
    this.top = bb.top;
    this.right = bb.right;
    this.bottom = bb.bottom;
    // this.setBounds(bb.left, bb.top, bb.right, bb.bottom);
  }
};


function Transform() {
  this.mx = this.my = 1;
  this.bx = this.by = 0;
}


Transform.prototype = {
  useTileBounds: function(wPix, hPix, bb) {
    var ppm = wPix / (bb.right - bb.left);
    this.mx = ppm;
    this.my = hPix / (bb.bottom - bb.top);
    this.bx = -ppm * bb.left;
    this.by = -this.my * bb.top;
    return this;
  },

  fromPixels: function(x, y, xy) {
    xy = xy || [];
    xy[0] = (x - this.bx) / this.mx;
    xy[1] = (y - this.by) / this.my;
    return xy;
  },

  toPixels: function(x, y, xy) {
    xy = xy || [];
    xy[0] = x * this.mx + this.bx;
    xy[1] = y * this.my + this.by;
    return xy;
  }

  /*
  toString: function() {
    return "[Transform: " + Utils.toString({mx:mx, my:my, bx:by, by:by}) + "]";
  }*/
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

// Adapted from MapExtent()
TileExtent.prototype.setBounds =  function(bb, t, r, b) {
  if (b) {
    // accept four coords (instead of one BoundingBox)
    bb = new BoundingBox().setBounds(bb, t, r, b);
  }

  this.mergeBounds(this, bb);

  var ppm = this.widthInPixels / (bb.right - bb.left);
  this.mx = ppm;
  //this.my = -ppm;
  this.my = this.heightInPixels / (bb.bottom - bb.top);
  this.bx = -ppm * bb.left;
  this.by = -this.my * bb.top;
  this.metersPerPixel = 1 / ppm; // 
};


TileExtent.prototype.updateBounds = TileExtent.prototype.setBounds; // TODO: remove updateBounds

/**
 * // apply after bounds have been set...
 */
TileExtent.prototype.addPixelMargins = function(l, t, r, b) {
  //trace(arguments);
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

