/* @requires mapshaper-common, mapshaper-geom, mapshaper-shape-iter */

// export for testing
MapShaper.ArcCollection = ArcCollection;
MapShaper.ArcIter = ArcIter;

// An interface for managing a collection of paths.
// Constructor signatures:
//
// ArcCollection(arcs)
//    arcs is an array of polyline arcs; each arc is an array of points: [[x0, y0], [x1, y1], ... ]
//
// ArcCollection(nn, xx, yy)
//    nn is an array of arc lengths; xx, yy are arrays of concatenated coords;
function ArcCollection() {
  var _xx, _yy,  // coordinates data
      _ii, _nn,  // indexes, sizes
      _zz, _zlimit = 0, // simplification
      _bb, _allBounds, // bounding boxes
      _arcIter, _filteredArcIter; // path iterators

  if (arguments.length == 1) {
    initLegacyArcs(arguments[0]);  // want to phase this out
  } else if (arguments.length == 3) {
    initXYData.apply(this, arguments);
  } else {
    error("ArcCollection() Invalid arguments");
  }

  function initLegacyArcs(arcs) {
    var xx = [], yy = [];
    var nn = arcs.map(function(points) {
      var n = points ? points.length : 0;
      for (var i=0; i<n; i++) {
        xx.push(points[i][0]);
        yy.push(points[i][1]);
      }
      return n;
    });
    initXYData(nn, xx, yy);
  }

  function initXYData(nn, xx, yy) {
    var size = nn.length;
    if (nn instanceof Array) nn = new Uint32Array(nn);
    if (xx instanceof Array) xx = new Float64Array(xx);
    if (yy instanceof Array) yy = new Float64Array(yy);
    _xx = xx;
    _yy = yy;
    _nn = nn;
    _zz = null;
    _filteredArcIter = null;

    // generate array of starting idxs of each arc
    _ii = new Uint32Array(size);
    for (var idx = 0, j=0; j<size; j++) {
      _ii[j] = idx;
      idx += nn[j];
    }

    if (idx != _xx.length || _xx.length != _yy.length) {
      error("ArcCollection#initXYData() Counting error");
    }

    initBounds();
    // Pre-allocate some path iterators for repeated use.
    _arcIter = new ArcIter(_xx, _yy);
    return this;
  }

  function initZData(zz) {
    if (!zz) {
      _zz = null;
      _filteredArcIter = null;
    } else {
      if (zz.length != _xx.length) error("ArcCollection#initZData() mismatched arrays");
      if (zz instanceof Array) zz = new Float64Array(zz);
      _zz = zz;
      _filteredArcIter = new FilteredArcIter(_xx, _yy, _zz);
    }
  }

  function initBounds() {
    var data = calcArcBounds(_xx, _yy, _nn);
    _bb = data.bb;
    _allBounds = data.bounds;
  }

  function calcArcBounds(xx, yy, nn) {
    var numArcs = nn.length,
        bb = new Float64Array(numArcs * 4),
        bounds = new Bounds(),
        arcOffs = 0,
        arcLen,
        j, b;
    for (var i=0; i<numArcs; i++) {
      arcLen = nn[i];
      if (arcLen > 0) {
        j = i * 4;
        b = MapShaper.calcArcBounds(xx, yy, arcOffs, arcLen);
        bb[j++] = b[0];
        bb[j++] = b[1];
        bb[j++] = b[2];
        bb[j] = b[3];
        arcOffs += arcLen;
        bounds.mergeBounds(b);
      }
    }
    return {
      bb: bb,
      bounds: bounds
    };
  }

  this.updateVertexData = function(nn, xx, yy, zz) {
    initXYData(nn, xx, yy);
    initZData(zz || null);
  };

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
    var copy = new ArcCollection(new Int32Array(_nn), new Float64Array(_xx),
        new Float64Array(_yy));
    if (_zz) copy.setThresholds(new Float64Array(_zz));
    return copy;
  };

  function getFilteredPointCount() {
    var zz = _zz, z = _zlimit;
    if (!zz || !z) return this.getPointCount();
    var count = 0;
    for (var i=0, n = zz.length; i<n; i++) {
      if (zz[i] >= z) count++;
    }
    return count;
  }

  function getFilteredVertexData() {
    var len2 = getFilteredPointCount();
    var arcCount = _nn.length;
    var xx2 = new Float64Array(len2),
        yy2 = new Float64Array(len2),
        zz2 = new Float64Array(len2),
        nn2 = new Int32Array(arcCount),
        i=0, i2 = 0,
        n, n2;

    for (var arcId=0; arcId < arcCount; arcId++) {
      n2 = 0;
      n = _nn[arcId];
      for (var end = i+n; i < end; i++) {
        if (_zz[i] >= _zlimit) {
          xx2[i2] = _xx[i];
          yy2[i2] = _yy[i];
          zz2[i2] = _zz[i];
          i2++;
          n2++;
        }
      }
      if (n2 < 2) error("Collapsed arc"); // endpoints should be z == Infinity
      nn2[arcId] = n2;
    }
    return {
      xx: xx2,
      yy: yy2,
      zz: zz2,
      nn: nn2
    };
  }

  this.getFilteredCopy = function() {
    if (!_zz || _zlimit === 0) return this.getCopy();
    var data = getFilteredVertexData();
    var copy = new ArcCollection(data.nn, data.xx, data.yy);
    copy.setThresholds(data.zz);
    return copy;
  };

  // Return arcs as arrays of [x, y] points (intended for testing).
  this.toArray = function() {
    var arr = [];
    this.forEach(function(iter) {
      var arc = [];
      while (iter.hasNext()) {
        arc.push([iter.x, iter.y]);
      }
      arr.push(arc);
    });
    return arr;
  };

  this.toString = function() {
    return JSON.stringify(this.toArray());
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

  // Return average segment length (with simplification)
  this.getAvgSegment = function() {
    var sum = 0;
    var count = this.forEachSegment(function(i, j, xx, yy) {
      var dx = xx[i] - xx[j],
          dy = yy[i] - yy[j];
      sum += Math.sqrt(dx * dx + dy * dy);
    });
    return sum / count || 0;
  };

  // Return average magnitudes of dx, dy (with simplification)
  this.getAvgSegment2 = function() {
    var dx = 0, dy = 0;
    var count = this.forEachSegment(function(i, j, xx, yy) {
      dx += Math.abs(xx[i] - xx[j]);
      dy += Math.abs(yy[i] - yy[j]);
    });
    return [dx / count || 0, dy / count || 0];
  };

  // Return average magnitudes of dx, dy (with simplification)
  /*
  this.getAvgSegmentSph2 = function() {
    var sumx = 0, sumy = 0;
    var count = this.forEachSegment(function(i, j, xx, yy) {
      var lat1 = yy[i],
          lat2 = yy[j];
      sumy += geom.degreesToMeters(Math.abs(lat1 - lat2));
      sumx += geom.degreesToMeters(Math.abs(xx[i] - xx[j]) *
          Math.cos((lat1 + lat2) * 0.5 * geom.D2R);
    });
    return [sumx / count || 0, sumy / count || 0];
  };
  */

  // @cb function(i, j, xx, yy)
  this.forEachArcSegment = function(arcId, cb) {
    var fw = arcId >= 0,
        absId = fw ? arcId : ~arcId,
        zlim = this.getRetainedInterval(),
        n = _nn[absId],
        i = fw ? _ii[absId] : _ii[absId] + n - 1,
        step = fw ? 1 : -1,
        count = 0,
        prev;

    for (var j = 0; j < n; j++, i += step) {
      if (zlim === 0 || _zz[i] >= zlim) {
        if (j > 0) {
          cb(prev, i, _xx, _yy);
          count++;
        }
        prev = i;
      }
    }
    return count;
  };

  // @cb function(i, j, xx, yy)
  this.forEachSegment = function(cb) {
    var count = 0;
    for (var i=0, n=this.size(); i<n; i++) {
      count += this.forEachArcSegment(i, cb);
    }
    return count;
  };

  // Apply a linear transform to the data, with or without rounding.
  //
  this.applyTransform = function(t, round) {
    var xx = _xx, yy = _yy, x, y;
    if (round && typeof round != 'function') {
      round = Math.round;
    }
    if (!t) {
      t = new Transform(); // null transform
    }
    for (var i=0, n=xx.length; i<n; i++) {
      x = xx[i] * t.mx + t.bx;
      y = yy[i] * t.my + t.by;
      if (round) {
        x = round(x);
        y = round(y);
      }
      xx[i] = x;
      yy[i] = y;
    }
    initBounds();
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
      if (_zz) zz = _zz.subarray(start, end);
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
        goodPoints = 0;
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
        if (_zz) copyElements(_zz, _ii[i], _zz, goodPoints, arcLen);
        _nn[k] = arcLen;
        goodPoints += arcLen;
        goodArcs++;
      }
    }

    initXYData(_nn.subarray(0, goodArcs), _xx.subarray(0, goodPoints),
        _yy.subarray(0, goodPoints));
    if (_zz) initZData(_zz.subarray(0, goodPoints));
  }

  this.dedupCoords = function() {
    var arcId = 0, i = 0, i2 = 0,
        arcCount = this.size(),
        zz = _zz,
        arcLen, arcLen2;
    while (arcId < arcCount) {
      arcLen = _nn[arcId];
      arcLen2 = MapShaper.dedupArcCoords(i, i2, arcLen, _xx, _yy, zz);
      _nn[arcId] = arcLen2;
      i += arcLen;
      i2 += arcLen2;
      arcId++;
    }
    if (i > i2) {
      initXYData(_nn, _xx.subarray(0, i2), _yy.subarray(0, i2));
      if (zz) initZData(zz.subarray(0, i2));
    }
    return i - i2;
  };

  this.getVertex = function(arcId, nth) {
    var i = this.indexOfVertex(arcId, nth);
    return {
      x: _xx[i],
      y: _yy[i]
    };
  };

  this.indexOfVertex = function(arcId, nth) {
    var absId = arcId < 0 ? ~arcId : arcId,
        len = _nn[absId];
    if (nth < 0) nth = len + nth;
    if (absId != arcId) nth = len - nth - 1;
    if (nth < 0 || nth >= len) error("[ArcCollection] out-of-range vertex id");
    return _ii[absId] + nth;
  };

  // Test whether the vertex at index @idx is the endpoint of an arc
  this.pointIsEndpoint = function(idx) {
    var ii = _ii,
        nn = _nn;
    for (var j=0, n=ii.length; j<n; j++) {
      if (idx === ii[j] || idx === ii[j] + nn[j] - 1) return true;
    }
    return false;
  };

  // Tests if arc endpoints have same x, y coords
  // (arc may still have collapsed);
  this.arcIsClosed = function(arcId) {
    var i = this.indexOfVertex(arcId, 0),
        j = this.indexOfVertex(arcId, -1);
    return i != j && _xx[i] == _xx[j] && _yy[i] == _yy[j];
  };

  // Tests if first and last segments mirror each other
  // A 3-vertex arc with same endpoints tests true
  this.arcIsLollipop = function(arcId) {
    var len = this.getArcLength(arcId),
        i, j;
    if (len <= 2 || !this.arcIsClosed(arcId)) return false;
    i = this.indexOfVertex(arcId, 1);
    j = this.indexOfVertex(arcId, -2);
    return _xx[i] == _xx[j] && _yy[i] == _yy[j];
  };

  this.arcIsDegenerate = function(arcId) {
    var iter = this.getArcIter(arcId);
    var i = 0,
        x, y;
    while (iter.hasNext()) {
      if (i > 0) {
        if (x != iter.x || y != iter.y) return false;
      }
      x = iter.x;
      y = iter.y;
      i++;
    }
    return true;
  };

  this.getArcLength = function(arcId) {
    return _nn[absArcId(arcId)];
  };

  this.getArcIter = function(arcId) {
    var fw = arcId >= 0,
        i = fw ? arcId : ~arcId,
        iter = _zz && _zlimit ? _filteredArcIter : _arcIter;
    if (i >= _nn.length) {
      error("#getArcId() out-of-range arc id:", arcId);
    }
    return iter.init(_ii[i], _nn[i], fw, _zlimit);
  };

  this.getShapeIter = function(ids) {
    return new ShapeIter(this).init(ids);
  };

  // Add simplification data to the dataset
  // @thresholds is either a single typed array or an array of arrays of removal thresholds for each arc;
  //
  this.setThresholds = function(thresholds) {
    var n = this.getPointCount(),
        zz = null;
    if (!thresholds) {
      // nop
    } else if (thresholds.length == n) {
      zz = thresholds;
    } else if (thresholds.length == this.size()) {
      zz = flattenThresholds(thresholds, n);
    } else {
      error("Invalid threshold data");
    }
    initZData(zz);
    return this;
  };

  function flattenThresholds(arr, n) {
    var zz = new Float64Array(n),
        i = 0;
    arr.forEach(function(arr) {
      for (var j=0, n=arr.length; j<n; i++, j++) {
        zz[i] = arr[j];
      }
    });
    if (i != n) error("Mismatched thresholds");
    return zz;
  }

  // bake in current simplification level, if any
  this.flatten = function() {
    if (_zlimit > 0) {
      var data = getFilteredVertexData();
      this.updateVertexData(data.nn, data.xx, data.yy);
      _zlimit = 0;
    } else {
      _zz = null;
    }
  };

  this.getRetainedInterval = function() {
    return _zlimit;
  };

  this.setRetainedInterval = function(z) {
    _zlimit = z;
    return this;
  };

  this.getRetainedPct = function() {
    return this.getPctByThreshold(_zlimit);
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
    if (!_zz) error("[arcs] Missing simplification data.");
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
      error("[arcs] Invalid arc id:", arcId);
    }
    var start = _ii[arcId],
        end = start + _nn[arcId];
    return _zz.subarray(start, end);
  };

  this.getPctByThreshold = function(val) {
    var arr, rank, pct;
    if (val > 0) {
      arr = this.getRemovableThresholds();
      rank = utils.findRankByValue(arr, val);
      pct = arr.length > 0 ? 1 - (rank - 1) / arr.length : 1;
    } else {
      pct = 1;
    }
    return pct;
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
      z = utils.findValueByRank(tmp, rank);
    }
    return z;
  };

  this.arcIntersectsBBox = function(i, b1) {
    var b2 = _bb,
        j = i * 4;
    return b2[j] <= b1[2] && b2[j+2] >= b1[0] && b2[j+3] >= b1[1] && b2[j+1] <= b1[3];
  };

  this.arcIsContained = function(i, b1) {
    var b2 = _bb,
        j = i * 4;
    return b2[j] >= b1[0] && b2[j+2] <= b1[2] && b2[j+1] >= b1[1] && b2[j+3] <= b1[3];
  };

  this.arcIsSmaller = function(i, units) {
    var bb = _bb,
        j = i * 4;
    return bb[j+2] - bb[j] < units && bb[j+3] - bb[j+1] < units;
  };

  // TODO: allow datasets in lat-lng coord range to be flagged as planar
  this.isPlanar = function() {
    return !MapShaper.probablyDecimalDegreeBounds(this.getBounds());
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

  this.getSimpleShapeBounds = function(arcIds, bounds) {
    bounds = bounds || new Bounds();
    for (var i=0, n=arcIds.length; i<n; i++) {
      this.mergeArcBounds(arcIds[i], bounds);
    }
    return bounds;
  };

  this.getSimpleShapeBounds2 = function(arcIds, arr) {
    var bbox = arr || [],
        bb = _bb,
        id = absArcId(arcIds[0]) * 4;
    bbox[0] = bb[id];
    bbox[1] = bb[++id];
    bbox[2] = bb[++id];
    bbox[3] = bb[++id];
    for (var i=1, n=arcIds.length; i<n; i++) {
      id = absArcId(arcIds[i]) * 4;
      if (bb[id] < bbox[0]) bbox[0] = bb[id];
      if (bb[++id] < bbox[1]) bbox[1] = bb[id];
      if (bb[++id] > bbox[2]) bbox[2] = bb[id];
      if (bb[++id] > bbox[3]) bbox[3] = bb[id];
    }
    return bbox;
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
}

ArcCollection.prototype.inspect = function() {
  var n = this.getPointCount(), str;
  if (n < 50) {
    str = JSON.stringify(this.toArray());
  } else {
    str = '[ArcCollection (' + this.size() + ')]';
  }
  return str;
};

MapShaper.dedupArcCoords = function(src, dest, arcLen, xx, yy, zz) {
  var n = 0, n2 = 0; // counters
  while (n < arcLen) {
    if (n === 0 || xx[src] != xx[src-1] || yy[src] != yy[src-1]) {
      xx[dest] = xx[src];
      yy[dest] = yy[src];
      if (zz) zz[dest] = zz[src];
      dest++;
      n2++;
    } else if (n > 0 && zz && zz[src] > zz[dest]) {
      zz[dest-1] = zz[src];
    }
    src++;
    n++;
  }
  return n2 > 1 ? n2 : 0;
};
