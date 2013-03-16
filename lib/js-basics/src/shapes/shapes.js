/* @requires core.geo */

/**
 * A polygon or polyline shape containing 0 or more parts (e.g. polygon rings).
 * @param {number} id Integer id of the shape.
 * @param {*} vertexSet Vertex set representing the first part in the shape.
 * @constructor
 */
function ShapeVector(id, vertexSet) {
  this.id = id;
  this.parts = [];
  if (vertexSet) {
    this.addPartData(vertexSet);
  }
  this.sortKey = "";
  this.reset();
}

Opts.extendPrototype(ShapeVector, BoundingBox);

ShapeVector.prototype.addPartData = function(vertexSet) {
  this.parts.push(vertexSet);
  this.mergeBounds(vertexSet);
};


ShapeVector.prototype.drawPath = function drawPath(context, ext) {
  var numParts = this.parts.length;
  for (var j = 0; j < numParts; j++) {
    var vec = this.parts[j];
    vec.draw(context, ext);
  }
};

ShapeVector.prototype.getSortKey = function() {
  return this.sortKey;
};


// Bolted-on iterator methods to implement MultiPath interface (fastmap-shapes.js)
//
ShapeVector.prototype.reset = function() {
  this.__setPart(-1);
}

ShapeVector.prototype.__setPart = function(i) {
  this._currPart = this.parts[i] || null;
  this._partId = i;
  this._pointId = 0;
}

ShapeVector.prototype.nextPart = function() {
  var partId = this._partId + 1;
  if (partId >= this.parts.length) {
    this.reset();
    return false;
  }
  this.__setPart(partId);
  return true;
};

ShapeVector.prototype.nextPoint = function() {
  var vec = this._currPart;
  if (!vec || !vec.hasNext()) {
    return false;
  }
  this.x = vec.nextX;
  this.y = vec.nextY;
  this.i = this._pointId++;
  return true;
};

ShapeVector.prototype.hasNext = function() {
  return this.nextPoint() || this.nextPart() && this.nextPoint();
};


/**
 * Sequence of x,y coordinates describing a polyline or polygon ring.
 * @param {Array} xx Array of x coordinates.
 * @param {Array} yy Array of y coordinates.
 * @constructor
 */
function VertexSet(xx, yy) {
  this.xx = xx;
  this.yy = yy;
  //this._size = xx.length;

  this._idx = 0;
  this.nextX = 0;
  this.nextY = 0;
}

VertexSet.prototype = new BoundingBox();


/**
 * Returns number of vertices in the collection.
 * @return {number} Length of VertexSet.
 */
VertexSet.prototype.size = function() {
  return this.xx && this.xx.length || 0; // this._size;
};


/**
 * Iterator test; also advances cursor or resets if at end of sequence.
 * @return {boolean} True or false.
 */
VertexSet.prototype.hasNext = function() {
  var idx = this._idx;
  if (idx >= this.xx.length) {// this._size) {
    this._idx = 0;
    return false;
  }
  this.nextX = this.xx[idx];
  this.nextY = this.yy[idx];
  this._idx = idx + 1;
  return true;
};

VertexSet.prototype.calcBounds = function calcBounds() {
  var len = this.size(); // this._size;
  if (len == 0) {
    return;
  }
  var xx = this.xx;
  var yy = this.yy;
  var maxx = xx[0];
  var maxy = yy[0];
  var minx = maxx;
  var miny = maxy;

  /* This is up to 2x faster than using Array.max() and Array.min() */
  /*  */
  for (var i=1; i<len; i++) {
    var x = xx[i];
    var y = yy[i];

    if (x > maxx) maxx = x;
    else if (x < minx) minx = x;
    if (y > maxy) maxy = y;
    else if (y < miny) miny = y;
  }

  /*
  minx = Math.min.apply(Math, xx);
  maxx = Math.max.apply(Math, xx);
  miny = Math.min.apply(Math, yy);
  maxy = Math.max.apply(Math, yy);
  */
  
  // this.setBounds(minx, maxy, maxx, miny);
  this.left = minx;
  this.top = maxy;
  this.right = maxx;
  this.bottom = miny;
};

VertexSet.prototype.addPoint = function(x, y) {
  this.xx.push(x);
  this.yy.push(y);
};


/**
 * Draw vertices using the canvas drawing API.
 * @param {*} context 2D canvas context.
 * @param {MapExtent} ext MapExtent object.
 */
VertexSet.prototype.draw = function(context, ext) {
  var x, y,
    mx = ext.mx,
    my = ext.my,
    bx = ext.bx,
    by = ext.by,
    first = true;
  
  while (this.hasNext()) {
    x = this.nextX * mx + bx;
    y = this.nextY * my + by;

    if (first) {
      first = false;
      context.moveTo(x, y);
    }
    else {
      context.lineTo(x, y);
    }
  }
};