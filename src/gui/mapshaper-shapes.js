/* @requires mapshaper-common, mapshaper-geom, bounds, sorting */

MapShaper.calcArcBounds = function(xx, yy) {
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);
  return [xb.min, yb.min, xb.max, yb.max];
};

// An interface for a set of topological arcs and the layers derived from the arcs.
// @arcs is an array of polyline arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
function ArcDataset(coords) {

  var _arcs = coords,
      _thresholds = null,
      _sortedThresholds = null,
      filteredIds = null,
      filteredSegLen = 0,
      zlimit = 0;

  var arcIter = new ArcIter();
  var boxes = [],
      _bounds = new Bounds();
  for (var i=0, n=_arcs.length; i<n; i++) {
    var b = MapShaper.calcArcBounds(_arcs[i][0], _arcs[i][1]);
    _bounds.mergeBounds(b);
    boxes.push(b);
  }

  this.getArcIter = function(i, mpp) {
    var arc = _arcs[i],
        filteredIds = this.getFilteredIds(i, mpp),
        fw = i >= 0;
    if (!fw) {
      i = -i - 1;
    }
    if (zlimit) {
      arcIter.init(arc[0], arc[1], fw, _thresholds[i], zlimit, filteredIds);
    } else {
      arcIter.init(arc[0], arc[1], fw, null, null, filteredIds);
    }
    return arcIter;
  };

  // Add simplification data to the dataset
  // @arr is an array of arrays of removal thresholds for each arc-vertex.
  //
  this.setThresholds = function(thresholds) {
    _thresholds = thresholds;

    // Sort simplification thresholds for all non-endpoint vertices
    // ... to quickly convert a simplification percentage to a threshold value.
    // ... for large datasets, use every nth point, for faster sorting.
    var innerCount = MapShaper.countInnerPoints(thresholds);
    var nth = 1;
    if (innerCount > 1e7) nth = 16;
    else if (innerCount > 5e6) nth = 8;
    else if (innerCount > 1e6) nth = 4;
    else if (innerCount > 5e5) nth = 2;
    _sortedThresholds = MapShaper.getInnerThresholds(thresholds, nth);
    Utils.quicksort(_sortedThresholds, false);

    // Calculate a filtered version of each arc, for fast rendering when zoomed out
    var filterPct = 0.08;
    var filterZ = _sortedThresholds[Math.floor(filterPct * _sortedThresholds.length)];
    filteredIds = initFilteredArcs(thresholds, filterZ);
    filteredSegLen = calcAvgFilteredSegLen(_arcs, filteredIds);
  };

  function calcAvgFilteredSegLen(arcs, filtered) {
    var segCount = 0, pathLen = 0;
    Utils.forEach(filtered, function(ids, arcId) {
      var xx = arcs[arcId][0],
          yy = arcs[arcId][1],
          x, y, prevX, prevY, idx;
      for (var i=0, n=ids.length; i<n; i++) {
        idx = ids[i];
        x = xx[idx];
        y = yy[idx];
        if (i > 0) {
          segCount++;
          pathLen += Math.sqrt(distanceSq(prevX, prevY, x, y));
        }
        prevX = x;
        prevY = y;
      }
    });
    return pathLen / segCount;
  }

  // Generate arrays of coordinate ids, representing a simplified view of a collection of arcs
  //
  function initFilteredArcs(thresholds, zlim) {
    return Utils.map(thresholds, function(zz, j) {
      var ids = [];
      for (var i=0, n=zz.length; i<n; i++) {
        if (zz[i] >= zlim) ids.push(i);
      }
      return ids;
    });
  };

  this.getFilteredIds = function(i, mpp) {
    var ids = (filteredIds && filteredSegLen < mpp * 0.5) ? filteredIds[i] : null;
    return ids;
  };

  this.setRetainedPct = function(pct) {
    if (!_sortedThresholds) error ("Missing threshold data.");
    if (pct >= 1) {
      zlimit = 0;
    } else {
      zlimit = _sortedThresholds[Math.floor(pct * _sortedThresholds.length)];
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
    return _arcs.length;
  };

  this.getBounds = function() {
    return _bounds;
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

  this.getPolygonShape = function(arr) {
    if (!arr || arr.length == 0) {
      return new NullShape();
    // } else if (arr.length == 1) {
    //  return new SimpleShape(this).init(arr[0]);
    } else {
      return new MultiShape(this).init(arr);
    }
  }
}

//
//
function ShapeTable(arr, src) {
  this.shapes = function() {
    return new ShapeCollection(arr, src.getBounds());
  };

  this.forEach = function(cb) {
    for (var i=0, n=arr.length; i<n; i++) {
      cb(arr[i], i);
    }
  };

  // TODO: add method so layer can determine if vertices can be displayed at current scale
}

// An iterable collection of shapes, for drawing paths on-screen
//   and for exporting shape data.
//
function ShapeCollection(arr, collBounds) {
  var _filterBounds,
      _transform;

  var getPathIter = function() {
    return function(s, i) {
      return s.getPathIter(i);
    };
  };

  this.filterPaths = function(b) {
    _filterBounds = b;
    getPathIter = getDrawablePathsIter;
    return this;
  };

  this.filterPoints = function(b) {
    _filterBounds = b;
    getPathIter = getDrawablePointsIter;
    return this;
  }

  this.transform = function(tr) {
    _transform = tr;
    if (_filterBounds) {
      _filterBounds = _filterBounds.clone().transform(tr);
    }
    return this;
  };

  // Wrap path iterator to filter out offscreen points
  //
  function getDrawablePointsIter() {
    var bounds = _filterBounds || error("#getDrawablePointsIter() missing bounds");
    var src = getDrawablePathsIter(),
        wrapped;
    var wrapper = {
      x: 0,
      y: 0,
      node: false,
      hasNext: function() {
        var path = wrapped;
        while (path.hasNext()) {
          if (bounds.containsPoint(path.x, path.y)) {
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
      wrapped = src(s, i);
      return wrapper;
    };
  }

  // Wrap vector path iterator to convert geographic coordinates to pixels
  //   and skip over invisible clusters of points (i.e. smaller than a pixel)
  //
  function getDrawablePathsIter() {
    var transform = _transform || error("#getDrawablePathsIter() Missing a Transform object; remember to call .transform()");
    var wrapped,
        _firstPoint;

    var wrapper = {
      x: 0,
      y: 0,
      node: false,
      hasNext: function() {
        var t = transform, mx = t.mx, my = t.my, bx = t.bx, by = t.by;
        var path = wrapped,
            isFirst = _firstPoint,
            x, y, prevX, prevY,
            minSeg = 0.6,
            i = 0;
        if (!isFirst) {
          prevX = this.x;
          prevY = this.y;
        }
        while (path.hasNext()) {
          i++;
          x = path.x * mx + bx;
          y = path.y * my + by;
          if (isFirst || Math.abs(x - prevX) > minSeg || Math.abs(y - prevY) > minSeg) {
            break;
          }
        }
        if (i == 0) return false;
        _firstPoint = false;
        this.x = x;
        this.y = y;
        this.node = path.node;
        return true;
      }
    };

    return function(s, i) {
      _firstPoint = true;
      wrapped = s.getPathIter(i, 1/_transform.mx);
      return wrapper;
    }
  }

  this.forEach = function(cb) {
    var allIn = true,
        filterOnSize = _transform && _filterBounds,
        minPathSize, geoBounds, geoBBox;

    if (filterOnSize) {
      minPathSize = 0.9 / _transform.mx;
      geoBounds = _filterBounds.clone().transform(_transform.invert());
      geoBBox = geoBounds.toArray();
      allIn = geoBounds.contains(collBounds);
    }
    var path = getPathIter();

    for (var i=0, n=arr.length; i<n; i++) {
      var shp = arr[i];
      if (filterOnSize && shp.smallerThan(minPathSize)) continue;  // problem: won't filter out multi-part shapes with tiny parts
      if (!allIn && !shp.inBounds(geoBBox)) continue;
      for (var j=0; j<shp.partCount; j++) {
        cb(path(shp, j));
      }
    }
  };

  this.toArray = function() {
    var arcs = [];
    this.forEach(function(iter) {
      var xx = [], yy = [];
      while(iter.hasNext()) {
        xx.push(iter.x);
        yy.push(iter.y);
      }
      arcs.push([xx, yy]);
    });
    return arcs;
  };
}

// TODO: finish
//
function NullShape() {
  error("NullShape() not implemented")
}

NullShape.prototype = {
  partCount: 0,
  init: function() {return this}
};


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
  getPathIter: function(i, mpp) {
    return this.src.getArcIter(this.id, mpp);
  },
  inBounds: function(bbox) {
    return this.src.testArcIntersection(bbox, this.id);
  },
  getBounds: function() {
    return this.bounds;
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
  getPathIter: function(i, mpp) {
    return this.src.getShapeIter(this.parts[i], mpp);
  },
  getPath: function(i) {
    if (i < 0 || i >= this.parts.length) error("MultiShape#getPart() invalid part id:", i);
    return new SimpleShape(this.src).init(this.parts[i]);
  },
  getBounds: function() {
    return this.bounds;
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
  getPathIter: function(mpp) {
    return this.src.getShapeIter(this.ids, mpp);
  },
  getBounds: function() {
    return this.bounds;
  },
  inBounds: function(bbox) {
    return this.src.testShapeIntersection(bbox, this.ids);
  },
  smallerThan: Arc.prototype.smallerThan
};


// Iterate along the points of an arc
// properties: x, y, node (boolean, true if points is an arc endpoint)
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
  var next;

  this.hasNext = function() {
    var i = next();
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
      next = zz ? nextFilteredSimpleIdx : nextFilteredIdx;
    } else {
      next = zz ? nextSimpleIdx : nextIdx;
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

  function nextIdx() {
    var i = _i;
    if (i == _stop) return -1;
    _i = i + _inc;
    return i;
  }

  function nextSimpleIdx() {
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

  function nextFilteredIdx() {
    var i = _i;
    if (i == _stop) return -1;
    _i = i + _inc;
    return _ww[i];
  }

  function nextFilteredSimpleIdx() {
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