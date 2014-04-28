/* @requires
mapshaper-common,
mapshaper-geom,
mapshaper-shape-geom,
mapshaper-snapping,
mapshaper-topology
*/

// Import path data from a non-topological source (Shapefile, GeoJSON, etc)
// in preparation for identifying topology.
//
function PathImporter(reservedPoints, opts) {
  opts = opts || {};
  var shapes = [],
      collectionType = null,
      round = null,
      xx, yy, nn, buf;

  if (reservedPoints > 0) {
    nn = [];
    xx = new Float64Array(reservedPoints);
    yy = new Float64Array(reservedPoints);
    buf = new Float64Array(1024);
  }

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  var pathId = -1,
      shapeId = -1,
      pointId = 0,
      dupeCount = 0,
      skippedPathCount = 0;

  function addShapeType(t) {
    if (!collectionType) {
      collectionType = t;
    } else if (t != collectionType) {
      collectionType = "mixed";
    }
  }

  function getPointBuf(n) {
    var len = n * 2;
    if (buf.length < len) {
      buf = new Float64Array(Math.ceil(len * 1.3));
    }
    return buf;
  }

  this.startShape = function() {
    shapes[++shapeId] = null;
  };

  function appendToShape(part) {
    var currShape = shapes[shapeId] || (shapes[shapeId] = []);
    currShape.push(part);
  }

  function appendPath(n, type) {
    addShapeType(type);
    pathId++;
    nn[pathId] = n;
    appendToShape([pathId]);
  }

  function roundPoints(points, round) {
    points.forEach(function(p) {
      p[0] = round(p[0]);
      p[1] = round(p[1]);
    });
  }

  this.roundCoords = function(arr, round) {
    for (var i=0, n=arr.length; i<n; i++) {
      arr[i] = round(arr[i]);
    }
  };

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  // (for Shapefile import -- consider moving out of here)
  // @offs Array index of first coordinate
  //
  this.importPathFromFlatArray = function(arr, type) {
    var len = arr.length,
        n = 0, i = 0,
        x, y, prevX, prevY;

    while (i < len) {
      x = arr[i++];
      y = arr[i++];
      if (round) {
        x = round(x);
        y = round(y);
      }
      if (i > 0 && x == prevX && y == prevY) {
        dupeCount++;
      } else {
        xx[pointId] = x;
        yy[pointId] = y;
        pointId++;
        n++;
      }
      prevY = y;
      prevX = x;
    }

    var valid = false;
    if (type == 'polyline') {
      valid = n > 1;
    } else if (type == 'polygon') {
      valid = n > 3 && msSignedRingArea(xx, yy, pointId-n, n) !== 0;
    } else {
      error("[importPathFromFlatArray() Unexpected type:", type);
    }

    if (valid) {
      appendPath(n, type);
    } else {
      pointId -= n;
      skippedPathCount++;
    }
  };

  // Import an array of [x, y] Points
  //
  this.importPath = function(points, type) {
    var n = points.length,
        buf = getPointBuf(n),
        j = 0;
    for (var i=0; i < n; i++) {
      buf[j++] = points[i][0];
      buf[j++] = points[i][1];
    }
    this.importPathFromFlatArray(buf.subarray(0, j), type);
  };

  this.importPoints = function(points) {
    addShapeType('point');
    if (round) {
      roundPoints(points, round);
    }
    points.forEach(appendToShape);
  };

  this.importLine = function(points) {
    this.importPath(points, 'polyline');
  };

  this.importPolygon = function(points, isHole) {
    var area = geom.getPathArea2(points);

    if (isHole === true && area > 0 || isHole === false && area < 0) {
      verbose("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
      points.reverse();
    }
    this.importPath(points, 'polygon');
  };

  // Return topological shape data
  // Apply any requested snapping and rounding
  // Remove duplicate points, check for ring inversions
  //
  this.done = function() {
    var arcs;

    // possible values: polygon, polyline, point, mixed, null
    if (collectionType == 'mixed') {
      stop("[PathImporter] Mixed feature types are not allowed");
    } else if (collectionType == 'polygon' || collectionType == 'polyline') {

      if (dupeCount > 0) {
        verbose(Utils.format("Removed %,d duplicate point%s", dupeCount, "s?"));
      }
      if (skippedPathCount > 0) {
        // TODO: consider showing details about type of error
        message(Utils.format("Removed %,d path%s with defective geometry", skippedPathCount, "s?"));
      }

      if (pointId > 0) {
       if (pointId < xx.length) {
          xx = xx.subarray(0, pointId);
          yy = yy.subarray(0, pointId);
        }
        arcs = new ArcDataset(nn, xx, yy);

        // TODO: move shape validation after snapping (which may corrupt shapes)
        if (opts.snapping) {
          T.start();
          MapShaper.autoSnapCoords(arcs, opts.snap_interval);
          T.stop("Snapping points");
        }
      } else {
        message("No geometries were imported");
        collectionType = null;
      }
    } else if (collectionType == 'point' || collectionType === null) {
      // pass
    } else {
      error("Unexpected collection type:", collectionType);
    }

    return {
      arcs: arcs || null,
      info: {},
      layers: [{
        name: '',
        geometry_type: collectionType,
        shapes: shapes
      }]
    };
  };
}
