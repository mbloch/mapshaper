
// Coordinate iterators
//
// Interface:
//   properties: x, y
//   method: hasNext()
//
// Usage:
//   while (iter.hasNext()) {
//     iter.x, iter.y; // do something w/ x & y
//   }

// Iterate over an array of [x, y] points
//
export function PointIter(points) {
  var n = points.length,
      i = 0,
      iter = {
        x: 0,
        y: 0,
        hasNext: hasNext
      };
  function hasNext() {
    if (i >= n) return false;
    iter.x = points[i][0];
    iter.y = points[i][1];
    i++;
    return true;
  }
  return iter;
}


// Constructor takes arrays of coords: xx, yy, zz (optional)
//
export function ArcIter(xx, yy) {
  this._i = 0;
  this._n = 0;
  this._inc = 1;
  this._xx = xx;
  this._yy = yy;
  this.i = 0;
  this.x = 0;
  this.y = 0;
}

ArcIter.prototype.init = function(i, len, fw) {
  if (fw) {
    this._i = i;
    this._inc = 1;
  } else {
    this._i = i + len - 1;
    this._inc = -1;
  }
  this._n = len;
  return this;
};

ArcIter.prototype.hasNext = function() {
  var i = this._i;
  if (this._n > 0) {
    this._i = i + this._inc;
    this.x = this._xx[i];
    this.y = this._yy[i];
    this.i = i;
    this._n--;
    return true;
  }
  return false;
};

export function FilteredArcIter(xx, yy, zz) {
  var _zlim = 0,
      _i = 0,
      _inc = 1,
      _stop = 0;

  this.init = function(i, len, fw, zlim) {
    _zlim = zlim || 0;
    if (fw) {
      _i = i;
      _inc = 1;
      _stop = i + len;
    } else {
      _i = i + len - 1;
      _inc = -1;
      _stop = i - 1;
    }
    return this;
  };

  this.hasNext = function() {
    // using local vars is significantly faster when skipping many points
    var zarr = zz,
        i = _i,
        j = i,
        zlim = _zlim,
        stop = _stop,
        inc = _inc;
    if (i == stop) return false;
    do {
      j += inc;
    } while (j != stop && zarr[j] < zlim);
    _i = j;
    this.x = xx[i];
    this.y = yy[i];
    this.i = i;
    return true;
  };
}

export function MultiShapeIter(arcs) {
  var iter = new ShapeIter(arcs);

}

// Iterate along a path made up of one or more arcs.
//
export function ShapeIter(arcs) {
  this._arcs = arcs;
  this._i = 0;
  this._n = 0;
  this.x = 0;
  this.y = 0;
  // this.i = -1;
}

ShapeIter.prototype.hasNext = function() {
  var arc = this._arc;
  if (this._i < this._n === false) {
    return false;
  }
  if (arc.hasNext()) {
    this.x = arc.x;
    this.y = arc.y;
    // this.i = arc.i;
    return true;
  }
  this.nextArc();
  return this.hasNext();
};

ShapeIter.prototype.init = function(ids) {
  this._ids = ids;
  this._n = ids.length;
  this.reset();
  return this;
};

ShapeIter.prototype.nextArc = function() {
  var i = this._i + 1;
  if (i < this._n) {
    this._arc = this._arcs.getArcIter(this._ids[i]);
    if (i > 0) this._arc.hasNext(); // skip first point
  }
  this._i = i;
};

ShapeIter.prototype.reset = function() {
  this._i = -1;
  this.nextArc();
};
