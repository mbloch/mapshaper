/* @requires
mapshaper-common,
mapshaper-geom,
mapshaper-snapping,
mapshaper-topology
*/

// Import path data from a non-topological source (Shapefile, GeoJSON, etc)
// in preparation for identifying topology.
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
        dupeCount = 0,
        zeroAreaCount = 0,
        defectiveCount = 0,
        windingErrorCount = 0,
        skippedPathCount = 0,
        validPaths = [],
        nn = [];

    Utils.forEach(paths, function(path, pathId) {
      var validPoints,
          removeDupes = path.type != 'point',
          startId = ins,
          n = path.size,
          err = false,
          i, x, y, prevX, prevY;
      for (i=0; i<n; i++, offs++) {
        x = xx[offs];
        y = yy[offs];
        if (i === 0 || prevX != x || prevY != y || !removeDupes) {
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

      if (path.type == 'polygon') {
        if (validPoints < 4) {
          err = true;
          defectiveCount++;
        }
        // If number of points in ring have changed (e.g. from snapping) or if
        // coords were rounded, recompute area and check for collapsed or
        // inverted rings.
        else if (validPoints < path.size || round) {
          var area = msSignedRingArea(xx, yy, startId, validPoints);
          if (area === 0) {
            err = true;
            zeroAreaCount++;
          } else if (area < 0 != path.area < 0) {
            err = true;
            windingOrderCount++;
          }
        }
        // Catch rings that were originally empty
        else if (path.area === 0) {
          err = true;
          zeroAreaCount++;
        }
      } else if (path.type == 'polyline') {
        if (validPoints < 2) {
          err = true;
          defectiveCount++;
        }
      }

      if (err) {
        skippedPathCount++;
        ins -= validPoints;
      } else {
        nn.push(validPoints);
        validPaths.push(path);
      }
    });

    if (dupeCount > 0) {
      verbose(Utils.format("Removed %,d duplicate point%s", dupeCount, "s?"));
    }
    if (skippedPathCount > 0) {
      // TODO: consider showing details about type of error
      message(Utils.format("Removed %,d path%s with defective geometry", skippedPathCount, "s?"));
    }

    return {
      xx: xx.subarray(0, ins),
      yy: yy.subarray(0, ins),
      nn: nn,
      validPaths: validPaths,
      skippedPathCount: skippedPathCount,
      invalidPointCount: offs - ins,
      validPointCount: ins
    };
  };

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  // @offs Array index of first coordinate
  //
  this.importCoordsFromFlatArray = function(arr, offs, pointCount, type) {
    var startId = pointId,
        x, y;

    for (var i=0; i<pointCount; i++) {
      x = arr[offs++];
      y = arr[offs++];
      xx[pointId] = x;
      yy[pointId] = y;
      pointId++;
    }

    var path = {
      type: type,
      size: pointCount,
      shapeId: shapeId
    };

    if (type == 'polygon') {
      path.area = msSignedRingArea(xx, yy, startId, pointCount);
    }
    paths.push(path);
    return path;
  };

  // Import an array of [x, y] Points
  //
  this.importPoints = function(points, type) {
    var n = points.length,
        buf = getPointBuf(n),
        p;
    for (var i=0, j=0; i < n; i++) {
      p = points[i];
      buf[j++] = p[0];
      buf[j++] = p[1];
    }
    return this.importCoordsFromFlatArray(buf, 0, n, type);
  };

  this.importPoint = function(point) {
    this.importPoints([point], 'point');
  };

  this.importLine = function(points) {
    this.importPoints(points, 'polyline');
  };

  this.importPolygon = function(points, isHole) {
    // TODO: avoid using class variables
    var startId = pointId;
    var path = this.importPoints(points, 'polygon');
    if (isHole && path.area > 0 || !isHole && path.area < 0) {
      verbose("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
      MapShaper.reversePathCoords(xx, startId, path.size);
      MapShaper.reversePathCoords(yy, startId, path.size);
      path.area = -path.area;
    }
    return path;
  };

  function getCollectionType(paths) {
    return Utils.reduce(paths, function(memo, path) {
      if (!memo) {
        memo = path.type;
      } else if (path.type != memo) {
        memo = 'mixed';
      }
      return memo;
    }, null);
  }

  function getPointBuf(n) {
    var len = n * 2;
    if (buf.length < len) {
      buf = new Float64Array(Math.ceil(len * 1.3));
    }
    return buf;
  }

  // Return topological shape data
  // Apply any requested snapping and rounding
  // Remove duplicate points, check for ring inversions
  //
  this.done = function() {
    var snappedPoints = null; // TODO: remove
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
    // may be: polygon, polyline, point, mixed, null
    var collType = getCollectionType(paths);
    // if (!collType) console.log("missing collection type:", paths);
    if (collType == 'mixed') {
      stop("[PathImporter] Mixed feature types are not allowed");
    }
    var pathData = this.cleanPaths(xx, yy, paths);
    var info = {
      snapped_points: snappedPoints,
      input_path_count: pathData.validPaths.length,
      input_point_count: pathData.validPointCount,
      input_skipped_points: pathData.invalidPointCount,
      input_shape_count: shapeId + 1,
      input_geometry_type: collType
    };
    return {
      geometry: pathData,
      info: info
    };
  };
}
