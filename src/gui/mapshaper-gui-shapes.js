/* @requires mapshaper-shapes */


// A collection of paths that can be filtered to exclude paths and points
// that can't be displayed at the current map scale. For drawing paths on-screen.
// TODO: Look into generalizing from Arc paths to SimpleShape and MultiShape
//
function FilteredPathCollection(arr, collBounds) {
  var _filterBounds,
      _transform;

  var getPathIter = function() {
    return function(s, i) {
      return s.getPathIter(i);
    };
  };

  this.reset = function() {
    _filterBounds = null;
    _transform = null;
    return this;
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
  };

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
        if (i === 0) return false;
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
    };
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
      for (var j=0; j<shp.pathCount; j++) {
        cb(path(shp, j));
      }
    }
  };

}