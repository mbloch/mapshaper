/* @requires
mapshaper-shapes
mapshaper-shape-utils
mapshaper-simplify-fast
*/

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
    var size = unfilteredArcs.getPointCount(),
        cutoff = 5e5,
        nth;
    if (!!unfilteredArcs.getVertexData().zz) {
      // If we have simplification data...
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      nth = Math.ceil(size / cutoff);
      _sortedThresholds = unfilteredArcs.getRemovableThresholds(nth);
      utils.quicksort(_sortedThresholds, false);
      // For large datasets, create a filtered copy of the data for faster rendering
      if (size > cutoff) {
        filteredArcs = initFilteredArcs(unfilteredArcs, _sortedThresholds);
        filteredSegLen = filteredArcs.getAvgSegment();
      }
    } else {
      if (size > cutoff) {
        // generate filtered arcs when no simplification data is present
        filteredSegLen = unfilteredArcs.getAvgSegment() * 4;
        filteredArcs = MapShaper.simplifyArcsFast(unfilteredArcs, filteredSegLen);
      }
    }
  }

  // Use simplification data to create a low-detail copy of arcs, for faster
  // rendering when zoomed-out.
  function initFilteredArcs(arcs, sortedThresholds) {
    var filterPct = 0.08;
    var filterZ = sortedThresholds[Math.floor(filterPct * sortedThresholds.length)];
    var filteredArcs = arcs.setRetainedInterval(filterZ).getFilteredCopy();
    arcs.setRetainedPct(1); // clear simplification
    return filteredArcs;
  }

  function getArcCollection() {
    refreshFilteredArcs();
    // Use a filtered version of arcs at small scales
    var unitsPerPixel = 1/_ext.getTransform().mx,
        useFiltering = filteredArcs && unitsPerPixel > filteredSegLen * 1.5;
    return useFiltering ? filteredArcs : unfilteredArcs;
  }

  function refreshFilteredArcs() {
    if (filteredArcs) {
      if (filteredArcs.size() != unfilteredArcs.size()) {
        init();
      }
      filteredArcs.setRetainedInterval(unfilteredArcs.getRetainedInterval());
    }
  }

  this.update = function(arcs) {
    unfilteredArcs = arcs;
    init();
  };

  this.setRetainedPct = function(pct) {
    if (_sortedThresholds) {
      var z = _sortedThresholds[Math.floor(pct * _sortedThresholds.length)];
      z = MapShaper.clampIntervalByPct(z, pct);
      // this.setRetainedInterval(z);
      unfilteredArcs.setRetainedInterval(z);
    } else {
      unfilteredArcs.setRetainedPct(pct);
    }
  };

  this.setMapExtent = function(ext) {
    _ext = ext;
  };

  this.forEach = function(cb) {
    var arcs = getArcCollection(),
        minPathLen = 0.8 * _ext.getPixelSize(),
        wrapPath = getCoordWrapper(_ext),
        geoBounds = _ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds());

    // don't drop more paths at less than full extent (i.e. zoomed far out)
    if (_ext.scale() < 1) minPathLen *= _ext.scale();

    for (var i=0, n=arcs.size(); i<n; i++) {
      if (arcs.arcIsSmaller(i, minPathLen)) continue;
      if (!allIn && !arcs.arcIntersectsBBox(i, geoBBox)) continue;
      cb(wrapPath(arcs.getArcIter(i)), i);
    }
  };
}

function FilteredPointCollection(shapes) {
  var _ext;

  this.forEach = function(cb) {
    var iter = new PointIter();
    var wrapped = getCoordWrapper(_ext)(iter);
    for (var i=0, n=shapes.length; i<n; i++) {
      iter.setPoints(shapes[i]);
      cb(wrapped, i);
    }
  };

  this.setMapExtent = function(ext) {
    _ext = ext;
  };
}


// @ext MapExtent
function getCoordWrapper(ext) {
  // Wrap point iterator to convert geographic coordinates to pixels
  var wrapped = null;
  var t = ext.getTransform();
  var wrapper = {
    x: 0,
    y: 0,
    hasNext: function() {
      if (wrapped.hasNext()) {
        this.x = wrapped.x * t.mx + t.bx;
        this.y = wrapped.y * t.my + t.by;
        return true;
      }
      return false;
    }
  };
  return function(iter) {
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
