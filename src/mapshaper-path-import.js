/* @requires
mapshaper-common,
mapshaper-geom,
mapshaper-snapping,
mapshaper-topology
*/

// Convert path data from a non-topological source (Shapefile, GeoJSON, etc)
// into a topoological format
//
function PathImporter(pointCount, opts) {
  opts = opts || {};
  var xx = new Float64Array(pointCount),
      yy = new Float64Array(pointCount),
      buf = new Float64Array(1024),
      round = null;

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  var paths = [],
      pointId = 0,
      shapeId = -1;

  this.startShape = function() {
    shapeId++;
  };

  this.roundCoords = function(arr, round) {
    for (var i=0, n=arr.length; i<n; i++) {
      arr[i] = round(arr[i]);
    }
  };

  this.cleanPaths = function(xx, yy, paths) {
    var offs = 0,
        ins = 0,
        openPathCount = 0,
        dupeCount = 0,
        validPaths = [],
        nn = [];
    Utils.forEach(paths, function(path, pathId) {
      var validPoints,
          startId = ins,
          n = path.size,
          err = null,
          i, x, y, prevX, prevY;
      for (i=0; i<n; i++, offs++) {
        x = xx[offs];
        y = yy[offs];
        if (i === 0 || prevX != x || prevY != y) {
          xx[ins] = x;
          yy[ins] = y;
          ins++;
        } else {
          dupeCount++;
        }
        prevX = x;
        prevY = y;
      }
      validPoints = ins - startId;

      if (path.isRing) {
        if (validPoints < 4) {
          err = "Only " + validPoints + " valid points in ring";
        }
        // If number of points in ring have changed (e.g. from snapping) or if
        // coords were rounded, check for collapsed or inverted rings.
        else if (validPoints < path.size || round) {
          var area = msSignedRingArea(xx, yy, startId, validPoints);
          if (area === 0) {
            err = "Collapsed ring";
          } else if (area < 0 != path.area < 0) {
            err = "Inverted ring";
          }
        }
        // Catch rings that were originally empty
        else if (path.area === 0) {
          err = "Zero-area ring";
        }
      } else {
        if (validPoints < 2) {
          err = "Collapsed open path";
        } else {
          openPathCount++;
        }
      }

      if (err) {
        trace(err + " -- skipping a path.");
        ins -= validPoints;
      } else {
        nn.push(validPoints);
        validPaths.push(path);
      }
    });

    if (dupeCount > 0) {
      trace(Utils.format("Removed %,d duplicate point%s", dupeCount, "s?"));
    }

    return {
      xx: xx.subarray(0, ins),
      yy: yy.subarray(0, ins),
      nn: nn,
      validPaths: validPaths,
      openPathCount: openPathCount,
      invalidPointCount: offs - ins,
      validPointCount: ins
    };
  };

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  // @offs Array index of first coordinate
  //
  this.importCoordsFromFlatArray = function(arr, offs, pointCount) {
    var startId = pointId,
        x, y;

    for (var i=0; i<pointCount; i++) {
      x = arr[offs++];
      y = arr[offs++];
      xx[pointId] = x;
      yy[pointId] = y;
      pointId++;
    }
    var isRing = pointCount > 1 && xx[startId] === x && yy[startId] === y;
    var path = {
      size: pointCount,
      shapeId: shapeId,
      isRing: isRing
    };

    if (isRing) {
      path.area = msSignedRingArea(xx, yy, startId, pointCount);
    }

    paths.push(path);
    return path;
  };

  // Import an array of [x, y] Points
  //
  this.importPoints = function(points, isHole) {
    var n = points.length,
        size = n * 2,
        p;
    if (buf.length < size) buf = new Float64Array(Math.ceil(size * 1.3));
    for (var i=0, j=0; i < n; i++) {
      p = points[i];
      buf[j++] = p[0];
      buf[j++] = p[1];
    }
    var startId = pointId;
    var path = this.importCoordsFromFlatArray(buf, 0, n);
    if (path.isRing) {
      if (isHole && path.area > 0 || !isHole && path.area < 0) {
        trace("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
        MapShaper.reversePathCoords(xx, startId, path.size);
        MapShaper.reversePathCoords(yy, startId, path.size);
        path.area = -path.area;
      }
    }
  };

  // Return topological shape data
  // Applies any requested snapping and rounding
  // Removes duplicate points, checks for ring inversions
  //
  this.done = function() {
    var snappedPoints;
    if (round) {
      this.roundCoords(xx, round);
      this.roundCoords(yy, round);
    }
    if (opts.snapping) {
      T.start();
      var nn = Utils.pluck(paths, 'size'); // TODO: refactor
      snappedPoints = opts.debug_snapping ? [] : null;
      MapShaper.autoSnapCoords(xx, yy, nn, opts.snap_interval, snappedPoints);
      T.stop("Snapping points");
    }

    var pathData = this.cleanPaths(xx, yy, paths);
    var info = {
      snapped_points: snappedPoints,
      input_path_count: pathData.validPaths.length,
      input_point_count: pathData.validPointCount,
      input_skipped_points: pathData.invalidPointCount,
      input_shape_count: shapeId + 1,
      input_geometry_type: pathData.openPathCount > 0 ? 'polyline' : 'polygon'
    };

    return {
      geometry: pathData,
      info: info
    };
  };
}
