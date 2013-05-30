/* @requires mapshaper-common, mapshaper-index, core.geo, bounds */

MapShaper.calcArcBounds = function(xx, yy) {
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);
  return [xb.min, yb.min, xb.max, yb.max];
};

// ArcCollection ...
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

  this.getShapeIter = function(ids) {
    var iter = new ShapeIter(this);
    iter.init(ids);
    return iter;
  }

  this.testArcIntersection = function(b1, i) {
    var b2 = boxes[i];
    return b2[0] <= b1[2] && b2[2] >= b1[0] && b2[3] >= b1[1] && b2[1] <= b1[3];
  };

  this.testShapeIntersection = function(bbox, ids) {
    for (var i=0, n=ids.length; i<n; i++) {
      if (this.testArcIntersection(bbox, ids[i])) return true;
    }
    return false;
  };

  this.testMultiShapeIntersection = function(bbox, parts) {
    for (var i=0, n=parts.length; i<n; i++) {
      if (this.testShapeIntersection(bbox, parts[i])) return true;
    }
    return true;
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
    return new ShapeCollection(shapes, bounds);
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
function ShapeCollection(shapes, bounds) {
  this.getShapesInBounds = function(bb) {
    if (bb.contains(bounds)) return shapes;
    var arr = [],
        bbox = bb.toArray();
    for (var i=0, n=shapes.length; i<n; i++) {
      var shp = shapes[i];
      if (shp.inBounds(bbox)) arr.push(shp);
    }
    return arr;
  };

  this.getAllShapes = function() {
    return shapes;
  };
}

//
function MultiShape(src, parts) {
  this.partCount = part.length;
  this.getShapeIter = function(i) {
    return src.getShapeIter(parts[i]);
  };
  this.inBounds = function(bbox) {
    return src.testMultiShapeIntersection(bbox, parts);
  };
}

function Shape(src, ids) {
  this.partCount = 1;
  this.getShapeIter = function() {
    return src.getShapeIter(ids);
  };
  this.inBounds = function(bbox) {
    return src.testShapeIntersection(bbox, ids);
  };
}

function Arc(src, id) {
  this.partCount = 1;
  this.getShapeIter = function() {
    return src.getArcIter(id);
  };
  this.inBounds = function(bbox) {
    return src.testArcIntersection(bbox, id);
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

  // TODO: finish
  //
  function nextFilteredXY() {
    var z, idx;
    if (i == stop) {
      return false;
    }
    idx = _ww[i];
    this.x = _xx[idx];
    this.y = _yy[idx];
    i += inc;
    while (i != stop) {
      idx = _ww[i];
      z = _zz[idx];
      if (z >= _zlim) break;
      i += inc;
    }
    return true;
  }


};

