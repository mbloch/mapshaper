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
  var xx = [],
      yy = [],
      nn = [],
      shapes = [],
      collectionType = null,
      round = null;

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  var pathId = -1,
      shapeId = -1;

  function addShapeType(t) {
    if (!collectionType) {
      collectionType = t;
    } else if (t != collectionType) {
      collectionType = "mixed";
    }
  }

  this.startShape = function() {
    shapes[++shapeId] = null;
  };

  function appendToShape(part) {
    var currShape = shapes[shapeId] || (shapes[shapeId] = []);
    currShape.push(part);
  }

  function applyRounding(points) {
    if (round) {
      points.forEach(function(p) {
        p[0] = round(p[0]);
        p[1] = round(p[1]);
      });
    }
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
  this.importCoordsFromFlatArray = function(arr, offs, pointCount, type) {
    var points = [];
    for (var i=0; i<pointCount; i++) {
      points.push([arr[offs++], arr[offs++]]);
    }
    if (type == 'point') this.importPoints(points);
    else if (type == 'polyline') this.importLine(points);
    else if (type == 'polygon') this.importPolygon(points);
    else error("Unsupported type:", type);
  };

  // Import an array of [x, y] Points
  //
  this.importPath = function(points) {
    var n = points.length, p;
    for (var i=0; i<n; i++) {
      p = points[i];
      xx.push(p[0]);
      yy.push(p[1]);
    }
    pathId++;
    nn[pathId] = n;
    appendToShape([pathId]);
  };

  this.importPoints = function(points) {
    addShapeType('point');
    applyRounding(points);
    points.forEach(appendToShape);
  };

  this.importLine = function(points) {
    addShapeType('polyline');
    applyRounding(points);
    // TODO: check for collapsed line
    if (points.length > 1) {
      this.importPath(points);
    }
  };

  this.importPolygon = function(points, isHole) {
    addShapeType('polygon');
    applyRounding(points);
    var area = MapShaper.getPathArea2(points);
    if (isHole === true && area > 0 || isHole === false && area < 0) {
      verbose("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
      points.reverse();
    }
    if (area !== 0) {
      this.importPath(points);
    }
  };

  // Return topological shape data
  // Apply any requested snapping and rounding
  // Remove duplicate points, check for ring inversions
  //
  this.done = function() {
    if (opts.snapping) {
      T.start();
      MapShaper.autoSnapCoords(xx, yy, nn, opts.snap_interval);
      T.stop("Snapping points");
    }

    // possible values: polygon, polyline, point, mixed, null
    if (collectionType == 'mixed') {
      stop("[PathImporter] Mixed feature types are not allowed");
    }

    /*
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
  */

    var geometry = {
      xx: new Float64Array(xx),
      yy: new Float64Array(yy),
      nn: new Float64Array(nn),
      shapes: shapes
    };

    var info = {
      //snapped_points: snappedPoints,
      //input_path_count: pathData.validPaths.length,
      //input_point_count: pathData.validPointCount,
      //input_skipped_points: pathData.invalidPointCount,
      //input_shape_count: shapeId + 1,
      input_geometry_type: collectionType
    };

    return {
      geometry: geometry,
      info: info
    };
  };
}
