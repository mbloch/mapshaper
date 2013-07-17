/* @requires mapshaper-common, mapshaper-geom */

// Convert path data from a non-topological source (Shapefile, GeoJSON, etc)
// to the format used for topology processing (see mapshaper-topology.js)
//
function PathImporter(pointCount) {
  var xx = new Float64Array(pointCount),
      yy = new Float64Array(pointCount),
      buf = new Float64Array(1024);

  var paths = [],
      pointId = 0,
      openPaths = 0,
      shapeId = -1,
      pathsInShape,
      primaryPath,
      primaryPathArea;

  function endPrevShape() {
    if (primaryPathArea > 0) {
      primaryPath.isPrimary = true;
    }
  };

  this.startShape = function() {
    endPrevShape();
    shapeId++;
    primaryPath = null;
    primaryPathArea = 0;
    pathsInShape = 0;
  };

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  // @offs Array index of first coordinate
  //
  this.importCoordsFromFlatArray = function(arr, offs, pointCount, isRing, isHole) {
    var findMaxParts = isRing,
        detectHoles = isRing && isHole === void 0,
        startId = pointId,
        x, y, prevX, prevY;

    for (var i=0; i<pointCount; i++) {
      x = arr[offs++];
      y = arr[offs++];
      if (i == 0 || prevX != x || prevY != y) {
        xx[pointId] = x;
        yy[pointId] = y;
        pointId++;
      }
      prevX = x, prevY = y;
    }

    var validPoints = pointId - startId;
    var path = {
      size: validPoints,
      isHole: false,
      isPrimary: false,
      shapeId: shapeId
    };

    if (isRing) {
      var signedArea = msSignedRingArea(xx, yy, startId, validPoints);
      var err = null;
      if (validPoints < 4) {
        err = "Only " + validPoints + " valid points in ring";
      } else if (signedArea == 0) {
        err = "Zero-area ring";
      } else if (xx[startId] != xx[pointId-1] || yy[startId] != yy[pointId-1]) {
        err = "Open path";
      }

      if (err != null) {
        trace("Invalid ring in shape:", shapeId, "--", err);
        // pathObj.isNull = true;
        pointId -= validPoints; // backtrack...
        return false;
      }

      if (detectHoles) {
        if (signedArea < 0) {
          path.isHole = true;
        }
      } else {
        path.isHole = isHole;
        if (isHole && signedArea > 0 || !isHole && signedArea < 0) {
          // reverse coords
          MapShaper.reversePathCoords(xx, startId, validPoints);
          MapShaper.reversePathCoords(yy, startId, validPoints);
          signedArea *= -1;
        }
      }

      if (signedArea > primaryPathArea) {
        primaryPath = path;
        primaryPathArea = signedArea;
      }

      // TODO: detect shapes that only contain holes

    } else { // no rings (i.e. polylines)
      openPaths++;
      if (validPoints < 2) {
        trace("Collapsed path in shape:", shapeId, "-- skipping");
        pointId -= validPoints;
      }
    }

    paths.push(path);
    pathsInShape++;
    return true;
  };


  // Import an array of [x, y] Points
  //
  this.importPoints = function(points, isRing, isHole) {
    var n = points.length,
        size = n * 2,
        p;
    if (buf.length < size) buf = new Float64Array(Math.ceil(size * 1.3));
    for (var i=0, j=0; i < n; i++) {
      p = points[i];
      buf[j++] = p[0];
      buf[j++] = p[1];
    }
    this.importCoordsFromFlatArray(buf, 0, n, isRing, isHole);
  };


  // TODO: detect null shapes, shapes that only have holes (error condition)
  //
  this.done = function() {
    endPrevShape();

    var skippedPoints = xx.length - pointId;
    if (xx.length > pointId) {
      xx = xx.subarray(0, pointId);
      yy - yy.subarray(0, pointId);
    }

    var bounds = MapShaper.calcXYBounds(xx, yy);

    var info = {
      input_bounds: bounds.toArray(),
      input_point_count: xx.length,
      input_part_count: paths.length,
      input_skipped_points: skippedPoints,
      input_shape_count: shapeId + 1,
      input_geometry_type: openPaths > 1 ? 'polyline' : 'polygon'
    };

    return {
      pathData: paths,
      xx: xx,
      yy: yy,
      info: info
    };
  };

}