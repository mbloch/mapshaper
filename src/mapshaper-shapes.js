/* @requires mapshaper-common, mapshaper-geom */


MapShaper.ArcDataset = ArcDataset;

// An interface for managing a collection of paths.
//
// @arcs is an array of polyline arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
function ArcDataset(coords) {
  var _self = this;
  var _xx, _yy,  // coordinates data
      _ii, _nn,  // indexes, sizes
      _zz, _zlimit, _sortedThresholds = null, // simplification
      _bb, _allBounds, // bounding boxes
      _arcIter, _shapeIter; // path iterators

  // Temporary: Convert input data by concatenating coords into long arrays
  // and generating other data structures in a similar format
  // TODO: input data will eventually be in the same format, so no conversion required
  //
  init(coords);

  function init(coords) {
    var data = convertArcArrays(coords);
    var zz = new Float64Array(data.xx.length);
    _zlimit = 0;
    updateArcData(data.xx, data.yy, data.nn, zz)
  }

  function updateArcData(xx, yy, nn, zz) {
    var size = nn.length;
    _xx = xx;
    _yy = yy;
    _nn = nn;
    _zz = zz;

    // generate array of starting idxs of each arc
    _ii = new Uint32Array(size);
    for (var idx = 0, j=0; j<size; j++) {
      _ii[j] = idx;
      idx += nn[j];
    }

    initBounds();

    // Pre-allocate some path iterators for repeated use.
    _arcIter = new ArcIter(_xx, _yy, _zz);
    _shapeIter = new ShapeIter(_self);
  }

  function initBounds() {
    var data = calcArcBounds(_xx, _yy, _ii, _nn);
    _bb = data.bb;
    _allBounds = data.bounds;
  }

  function calcArcBounds(xx, yy, ii, nn) {
    var numArcs = ii.length,
        bb = new Float64Array(numArcs * 4),
        j, b;
    for (var i=0; i<numArcs; i++) {
      b = MapShaper.calcArcBounds(xx, yy, ii[i], nn[i]);
      j = i * 4;
      bb[j++] = b[0];
      bb[j++] = b[1];
      bb[j++] = b[2];
      bb[j] = b[3];
    }
    var bounds = new Bounds();
    if (numArcs > 0) bounds.setBounds(MapShaper.calcArcBounds(xx, yy));
    return {
      bb: bb,
      bounds: bounds
    }
  }

  function convertArcArrays(coords) {
    var numArcs = coords.length;

    // Generate arrays of arc lengths and starting idxs
    var nn = new Uint32Array(numArcs),
        pointCount = 0,
        arc, arcLen;
    for (var i=0; i<numArcs; i++) {
      arc = coords[i];
      arcLen = arc && arc[0].length || 0;
      ii[i] = pointCount;
      nn[i] = arcLen;
      pointCount += arcLen;
      if (arcLen == 0) error("#convertArcArrays() Empty arc:", arc);
    }

    // Copy x, y coordinates into long arrays
    var xx = new Float64Array(pointCount),
        yy = new Float64Array(pointCount);
    Utils.forEach(coords, function(arc, arcId) {
      var xarr = arc[0],
          yarr = arc[1],
          n = nn[arcId],
          i = ii[arcId];
      for (var j=0; j<n; j++) {
        xx[i + j] = xarr[j];
        yy[i + j] = yarr[j];
      }
    });

    return {
      xx: xx,
      yy: yy,
      ii: ii,
      nn: nn
    };
  }

  // Return a copy of this ArcDataset, discarding points that fall below current
  // simplification threshold.
  //
  this.getFilteredCopy = function() {
    var arcs = [];
    this.forEach(function(iter, i) {
      var xx = [], yy = [];
      while (iter.hasNext()) {
        xx.push(iter.x);
        yy.push(iter.y);
      }
      arcs.push([xx, yy]);
    });
    return new ArcDataset(arcs);
  };

  // Return arcs as arrays of [x, y] points (intended for testing).
  this.toArray = function() {
    return Utils.map(Utils.range(this.size()), function(i) {
      return _self.getArc(i).toArray();
    });
  };

  // Apply a linear transform to the data, with or without rounding.
  //
  this.applyTransform = function(t, rounding) {
    var xx = _xx, yy = _yy, x, y;
    for (var i=0, n=xx.length; i<n; i++) {
      x = xx[i] * t.mx + t.bx;
      y = yy[i] * t.my + t.by;
      if (rounding) {
        x = Math.round(x);
        y = Math.round(y);
      }
      xx[i] = x;
      yy[i] = y;
    }
    initBounds();
  };

  this.forEach = function(cb) {
    for (var i=0, n=this.size(); i<n; i++) {
      cb(this.getArcIter(i), i);
    }
  };

  // Remove arcs that don't pass a filter test and re-index arcs
  // Return array mapping original arc ids to re-indexed ids. If arr[n] == -1
  // then arc n was removed. arr[n] == m indicates that the arc at n was
  // moved to index m.
  // Return null if no arcs were re-indexed (and no arcs were removed)
  //
  this.filter = function(cb) {
    var map = new Int32Array(this.size()),
        goodArcs = 0,
        goodPoints = 0,
        iter;
    for (var i=0, n=this.size(); i<n; i++) {
      if (cb(this.getArcIter(i), i)) {
        map[i] = goodArcs++;
        goodPoints += _nn[i];
      } else {
        map[i] = -1;
      }
    }
    if (goodArcs === this.size()) {
      return null;
    } else {
      condenseArcs(map);
      if (goodArcs === 0) {
        // no remaining arcs
      }
      return map;
    }
  };

  function copyElements(src, i, dest, j, n) {
    if (src === dest && j > i) error ("copy error")
    var copied = 0;
    for (var k=0; k<n; k++) {
      copied++;
      dest[k + j] = src[k + i];
    }
  }

  function condenseArcs(map) {
    var goodPoints = 0,
        goodArcs = 0,
        k, arcLen;
    for (var i=0, n=map.length; i<n; i++) {
      k = map[i];
      arcLen = _nn[i];
      if (k > -1) {
        copyElements(_xx, _ii[i], _xx, goodPoints, arcLen);
        copyElements(_yy, _ii[i], _yy, goodPoints, arcLen);
        copyElements(_zz, _ii[i], _zz, goodPoints, arcLen);
        _nn[k] = arcLen;
        goodPoints += arcLen;
        goodArcs++;
      }
    }

    updateArcData(_xx.subarray(0, goodPoints), _yy.subarray(0, goodPoints),
        _nn.subarray(0, goodArcs), _zz.subarray(0, goodPoints));

  }

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
    if (thresholds.length != this.size()) error("ArcDataset#setThresholds() Mismatched arc/threshold counts.")
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
    var nth = 1,
        size = this.getPointCount();
    if (size > 1e7) nth = 16;
    else if (size > 5e6) nth = 8;
    else if (size > 1e6) nth = 4;
    else if (size > 5e5) nth = 2;
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

  // Return array of z-values that can be removed for simplification
  //
  function getRemovableThresholds(zz, skip) {
    skip = skip | 1;
    var tmp = new Float64Array(Math.ceil(zz.length / skip)),
        z;
    for (var i=0, j=0, n=_self.getPointCount(); i<n; i+=skip) {
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
    return _ii && _ii.length || 0;
  };

  this.getPointCount = function() {
    return _xx && _xx.length || 0;
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

// Iterate over the points of an arc
// properties: x, y)
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
