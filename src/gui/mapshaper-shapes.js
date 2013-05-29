/* @requires mapshaper-common, mapshaper-index, core.geo, bounds */

MapShaper.calcArcBounds = function(xx, yy) {
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);
  return [xb.min, yb.min, xb.max, yb.max];
};

// ArcCollection has methods for finding the arcs inside a bounding box and the
//   nearest arc to an (x, y) location.
// Receive array of arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
function ArcCollection(coords) {
  var len = coords.length,
      xxyy, bbox;

  var arcs = [],
      boxes = [],
      bounds = new Bounds();

  var thresholds = null,
      sorted = null,
      zlimit = 0;


  for (var i=0; i<len; i++) {
    xxyy = coords[i];
    bbox = MapShaper.calcArcBounds(xxyy[0], xxyy[1]);
    bounds.mergeBounds(bbox);
    boxes.push(bbox);
  }

  var arcIter = new ArcIter();
  // var shapeIter = new ShapeIter(this);

  // 
  // var index = new BoundsIndex(boxes);

  this.getArcIter = function(i, reverse) {
    var xx = coords[i][0],
        yy = coords[i][1];
    if (zlimit) {
      arcIter.init(xx, yy, !!reverse, thresholds[i], zlimit);
    } else {
      arcIter.init(xx, yy, !!reverse); 
    }
    return arcIter;
  };

  this.setThresholds = function(arr) {
    thresholds = arr;
    sorted = MapShaper.getSortedThresholds(arr);
  };

  this.setRetainedPct = function(pct) {
    if (!sorted) error ("Missing threshold data.");
    if (pct >= 1) {
      zlimit = 0;
    } else {
      var i = Math.floor(pct * sorted.length);
      zlimit = sorted[i];
    }
  }

  // Optimize: generally don't need a new object, could reuse
  //
  this.getShapeIter = function(ids) {
    var iter = new ShapeIter(this);
    iter.init(ids);
    return iter;
  }

  function mergeBounds(dest, src) {
    if (!dest) {
      dest = src.concat();
    } else {
      if (src[0] < dest[0]) {
        dest[0] = src[0];
      }
      if (src[1] < dest[1]) {
        dest[1] = src[1];
      }
      if (src[2] > dest[2]) {
        dest[2] = src[2];
      }
      if (src[3] > dest[3]) {
        dest[3] = src[3];
      }
    }
    return dest;
  }

  // TODO: rework bounds checking;
  //   instead of creating Bounds objects for Arcs and Shapes,
  //   instead could call a method to test for bounds intersection...
  //

  this.getArcBounds = function(i) {
    return new Bounds(boxes[i]);
  };

  this.getShapeBounds = function(ids) {
    var b = null;
    for (var i=0, n=ids.length; i<n; i++) {
      b = mergeBounds(b, boxes[ids[i]]);
    }
    return b;
  };

  this.getMultiShapeBounds = function(parts) {
    var b = null;
    for (var i=0, n=parts.length; i<n; i++) {
      b = mergeBounds(b, getShapeBounds(parts[i]));
    }
    return b;
  };


  this.size = function() {
    return len;
  };

  this.getBounds = function() {
    return bounds;
  };

  this.getShapeCollection = function(data, shapeClass) {
    var shapes = Utils.map(data, function(datum, i) {
      return new shapeClass(this, datum);
    }, this);
    return new ShapeCollection(shapes);
  };

  this.getArcs = function() {
    return this.getShapeCollection(Utils.range(this.size()), Arc);
  };

  this.getShapes = function(arr) {
    return this.getShapeCollection(arr, Shape);
  };

  this.getMultiShapes = function(arr) {
    return this.getShapeCollection(arr, MultiShape);
  };
 
}

//
//
function ShapeCollection(shapes) {
  this.getShapesInBounds = function(bb) {
    // TODO: could avoid checking individual bounds at full extent
    var arr = Utils.filter(shapes, function(shp) {
      return bb.intersects(shp.bounds);
    });
    return arr;
  };

  this.getAllShapes = function() {
    return shapes;
  };
}

//
function MultiShape(src, parts) {
  this.bounds = src.getMultiShapeBounds(parts);
  this.partCount = part.length;
  this.getShapeIter = function(i) {
    return src.getShapeIter(parts[i]);
  };
}

function Shape(src, ids) {
  this.bounds = src.getShapeBounds(ids);
  this.partCount = 1;
  this.getShapeIter = function() {
    return src.getShapeIter(ids);
  };
}

function Arc(src, id) {
  this.bounds = src.getArcBounds(id);
  this.partCount = 1;
  this.getShapeIter = function() {
    return src.getArcIter(id);
  };
}



function ShapeIter(arcs) {
  var _ids, _arc = null;
  var i, n;

  this.init = function(ids) {
    _ids = ids;
    i = -1;
    n = ids.length;
    _arc = nextArc();
  };

  function nextArc() {
    i += 1;
    return (i < n) ? arcs.getArcIter(_ids[i]) : null;
  }

  this.hasNext = function() {
    while (_arc != null) {
      if (_arc.hasNext()) {
        this.x = _arc.x;
        this.y = _arc.y;
        return true;
      } else {
        _arc = nextArc();
      }
    }
    return false;
  };
}


function ArcIter() {
  var _xx, _yy, _zz, _zlim;
  var i, inc, stop;

  this.init = function(xx, yy, fw, zz, lim) {
    var len = xx.length;
    _xx = xx, _yy = yy, _zz = zz, _zlim = lim;
    if (fw) {
      i = 0;
      inc = 1;
      stop = len;
    } else {
      i = len - 1;
      inc = -1;
      stop = -1;
    }
    this.hasNext = zz ? nextSimpleXY : nextXY;
  };

  function nextXY() {
    if (i == stop) {
      return false;
    }
    this.x = _xx[i];
    this.y = _yy[i];
    i += inc;
    return true;
  }


  function nextSimpleXY() {
    var z;
    if (i == stop) {
      return false;
    }
    this.x = _xx[i];
    this.y = _yy[i];
    // iterate to next i
    i += inc;
    while (i != stop) {
      z = _zz[i];
      if (z >= _zlim) break;
      i += inc;
    }
    return true;
  }
};

