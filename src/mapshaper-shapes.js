/* @requires mapshaper-common, mapshaper-geom */

MapShaper.ArcDataset = ArcDataset;

// An interface for managing a collection of paths.
// Constructor signatures:
//
// ArcDataset(arcs)
//    arcs is an array of polyline arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
// ArcDataset(nn, xx, yy, zz)
//    nn is an array of arc lengths; xx, yy are arrays of concatenated coords;
//    zz (optional) is an array of concatenated simplification thresholds
//
function ArcDataset() {
  var _self = this;
  var _xx, _yy,  // coordinates data
      _ii, _nn,  // indexes, sizes
      _zz, _zlimit = 0, // simplification
      _bb, _allBounds, // bounding boxes
      _arcIter, _shapeIter; // path iterators

  if (arguments.length == 1) {
    initLegacyArcs(arguments[0]);  // want to phase this out
  } else if (arguments.length >= 3) {
    initPathData.apply(this, arguments);
  } else {
    error("ArcDataset() Invalid arguments");
  }

  function initLegacyArcs(coords) {
    var data = convertLegacyArcs(coords);
    initPathData(data.nn, data.xx, data.yy, data.zz);
  }

  function initPathData(nn, xx, yy, zz) {
    var size = nn.length;
    _xx = xx;
    _yy = yy;
    _nn = nn;
    _zz = zz || new Float64Array(xx.length);

    // generate array of starting idxs of each arc
    _ii = new Uint32Array(size);
    for (var idx = 0, j=0; j<size; j++) {
      _ii[j] = idx;
      idx += nn[j];
    }

    if (idx != _xx.length || _xx.length != _yy.length || _xx.length != _zz.length) {
      error("ArcDataset#initPathData() Counting error");
    }

    initBounds();

    // Pre-allocate some path iterators for repeated use.
    _arcIter = new ArcIter(_xx, _yy, _zz);
    _shapeIter = new ShapeIter(_self);
    return this;
  }

  function initBounds() {
    var data = calcArcBounds(_xx, _yy, _nn);
    _bb = data.bb;
    _allBounds = data.bounds;
  }

  function calcArcBounds(xx, yy, nn) {
    var numArcs = nn.length,
        bb = new Float64Array(numArcs * 4),
        arcOffs = 0,
        arcLen,
        j, b;
    for (var i=0; i<numArcs; i++) {
      arcLen = nn[i];
      b = MapShaper.calcArcBounds(xx, yy, arcOffs, arcLen);
      j = i * 4;
      bb[j++] = b[0];
      bb[j++] = b[1];
      bb[j++] = b[2];
      bb[j] = b[3];
      arcOffs += arcLen;
    }
    var bounds = new Bounds();
    if (numArcs > 0) bounds.setBounds(MapShaper.calcArcBounds(xx, yy));
    return {
      bb: bb,
      bounds: bounds
    };
  }

  function convertLegacyArcs(coords) {
    var numArcs = coords.length;

    // Generate arrays of arc lengths and starting idxs
    var nn = new Uint32Array(numArcs),
        pointCount = 0,
        useZ = false,
        arc, arcLen;
    for (var i=0; i<numArcs; i++) {
      arc = coords[i];
      arcLen = arc && arc[0].length || 0;
      useZ = useZ || arc.length > 2;
      nn[i] = arcLen;
      pointCount += arcLen;
      if (arcLen === 0) error("#convertArcArrays() Empty arc:", arc);
    }

    // Copy x, y coordinates into long arrays
    var xx = new Float64Array(pointCount),
        yy = new Float64Array(pointCount),
        zz = useZ ? new Float64Array(pointCount) : null,
        offs = 0;
    coords.forEach(function(arc, arcId) {
      var xarr = arc[0],
          yarr = arc[1],
          zarr = arc[2] || null,
          n = nn[arcId];
      for (var j=0; j<n; j++) {
        xx[offs + j] = xarr[j];
        yy[offs + j] = yarr[j];
        if (useZ) zz[offs + j] = zarr[j];
      }
      offs += n;
    });
    return {
      xx: xx,
      yy: yy,
      zz: zz,
      nn: nn
    };
  }

  // Give access to raw data arrays...
  this.getVertexData = function() {
    return {
      xx: _xx,
      yy: _yy,
      zz: _zz,
      bb: _bb,
      nn: _nn,
      ii: _ii
    };
  };

  this.getCopy = function() {
    return new ArcDataset(new Int32Array(_nn), new Float64Array(_xx),
        new Float64Array(_yy), new Float64Array(_zz));
  };

  this.getFilteredCopy = function() {
    var len2 = this.getFilteredPointCount();
    if (len2 == this.getPointCount()) {
      return this.getCopy();
    }

    var xx2 = new Float64Array(len2),
        yy2 = new Float64Array(len2),
        zz2 = new Float64Array(len2),
        nn2 = new Int32Array(this.size()),
        i2 = 0;

    this.forEach2(function(i, n, xx, yy, zz, arcId) {
      var n2 = 0;
      for (var end = i+n; i < end; i++) {
        if (_zz[i] >= _zlimit) {
          xx2[i2] = xx[i];
          yy2[i2] = yy[i];
          zz2[i2] = zz[i];
          i2++;
          n2++;
        }
      }
      if (n2 < 2) error("Collapsed arc"); // endpoints should be z == Infinity
      nn2[arcId] = n2;
    });

    return new ArcDataset(nn2, xx2, yy2, zz2);
  };

  // Return arcs as arrays of [x, y] points (intended for testing).
  this.toArray = function() {
    return Utils.range(this.size()).map(function(i) {
      return _self.getArc(i).toArray();
    });
  };

  this.toArray2 = function() {
    var arr = [];
    this.forEach3(function(xx, yy, zz) {
      var path = [Utils.toArray(xx), Utils.toArray(yy), Utils.toArray(zz)];
      arr.push(path);
    });
    return arr;
  };

  // Snap coordinates to a grid of @quanta locations on both axes
  // This may snap nearby points to the same coordinates.
  // Consider a cleanup pass to remove dupes, make sure collapsed arcs are
  //   removed on export.
  //
  this.quantize = function(quanta) {
    var bb1 = this.getBounds(),
        bb2 = new Bounds(0, 0, quanta-1, quanta-1),
        transform = bb1.getTransform(bb2),
        inverse = transform.invert();

    this.applyTransform(transform, true);
    this.applyTransform(inverse);
  };

  this.getAverageSegment = function(nth) {
    return MapShaper.getAverageSegment(this.getSegmentIter(), nth);
  };

  /*
  this.getNextId = function(i) {
    var n = _xx.length,
        zlim = _zlimit;
    while (++i < n) {
      if (zlim === 0 || _zz[i] >= zlim) return i;
    }
    return -1;
  };

  this.getPrevId = function(i) {
    var zlim = _zlimit;
    while (--i >= 0) {
      if (zlim === 0 || _zz[i] >= zlim) return i;
    }
    return -1;
  }; */

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

  this.getSegmentIter = function() {
    return MapShaper.getSegmentIter(_xx, _yy, _nn, _zz, _zlimit);
  };

  this.forEachSegment = function(cb) {
    this.getSegmentIter()(cb, 1);
  };

  this.forNthSegment = function(cb, nth) {
    this.getSegmentIter()(cb, nth);
  };

  // Return an ArcIter object for each path in the dataset
  //
  this.forEach = function(cb) {
    for (var i=0, n=this.size(); i<n; i++) {
      cb(this.getArcIter(i), i);
    }
  };

  // Iterate over arcs with access to low-level data
  //
  this.forEach2 = function(cb) {
    for (var arcId=0, n=this.size(); arcId<n; arcId++) {
      cb(_ii[arcId], _nn[arcId], _xx, _yy, _zz, arcId);
    }
  };

  this.forEach3 = function(cb) {
    var start, end, xx, yy, zz;
    for (var arcId=0, n=this.size(); arcId<n; arcId++) {
      start = _ii[arcId];
      end = start + _nn[arcId];
      xx = _xx.subarray(start, end);
      yy = _yy.subarray(start, end);
      zz = _zz.subarray(start, end);
      cb(xx, yy, zz, arcId);
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

  /*
  function copyElements(src, i, dest, j, n) {
    if (src === dest && j > i) error ("copy error");
    for (var k=0; k<n; k++) {
      dest[k + j] = src[k + i];
    }
  }
  */

  function condenseArcs(map) {
    var goodPoints = 0,
        goodArcs = 0,
        copyElements = MapShaper.copyElements,
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

    initPathData(_nn.subarray(0, goodArcs), _xx.subarray(0, goodPoints),
        _yy.subarray(0, goodPoints), _zz.subarray(0, goodPoints));
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
    if (thresholds.length != this.size())
      error("ArcDataset#setThresholds() Mismatched arc/threshold counts.");
    var i = 0;
    thresholds.forEach(function(arr) {
      var zz = _zz;
      for (var j=0, n=arr.length; j<n; i++, j++) {
        zz[i] = arr[j];
      }
    });

    return this;
  };

  this.getRetainedInterval = function() {
    return _zlimit;
  };

  this.setRetainedInterval = function(z) {
    _zlimit = z;
    return this;
  };

  this.setRetainedPct = function(pct) {
    if (pct >= 1) {
      _zlimit = 0;
    } else {
      _zlimit = this.getThresholdByPct(pct);
      _zlimit = MapShaper.clampIntervalByPct(_zlimit, pct);
    }
    return this;
  };

  // Return array of z-values that can be removed for simplification
  //
  this.getRemovableThresholds = function(nth) {
    if (!_zz) error("Missing simplification data");
    var skip = nth | 1,
        arr = new Float64Array(Math.ceil(_zz.length / skip)),
        z;
    for (var i=0, j=0, n=this.getPointCount(); i<n; i+=skip) {
      z = _zz[i];
      if (z != Infinity) {
        arr[j++] = z;
      }
    }
    return arr.subarray(0, j);
  };

  this.getArcThresholds = function(arcId) {
    if (!(arcId >= 0 && arcId < this.size())) {
      error("ArcDataset#getArcThresholds() invalid arc id:", arcId);
    }
    var start = _ii[arcId],
        end = start + _nn[arcId];
    return _zz.subarray(start, end);
  };

  this.getThresholdByPct = function(pct) {
    var tmp = this.getRemovableThresholds(),
        rank, z;
    if (tmp.length === 0) { // No removable points
      rank = 0;
    } else {
      rank = Math.floor((1 - pct) * (tmp.length + 2));
    }

    if (rank <= 0) {
      z = 0;
    } else if (rank > tmp.length) {
      z = Infinity;
    } else {
      z = Utils.findValueByRank(tmp, rank);
    }
    return z;
  };

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

  this.getFilteredPointCount = function() {
    var zz = _zz, z = _zlimit;
    if (!zz || !z) return this.getPointCount();
    var count = 0;
    for (var i=0, n = zz.length; i<n; i++) {
      if (zz[i] >= z) count++;
    }
    return count;
  };

  this.getBounds = function() {
    return _allBounds;
  };

  this.getSimpleShapeBounds = function(arcIds, bounds) {
    bounds = bounds || new Bounds();
    for (var i=0, n=arcIds.length; i<n; i++) {
      this.mergeArcBounds(arcIds[i], bounds);
    }
    return bounds;
  };

  this.getMultiShapeBounds = function(shapeIds, bounds) {
    bounds = bounds || new Bounds();
    if (shapeIds) { // handle null shapes
      for (var i=0, n=shapeIds.length; i<n; i++) {
        this.getSimpleShapeBounds(shapeIds[i], bounds);
      }
    }
    return bounds;
  };

  this.mergeArcBounds = function(arcId, bounds) {
    if (arcId < 0) arcId = ~arcId;
    var offs = arcId * 4;
    bounds.mergeBounds(_bb[offs], _bb[offs+1], _bb[offs+2], _bb[offs+3]);
  };

  this.getArc = function(id) {
    return new Arc(this).init(id);
  };

  this.getMultiPathShape = function(arr) {
    if (!arr || arr.length > 0 === false) {
      error("#getMultiPathShape() Missing arc ids");
    } else {
      return new MultiShape(this).init(arr);
    }
  };
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
    this.pathCount = parts ? parts.length : 0;
    this.parts = parts || [];
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
    return this.parts.map(function(ids) {
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
  this.hasNext = nextIdx;
  this.x = this.y = 0;
  this.i = -1;

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
    this.i = i; // experimental
    if (isNaN(i) || isNaN(this.x)) throw "not a number";
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
    } while (j != stop && zz[j] < zlim);
    _i = j;
    this.x = _xx[i];
    this.y = _yy[i];
    this.i = i; // experimental
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
    n = ids.length;
    this.reset();
  };

  function nextArc() {
    i += 1;
    return (i < n) ? arcs.getArcIter(_ids[i]) : null;
  }

  this.reset = function() {
    i = -1;
    _arc = nextArc();
  };

  this.hasNext = function() {
    while (_arc) {
      if (_arc.hasNext()) {
        this.x = _arc.x;
        this.y = _arc.y;
        return true;
      } else {
        _arc = nextArc();
        if (_arc) _arc.hasNext(); // skip first point of arc
      }
    }
    return false;
  };
}

MapShaper.clampIntervalByPct = function(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
};

// Return id of the vertex between @start and @end with the highest
// threshold that is less than @zlim.
//
MapShaper.findNextRemovableVertex = function(zz, zlim, start, end) {
  var tmp, jz = 0, j = -1, z;
  if (start > end) {
    tmp = start;
    start = end;
    end = tmp;
  }
  for (var i=start+1; i<end; i++) {
    z = zz[i];
    if (z < zlim && z > jz) {
      j = i;
      jz = z;
    }
  }
  return j;
};

// Return average magnitudes of dx, dy
// @iter Function returned by getSegmentIter()
//
MapShaper.getAverageSegment = function(iter, nth) {
  var count = 0,
      dx = 0,
      dy = 0;
  iter(function(i1, i2, xx, yy) {
    dx += Math.abs(xx[i1] - xx[i2]);
    dy += Math.abs(yy[i1] - yy[i2]);
    count++;
  }, nth);
  return [dx / count, dy / count];
};

MapShaper.getSegmentIter = function(xx, yy, nn, zz, zlim) {
  return function forNthSegment(cb, nth) {
    var filtered = zlim > 0,
        nextArcStart = 0,
        arcId = -1,
        count = 0,
        id1, id2, retn;
    nth = nth > 1 ? Math.floor(nth) : 1;
    for (var k=0, n=xx.length; k<n; k++) {
      if (!filtered || zz[k] >= zlim) { // check: > or >=
        id1 = id2;
        id2 = k;
        if (k < nextArcStart) {
          count++;
          if (nth == 1 || count % nth === 0) {
            cb(id1, id2, xx, yy);
          }
        } else {
          do {
            arcId++;
            nextArcStart += nn[arcId];
          } while (nextArcStart <= k); // handle empty paths
        }
      }
    }
  };
};
