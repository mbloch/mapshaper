/* @requires mapshaper-common, mapshaper-geom */

MapShaper.calcArcBounds = function(xx, yy) {
  var xb = Utils.getArrayBounds(xx),
      yb = Utils.getArrayBounds(yy);
  return [xb.min, yb.min, xb.max, yb.max];
};

MapShaper.ArcDataset = ArcDataset;

// An interface for a set of topological arcs and the layers derived from the arcs.
// @arcs is an array of polyline arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
function ArcDataset(coords) {

  var _sortedThresholds = null,
      _zlimit = 0;

  // Temporary: Convert input data by concatenating coords into long arrays
  // and generating other data structures in a similar format
  // TODO: input data will eventually be in the same format, so no conversion required
  //

  // generate array of arc lengths
  var _nn = Utils.map(coords, function(arc) {
    return arc[0].length || 0;
  });
  var _numPoints = Utils.sum(_nn),
      _numArcs = _nn.length;
  _nn = new Uint32Array(_nn);
  var _xx = new Float64Array(_numPoints),
      _yy = new Float64Array(_numPoints),
      _ii = new Uint32Array(_numArcs), // index of first coord in each arc
      _zz = new Float64Array(_numPoints); // this will store simplification thresholds

  var k = 0;
  Utils.forEach(coords, function(arc, i) {
    var xx = arc[0], yy = arc[1], n = xx.length;
    _ii[i] = k;
    for (var j=0; j<n; j++, k++) {
      _xx[k] = xx[j];
      _yy[k] = yy[j];
    }
  });
  if (k != _numPoints) error("Counting problem");



  // calculate bounding boxes for each arc, store in one long array
  var _bb = new Float64Array(_numArcs * 4),
      _allBounds = new Bounds();
  Utils.forEach(_ii, function(start, arcId) {
    var end = start + _nn[arcId] - 1,
        xx = _xx, yy = _yy,
        xmin = Infinity, ymin = Infinity,
        xmax = -Infinity, ymax = -Infinity,
        x, y;

    for (var j=start; j<=end; j++) {
      x = xx[j];
      y = yy[j];
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
    var i = arcId * 4;
    _bb[i++] = xmin;
    _bb[i++] = ymin;
    _bb[i++] = xmax;
    _bb[i] = ymax;
    _allBounds.mergeBounds([xmin, ymin, xmax, ymax]);
  });

  // Pre-allocate some path iterators for repeated use.
  //
  var _arcIter = new ArcIter(_xx, _yy, _zz);
  var _shapeIter = new ShapeIter(this);

  this.getArcIter = function(arcId) {
    var fw = arcId >= 0,
        i = fw ? arcId : ~arcId,
        start = _ii[i],
        len = _nn[i];

    _arcIter.init(start, len, fw, _zlimit || 0);
    return _arcIter;
  };

  this.getShapeIter = function(ids) {
    var iter = _shapeIter;
    iter.init(ids);
    return iter;
  };

  // Add simplification data to the dataset
  // @thresholds is an array of arrays of removal thresholds for each arc-vertex.
  //
  this.setThresholds = function(thresholds) {
    if (thresholds.length != _numArcs) error("ArcDataset#setThresholds() Mismatched arc/threshold counts.")
    var i = 0;
    Utils.forEach(thresholds, function(arr) {
      var zz = _zz;
      for (var j=0, n=arr.length; j<n; i++, j++) {
        zz[i] = arr[j];
      }
    });

    return this;
  };


  this.setThresholdsForGUI = function(thresholds) {
    this.setThresholds(thresholds);

    // Sort simplification thresholds for all non-endpoint vertices
    // ... to quickly convert a simplification percentage to a threshold value.
    // ... For large datasets, use every nth point, for faster sorting.
    var nth = 1;
    if (_numPoints > 1e7) nth = 16;
    else if (_numPoints > 5e6) nth = 8;
    else if (_numPoints > 1e6) nth = 4;
    else if (_numPoints > 5e5) nth = 2;
    _sortedThresholds = getRemovableThresholds(_zz, nth);
    Utils.quicksort(_sortedThresholds, false);

    /*
    // TODO: re-implement filtered arcs after ArcDataset input format changes to
    //    long arrays
    //
    // Calculate a filtered version of each arc, for fast rendering when zoomed out
    var filterPct = 0.08;
    var filterZ = _sortedThresholds[Math.floor(filterPct * _sortedThresholds.length)];
    filteredIds = initFilteredArcs(thresholds, filterZ);
    filteredSegLen = calcAvgFilteredSegLen(_arcs, filteredIds);
    */
  };

  /*
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
  */

  this.setRetainedInterval = function(z) {
    _zlimit = z;
    return this;
  };

  this.setRetainedPct = function(pct) {
    if (pct >= 1) {
      _zlimit = 0;
    } else if (_sortedThresholds) {
      _zlimit = _sortedThresholds[Math.floor(pct * _sortedThresholds.length)];
    } else if (_zz) {
      _zlimit = getThresholdByPct(_zz, pct);
    } else {
      error ("ArcDataset#setRetainedPct() Missing simplification data.")
    }
    return this;
  };

  // TODO: test
  //
  function getRemovableThresholds(zz, skip) {
    skip = skip | 1;
    var tmp = new Float64Array(Math.ceil(zz.length / skip)),
        z;
    for (var i=0, j=0, n=_numPoints; i<n; i+=skip) {
      z = zz[i];
      if (z != Infinity) {
        tmp[j++] = z;
      }
    }
    return tmp.subarray(0, j);
  }

  function getThresholdByPct(zz, pct) {
    if (pct <= 0 || pct >= 1) error("Invalid simplification pct:", pct);
    var tmp = getRemovableThresholds(zz, 1);
    var k = Math.floor((1 - pct) * tmp.length);
    return Utils.findValueByRank(tmp, k + 1); // rank start at 1
  }

  this.arcIntersectsBBox = function(i, b1) {
    var b2 = _bb,
        j = i * 4;
    return b2[j] <= b1[2] && b2[j+2] >= b1[0] && b2[j+3] >= b1[1] && b2[j+1] <= b1[3];
  };

  this.arcIsSmaller = function(i, units) {
    var bb = _bb,
        j = i * 4;
    return bb[j+2] - bb[j] < units && bb[j+3] - bb[j+1] < units;
  };

  this.size = function() {
    return _numArcs;
  };

  this.getBounds = function() {
    return _allBounds;
  };

  this.getArcs = function() {
    var arcs = [];
    for (var i=0, n=this.size(); i<n; i++) {
      arcs.push(new Arc(this).init(i));
    }
    return arcs;
  };

  this.getArc = function(id) {
    return new Arc(this).init(id);
  };

  this.getMultiPathShape = function(arr) {
    if (!arr || arr.length == 0) {
      error("#getMultiPathShape() Missing arc ids")
    } else {
      return new MultiShape(this).init(arr);
    }
  }
}

function Arc(src) {
  this.src = src;
}

Arc.prototype = {
  init: function(id) {
    this.id = id;
    return this;
  },
  pathCount: 1,
  getPathIter: function(i) {
    return this.src.getArcIter(this.id);
  },

  inBounds: function(bbox) {
    return this.src.arcIntersectsBBox(this.id, bbox);
  },

  // Return arc coords as an array of [x, y] points
  toArray: function() {
    var iter = this.getPathIter(),
        coords = [];
    while (iter.hasNext()) {
      coords.push([iter.x, iter.y]);
    }
    return coords;
  },

  smallerThan: function(units) {
    return this.src.arcIsSmaller(this.id, units);
  }
};

//
function MultiShape(src) {
  this.src = src;
}

MultiShape.prototype = {
  init: function(parts) {
    this.pathCount = parts.length;
    this.parts = parts;
    return this;
  },
  getPathIter: function(i) {
    return this.src.getShapeIter(this.parts[i]);
  },
  getPath: function(i) {
    if (i < 0 || i >= this.parts.length) error("MultiShape#getPart() invalid part id:", i);
    return new SimpleShape(this.src).init(this.parts[i]);
  },
  // Return array of SimpleShape objects, one for each path
  getPaths: function() {
    return Utils.map(this.parts, function(ids) {
      return new SimpleShape(this.src).init(ids);
    }, this);
  }
};

function SimpleShape(src) {
  this.src = src;
}

SimpleShape.prototype = {
  pathCount: 1,
  init: function(ids) {
    this.ids = ids;
    return this;
  },
  getPathIter: function() {
    return this.src.getShapeIter(this.ids);
  }
};

// Iterate along the points of an arc
// properties: x, y, node (boolean, true if points is an arc endpoint)
// method: hasNext()
// usage:
//   while (iter.hasNext()) {
//     iter.x, iter.y; // do something w/ x & y
//   }
//
function ArcIter(xx, yy, zz) {
  var _xx = xx,
      _yy = yy,
      _zz = zz,
      _zlim, _len;
  var _i, _inc, _start, _stop;
  this.hasNext = null;

  this.init = function(i, len, fw, zlim) {
    _zlim = zlim;
    this.hasNext = zlim ? nextSimpleIdx : nextIdx;
    if (fw) {
      _start = i;
      _inc = 1;
      _stop = i + len;
    } else {
      _start = i + len - 1;
      _inc = -1;
      _stop = i - 1;
    }
    _i = _start;
  };

  function nextIdx() {
    var i = _i;
    if (i == _stop) return false;
    _i = i + _inc;
    this.x = _xx[i];
    this.y = _yy[i];
    return true;
  }

  function nextSimpleIdx() {
    // using local vars is significantly faster when skipping many points
    var zz = _zz,
        i = _i,
        j = i,
        zlim = _zlim,
        stop = _stop,
        inc = _inc;
    if (i == stop) return false;
    do {
      j += inc;
    } while (j != stop && zz[j] <= zlim);
    _i = j;
    this.x = _xx[i];
    this.y = _yy[i];
    return true;
  }
}


// Iterate along a path made up of one or more arcs.
// Similar interface to ArcIter()
//
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
        _arc && _arc.hasNext(); // skip first point of arc
      }
    }
    return false;
  };
}
