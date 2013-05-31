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
      filteredIds = null,
      filteredSegLen = 0,
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

  this.getArcIter = function(i, mpp) {
    var reverse = i < 1;
    if (reverse) {
      i = -i + 1;
    }
    var xx = coords[i][0],
        yy = coords[i][1],
        filteredIds = this.getFilteredIds(i, mpp);

    if (zlimit) {
      arcIter.init(xx, yy, !!reverse, thresholds[i], zlimit, filteredIds);
    } else {
      arcIter.init(xx, yy, !!reverse, null, null, filteredIds); 
    }
    return arcIter;
  };


  this.setThresholds = function(arr) {
    thresholds = arr;

    T.start();
    sorted = MapShaper.getDescendingThresholds(arr, 16);
    T.stop("sort")

    T.start();

    // get vertex ids for a filtered version of each arc, for faster rendering when zoomed out
    var filterPct = 0.08,
        filterZ = sorted[sorted.length * filterPct | 0];

    var segCount = 0,
        tot = 0;
    filteredIds = Utils.map(thresholds, function(zz, j) {
      var arr = [],
          xy = coords[j],
          x, y, prevX, prevY;
      for (var i=0, n=zz.length; i<n; i++) {
        if (zz[i] >= filterZ) {
          x = xy[0][i];
          y = xy[1][i];
          if (i > 0) {
            segCount++;
            tot += Point.distance(prevX, prevY, x, y);
          }
          prevX = x;
          prevY = y;
          arr.push(i);
        }
      }
      return arr;
    });
    filteredSegLen = tot / segCount;
    T.stop('filter')
    trace("segs:", segCount, 'avg:', filteredSegLen);
  };

  this.getFilteredIds = function(i, mpp) {
    var ids = (filteredIds && filteredSegLen < mpp * 0.5) ? filteredIds[i] : null;
    return ids;
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

  this.getShapeIter = function(mpp, ids) {
    var iter = new ShapeIter(this);
    iter.init(ids, mpp);
    return iter;
  };

  this.testArcIntersection = function(b1, i) {
    var b2 = boxes[i];
    return b2[0] <= b1[2] && b2[2] >= b1[0] && b2[3] >= b1[1] && b2[1] <= b1[3];
  };

  this.getArcBounds = function(i) {
    return boxes[i];
  };

  // merge b into a
  function mergeBounds(a, b) {
    if (b[0] < a[0]) a[0] = b[0];
    if (b[1] < a[1]) a[1] = b[1];
    if (b[2] > a[2]) a[2] = b[2];
    if (b[3] > a[3]) a[3] = b[3];
  }

  this.getShapeBounds = function(ids) {
    var bounds = boxes[ids[0]].concat();
    for (var i=1, n=ids.length; i<n; i++) {
      mergeBounds(bounds, boxes[ids[i]]);
    }
    return bounds;
  };

  this.getMultiShapeBounds = function(parts) {
    var bounds = this.getShapeBounds[parts[0]];
    for (var i=1, n=parts.length; i<n; i++) {
      mergeBounds(bounds, this.getShapeBounds(parts[i]));
    }
    return bounds;
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

  this.getShapeCollection = function(data, ShapeClass) {
    var shapes = Utils.map(data, function(datum, i) {
      return new ShapeClass(this).init(datum);
    }, this);
    return new ShapeCollection(shapes, this.getBounds());
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
  var _boundsFilter,
      _scaleFilter;

  this.boundsFilter = function(b) {
    _boundsFilter = b;
    return this;
  };

  this.scaleFilter = function(pixPer) {
    _scaleFilter = 1/pixPer;
    return this;
  };

  this.forEach = function(cb) {
    var minShp = 1, // pixels
        perPix = _scaleFilter,
        viewBox = _boundsFilter.toArray();
    var allIn = _boundsFilter ? _boundsFilter.contains(bounds) : true;

    for (var i=0, n=shapes.length; i<n; i++) {
      var shp = shapes[i];
      if (perPix && shp.smallerThan(minShp * perPix)) continue;
      if (!allIn && !shp.inBounds(viewBox)) continue;
      for (var j=0; j<shp.partCount; j++) {
        cb(shp.getShapeIter(perPix, j));
      }
    }
    reset();
  };

  function reset() {
    _boundsFilter = null;
    _scaleFilter = null;
  }
}

function Arc(src) {
  this.src = src;
}

Arc.prototype = {
  init: function(id) {
    this.id = id;
    this.bounds = this.src.getArcBounds(id);
    return this;
  },
  partCount: 1,
  getShapeIter: function(mpp) {
    return this.src.getArcIter(this.id, mpp);
  },
  inBounds: function(bbox) {
    return this.src.testArcIntersection(bbox, this.id);
  },
  smallerThan: function(units) {
    var b = this.bounds;
    return b[2] - b[0] < units && b[3] - b[1] < units;
  }
};

//
function MultiShape(src) {
  this.src = src;
}

MultiShape.prototype = {
  init: function(parts) {
    this.partCount = parts.length;
    this.parts = parts;
    this.bounds = this.src.getMultiShapeBounds(parts);
    return this;
  },
  getShapeIter: function(mpp, i) {
    return this.src.getShapeIter(mpp, this.parts[i]);
  },
  inBounds: function(bbox) {
    return this.src.testMultiShapeIntersection(bbox, this.parts);
  },
  smallerThan: Arc.prototype.smallerThan
};


function Shape(src) {
  this.src = src;
}

Shape.prototype = {
  partCount: 1,
  init: function(ids) { 
    this.ids = ids;
    this.bounds = this.src.getShapeBounds(ids);
    return this;
  },
  getShapeIter: function(mpp) {
    return this.src.getShapeIter(mpp, this.ids);
  },
  inBounds: function(bbox) {
    return this.src.testShapeIntersection(bbox, this.ids);
  },
  smallerThan: Arc.prototype.smallerThan
};


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
  var _xx, _yy, _zz, _zlim, _ww
  var _i, _inc, _stop;
  this.x = 0;
  this.y = 0;

  this.init = function(xx, yy, fw, zz, lim, ww) {
    var len = ww ? ww.length : xx.length;
    _xx = xx, _yy = yy, _zz = zz, _zlim = lim, _ww = ww;
    if (fw) {
      _i = 0;
      _inc = 1;
      _stop = len;
    } else {
      _i = len - 1;
      _inc = -1;
      _stop = -1;
    }
    if (ww) {
      this.hasNext = zz ? nextFilteredSimpleXY : nextFilteredXY;
    } else {
      this.hasNext = zz ? nextSimpleXY : nextXY;
    }
  };

  function nextXY() {
    if (_i == _stop) return false;
    this.x = _xx[_i];
    this.y = _yy[_i];
    _i += _inc;
    return true;
  }

  function nextSimpleXY() {
    // using local vars makes a big difference when skipping many points
    var zz = _zz,
        i = _i,
        zlim = _zlim,
        stop = _stop,
        inc = _inc;
    if (i == stop) {
      return false;
    }
    this.x = _xx[i];
    this.y = _yy[i];
    do {
      i += inc;
    } while (i != stop && zz[i] < zlim);
    _i = i;
    return true;
  }

  function nextFilteredXY() {
    if (_i == _stop) return false;
    var idx = _ww[_i];
    this.x = _xx[idx];
    this.y = _yy[idx];
    _i += _inc;
    return true;
  }

  function nextFilteredSimpleXY() {
    var ww = _ww,
        zz = _zz,
        i = _i,
        zlim = _zlim,
        inc = _inc,
        stop = _stop;

    if (i == stop) return false;
    this.x = _xx[ww[i]];
    this.y = _yy[ww[i]];
    do {
      i += inc;
    } while (i != stop && zz[ww[i]] < zlim);
    _i = i;
    return true;
  }

};

