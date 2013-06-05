/* @requires mapshaper-common, mapshaper-index, core.geo, bounds, median */

MapShaper.calcArcBounds = function(xx, yy) {
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);
  return [xb.min, yb.min, xb.max, yb.max];
};

// An interface for a set of topological arcs and the layers derived from the arcs.
// @coords is an array of arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
function ArcDataset(coords) {

  var boxes = [],
      bounds = new Bounds();

  var thresholds = null,
      filteredIds = null,
      filteredSegLen = 0,
      sorted = null,
      zlimit = 0;

  var bbox;
  for (var i=0, n=coords.length; i<n; i++) {
    bbox = MapShaper.calcArcBounds(coords[i][0], coords[i][1]);
    bounds.mergeBounds(bbox);
    boxes.push(bbox);
  }

  var arcIter = new ArcIter();
  // var shapeIter = new ShapeIter(this);

  this.getArcIter = function(i, mpp) {
    var fw = i >= 0;
    if (!fw) {
      i = -i - 1;
    }
    var xx = coords[i][0],
        yy = coords[i][1],
        filteredIds = this.getFilteredIds(i, mpp);

    if (zlimit) {
      arcIter.init(xx, yy, fw, thresholds[i], zlimit, filteredIds);
    } else {
      arcIter.init(xx, yy, fw, null, null, filteredIds);
    }

    return arcIter;
  };

  this.setThresholds = function(arr) {
    T.start();
    var innerCount = MapShaper.countInnerPoints(arr);
    var nth = 1;
    if (innerCount > 1e7) nth = 16;
    else if (innerCount > 5e6) nth = 8;
    else if (innerCount > 1e6) nth = 4;
    else if (innerCount > 5e5) nth = 2;
    sorted = MapShaper.getInnerThresholds(arr, nth);
    Utils.quicksort(sorted, false);
    initFilteredArcs(arr);
    thresholds = arr;
  };

  function initFilteredArcs(thresholds) {
    var filterPct = 0.08;
    var filterZ = sorted[Math.floor(filterPct * sorted.length)];

    T.start();
    var segCount = 0, tot = 0;
    filteredIds = Utils.map(thresholds, function(zz, j) {
      var arr = [],
          xx = coords[j][0],
          yy = coords[j][1],
          x, y, prevX, prevY;
      for (var i=0, n=zz.length; i<n; i++) {
        if (zz[i] >= filterZ) {
          x = xx[i];
          y = yy[i];
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
      zlimit = sorted[Math.floor(pct * sorted.length)];
    }
  };

  this.getShapeIter = function(ids, mpp) {
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
    return coords.length;
  };

  this.getBounds = function() {
    return bounds;
  };

  this.getShapeTable = function(data, ShapeClass) {
    var shapes = Utils.map(data, function(datum, i) {
      return new ShapeClass(this).init(datum);
    }, this);
    return new ShapeTable(shapes, this);
  };

  this.getArcs = function() {
    return this.getShapeTable(Utils.range(this.size()), Arc);
  };

  this.getSimpleShapes = function(arr) {
    return this.getShapeTable(arr, SimpleShape);
  };

  this.getMultiShapes = function(arr) {
    return this.getShapeTable(arr, MultiShape);
  };


  // merge B into A
  function mergeBounds(a, b) {
    if (b[0] < a[0]) a[0] = b[0];
    if (b[1] < a[1]) a[1] = b[1];
    if (b[2] > a[2]) a[2] = b[2];
    if (b[3] > a[3]) a[3] = b[3];
  }
}

//
//
function ShapeTable(arr, src) {
  this.shapes = function() {
    return new ShapeCollection(arr, src.getBounds());
  };

  // TODO: add method so layer can determine if vertices can be displayed at current scale
}

// An iterable collection of shapes, for drawing paths on-screen
//   and for exporting shape data.
//
function ShapeCollection(arr, collBounds) {
  var _visibleBounds,
      _perPixelScale,
      _filterPoints = false,
      _transform;

  this.boundsFilter = function(b, filterPoints) {
    _visibleBounds = b;
    _filterPoints = !!filterPoints;
    return this;
  };

  this.transform = function(tr) {
    _transform = tr;
    _perPixelScale = 1/tr.mx;
    return this;
  };

  // Wrap path iterator to filter out offscreen points
  //
  function getDrawablePointsIter() {
    var pixBounds = _visibleBounds.clone().transform(_transform);
    var src = getDrawablePathsIter(),
        srcIter;
    var iter = {
      x: 0,
      y: 0,
      node: false,
      hasNext: function() {
        var path = srcIter;
        while (path.hasNext()) {
          if (pixBounds.containsPoint(path.x, path.y)) {
            this.x = path.x;
            this.y = path.y;
            this.node = path.node;
            return true;
          }
        }
        return false;
      }
    };

    return function(s, i) {
      srcIter = src(s, i);
      return iter;
    };
  }

  // Wrap vector path iterator to convert geographic coordinates to pixels
  //   and skip over invisible clusters of points (smaller than a pixel)
  //
  function getDrawablePathsIter() {
    var srcIter,
        _first;

    var iter = {
      x: 0,
      y: 0,
      node: false,
      hasNext: function() {
        var t = _transform, mx = t.mx, my = t.my, bx = t.bx, by = t.by;
        var path = srcIter,
            firstPoint = _first,
            x, y, prevX, prevY,
            minSeg = 0.6,
            i = 0;
        if (!firstPoint) {
          prevX = this.x;
          prevY = this.y;
        }
        while (path.hasNext()) {
          i++;
          x = path.x * mx + bx;
          y = path.y * my + by;
          if (firstPoint || Math.abs(x - prevX) > minSeg || Math.abs(y - prevY) > minSeg) {
            break;
          }
        }
        if (i == 0) return false;
        _first = false;
        this.x = x;
        this.y = y;
        this.node = path.node;
        return true;
      }
    };
    return function(s, i) {
      _first = true;
      srcIter = s.getShapeIter(i, 1/_transform.mx)
      return iter;
    }
  }

  //
  //
  function getIter() {
    if (!_transform) {
      return function(s, i) {
        return s.getShapeIter(i);
      }
    } else if (_filterPoints) {
      return getDrawablePointsIter();
    } else {
      return getDrawablePathsIter();
    }
  }

  this.forEach = function(cb) {
    var minShp = 0.9, // pixels
        perPix = _perPixelScale,
        viewBox = _visibleBounds.toArray();
    var allIn = _visibleBounds ? _visibleBounds.contains(collBounds) : true;
    var iter = getIter();

    for (var i=0, n=arr.length; i<n; i++) {
      var shp = arr[i];
      if (perPix && shp.smallerThan(minShp * perPix)) continue;
      if (!allIn && !shp.inBounds(viewBox)) continue;
      for (var j=0; j<shp.partCount; j++) {
        cb(iter(shp, j));
      }
    }
  };

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
  getShapeIter: function(i, mpp) {
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
  getShapeIter: function(i, mpp) {
    return this.src.getShapeIter(this.parts[i], mpp);
  },
  inBounds: function(bbox) {
    return this.src.testMultiShapeIntersection(bbox, this.parts);
  },
  smallerThan: Arc.prototype.smallerThan
};


function SimpleShape(src) {
  this.src = src;
}

SimpleShape.prototype = {
  partCount: 1,
  init: function(ids) {
    this.ids = ids;
    this.bounds = this.src.getShapeBounds(ids);
    return this;
  },
  getShapeIter: function(mpp) {
    return this.src.getShapeIter(this.ids, mpp);
  },
  inBounds: function(bbox) {
    return this.src.testShapeIntersection(bbox, this.ids);
  },
  smallerThan: Arc.prototype.smallerThan
};



// Iterate along the points of an arc
// properties: x, y, node ('node' (boolean), same as endpoint)
// method: hasNext()
// usage:
//   while (iter.hasNext()) {
//     iter.x, iter.y; // do something w/ x & y
//   }
//
function ArcIter() {
  var _xx, _yy, _zz, _zlim, _ww, _len;
  var _i, _inc, _start, _stop;
  this.x = 0;
  this.y = 0;

  var nextIdx;

  this.hasNext = function() {
    var i = nextIdx();
    if (i == -1) return false;
    this.x = _xx[i];
    this.y = _yy[i];
    this.node = i == 0 || i == _len - 1;
    return true;
  };

  this.init = function(xx, yy, fw, zz, lim, ww) {
    _xx = xx, _yy = yy, _zz = zz, _zlim = lim, _ww = ww;
    var len = _len = xx.length;
    if (ww) {
      len = ww.length;
      nextIdx = zz ? nextFilteredSimpleXY : nextFilteredXY;
    } else {
      nextIdx = zz ? nextSimpleXY : nextXY;
    }

    if (fw) {
      _start = 0;
      _inc = 1;
      _stop = len;
    } else {
      _start = len - 1;
      _inc = -1;
      _stop = -1;
    }
    _i = _start;
  };

  function nextXY() {
    var i = _i;
    if (i == _stop) return -1;
    _i = i + _inc;
    return i;
  }

  function nextSimpleXY() {
    // using local vars makes a big difference when skipping many points
    var zz = _zz,
        i = _i,
        j = i,
        zlim = _zlim,
        stop = _stop,
        inc = _inc;
    if (i == stop) return -1;
    do {
      j += inc;
    } while (j != stop && zz[j] < zlim);
    _i = j;
    return i;
  }

  function nextFilteredXY() {
    var i = _i;
    if (i == _stop) return -1;
    _i = i + _inc;
    return _ww[i];
  }

  function nextFilteredSimpleXY() {
    var ww = _ww,
        zz = _zz,
        i = _i,
        j = i,
        zlim = _zlim,
        inc = _inc,
        stop = _stop;

    if (i == stop) return -1;
    do {
      j += inc;
    } while (j != stop && zz[ww[j]] < zlim);
    _i = j;
    return ww[i];
  }
}


// Iterate along a path made up of one or more arcs.
// Similar interface to ArcIter()
//
function ShapeIter(arcs) {
  var _ids, _mpp, _arc = null;
  var i, n;

  this.init = function(ids, mpp) {
    _ids = ids;
    _mpp = mpp;
    i = -1;
    n = ids.length;
    _arc = nextArc();
  };

  function nextArc() {
    i += 1;
    return (i < n) ? arcs.getArcIter(_ids[i], _mpp) : null;
  }

  this.hasNext = function() {
    while (_arc != null) {
      if (_arc.hasNext()) {
        this.x = _arc.x;
        this.y = _arc.y;
        this.node = _arc.node;
        return true;
      } else {
        _arc = nextArc();
        _arc.hasNext(); // skip first point of arc
      }
    }
    return false;
  };
}