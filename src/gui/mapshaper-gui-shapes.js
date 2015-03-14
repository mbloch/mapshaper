/* @requires mapshaper-shapes, mapshaper-shape-utils */

// A wrapper for ArcCollection that converts source coords to screen coords
// and filters paths to speed up rendering.
//
function FilteredArcCollection(unfilteredArcs) {
  var _ext,
      _sortedThresholds,
      filteredArcs,
      filteredSegLen;

  init();

  function init() {
    // If we have simplification data...
    if (unfilteredArcs.getVertexData().zz) {
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      var size = unfilteredArcs.getPointCount(),
          nth = Math.ceil(size / 5e5);
      _sortedThresholds = unfilteredArcs.getRemovableThresholds(nth);
      utils.quicksort(_sortedThresholds, false);

      // For large datasets, create a filtered copy of the data for faster rendering
      if (size > 5e5) {
        initFilteredArcs();
      }
    }
  }

  function initFilteredArcs() {
    var filterPct = 0.08;
    var filterZ = _sortedThresholds[Math.floor(filterPct * _sortedThresholds.length)];
    filteredArcs = unfilteredArcs.setRetainedInterval(filterZ).getFilteredCopy();
    unfilteredArcs.setRetainedPct(1); // clear simplification
    filteredSegLen = filteredArcs.getAvgSegment();
  }

  function getArcData() {
    // Use a filtered version of arcs at small scales
    var unitsPerPixel = 1/_ext.getTransform().mx;
    return filteredArcs && unitsPerPixel > filteredSegLen * 1.5 ?
      filteredArcs : unfilteredArcs;
  }

  this.update = function(arcs) {
    unfilteredArcs = arcs;
    init();
  };

  this.setRetainedPct = function(pct) {
    if (_sortedThresholds) {
      var z = _sortedThresholds[Math.floor(pct * _sortedThresholds.length)];
      z = MapShaper.clampIntervalByPct(z, pct);
      this.setRetainedInterval(z);
    } else {
      unfilteredArcs.setRetainedPct(pct);
    }
  };

  this.setRetainedInterval = function(z) {
    unfilteredArcs.setRetainedInterval(z);
    if (filteredArcs) {
      filteredArcs.setRetainedInterval(z);
    }
  };

  this.setMapExtent = function(ext) {
    _ext = ext;
  };

  this.forEach = function(cb) {
    if (!_ext) error("Missing map extent");

    var src = getArcData(),
        arc = new Arc(src),
        minPathLen = 0.8 * _ext.getPixelSize(),
        wrapPath = getPathWrapper(_ext),
        geoBounds = _ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(src.getBounds());

    // don't drop more paths at less than full extent (i.e. zoomed far out)
    if (_ext.scale() < 1) minPathLen *= _ext.scale();

    for (var i=0, n=src.size(); i<n; i++) {
      arc.init(i);
      if (arc.smallerThan(minPathLen)) continue;
      if (!allIn && !arc.inBounds(geoBBox)) continue;
      cb(wrapPath(arc.getPathIter()));
    }
  };
}

function FilteredPointCollection(shapes) {
  var _ext;

  this.forEach = function(cb) {
    var iter = new PointIter();
    var wrapped = getPointWrapper(_ext)(iter);
    for (var i=0, n=shapes.length; i<n; i++) {
      iter.setPoints(shapes[i]);
      cb(wrapped);
    }
  };

  this.setMapExtent = function(ext) {
    _ext = ext;
  };
}

function getPathWrapper(ext) {
  return getDisplayWrapper(ext, "path");
}

function getPointWrapper(ext) {
  return getDisplayWrapper(ext, "point");
}

// @ext MapExtent
// @type 'point'|'path'
function getDisplayWrapper(ext, type) {
  // Wrap point iterator to convert geographic coordinates to pixels
  //   and skip over invisible clusters of points (i.e. smaller than a pixel)
  var transform = ext.getTransform(),
      bounds = ext.getBounds(),
      started = false,
      wrapped = null;

  var wrapper = {
    x: 0,
    y: 0,
    hasNext: function() {
      var t = transform, mx = t.mx, my = t.my, bx = t.bx, by = t.by;
      var minSegLen = 0.6; // min pixel size of a drawn segment
      var iter = wrapped,
          isFirst = !started,
          pointMode = type == 'point',
          x, y, prevX, prevY,
          i = 0;
      if (!isFirst) {
        prevX = this.x;
        prevY = this.y;
      }
      while (iter.hasNext()) {
        i++;
        x = iter.x * mx + bx;
        y = iter.y * my + by;
        if (pointMode) {
           if (bounds.containsPoint(iter.x, iter.y)) break;
        } else if (isFirst || Math.abs(x - prevX) > minSegLen || Math.abs(y - prevY) > minSegLen) {
          break;
        }
      }
      if (i === 0) return false;
      started = true;
      this.x = x;
      this.y = y;
      return true;
    }
  };
  return function(iter) {
    started = false;
    wrapped = iter;
    return wrapper;
  };
}

function PointIter() {
  var _i, _points;

  this.setPoints = function(arr) {
    _points = arr;
    _i = 0;
  };

  this.hasNext = function() {
    var n = _points ? _points.length : 0,
        p;
    if (_i < n) {
      p = _points[_i++];
      this.x = p[0];
      this.y = p[1];
      return true;
    }
    return false;
  };
}
