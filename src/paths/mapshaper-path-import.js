/* @requires
mapshaper-common,
mapshaper-geom,
mapshaper-shape-geom,
mapshaper-snapping,
mapshaper-topology,
mapshaper-shape-utils,
mapshaper-polygon-repair
*/

function PathImportStream(drain) {
  var buflen = 1000,
      xx = new Float64Array(buflen),
      yy = new Float64Array(buflen),
      i = 0;

  this.endPath = function() {
    drain(xx, yy, i);
    i = 0;
  };

  this.addPoint = function(x, y) {
    if (i >= buflen) {
      buflen = Math.ceil(buflen * 1.3);
      xx = utils.extendBuffer(xx, buflen);
      yy = utils.extendBuffer(yy, buflen);
    }
    xx[i] = x;
    yy[i] = y;
    i++;
  };
}

// Import path data from a non-topological source (Shapefile, GeoJSON, etc)
// in preparation for identifying topology.
// @reservedPoints (optional) estimate of points in dataset, for allocating buffers
//
function PathImporter(opts) {
  var bufSize = opts.reserved_points > 0 ? opts.reserved_points : 20000,
      xx = new Float64Array(bufSize),
      yy = new Float64Array(bufSize),
      buf = new Float64Array(1024),
      shapes = [],
      nn = [],
      collectionType = opts.type || null,
      round = null,
      pathId = -1,
      shapeId = -1,
      pointId = 0,
      dupeCount = 0,
      skippedPathCount = 0;

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  function setShapeType(t) {
    // possible values: polygon, polyline, point, mixed, null
    // TODO validate
    if (!collectionType) {
      collectionType = t;
    } else if (t != collectionType) {
      stop("[PathImporter] Mixed feature types are not allowed");
    }
  }

  function checkBuffers(needed) {
    if (needed > xx.length) {
      var newLen = Math.max(needed, Math.ceil(xx.length * 1.5));
      xx = utils.extendBuffer(xx, newLen, pointId);
      yy = utils.extendBuffer(yy, newLen, pointId);
    }
  }

  function getPointBuf(n) {
    var len = n * 2;
    if (buf.length < len) {
      buf = new Float64Array(Math.ceil(len * 1.3));
    }
    return buf;
  }

  this.type = setShapeType;

  this.sink = new PathImportStream(importPathCoords);

  this.startShape = function(type) {
    if (type) this.type(type);
    shapes[++shapeId] = null;
  };

  function appendToShape(part) {
    var currShape = shapes[shapeId] || (shapes[shapeId] = []);
    currShape.push(part);
  }

  function appendPath(n) {
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

  function importPathCoords(xsrc, ysrc, n) {
    var count = 0;
    var x, y, prevX, prevY;
    checkBuffers(pointId + n);
    for (var i=0; i<n; i++) {
      x = xsrc[i];
      y = ysrc[i];
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
        count++;
      }
      prevY = y;
      prevX = x;
    }
    appendPath(count);
  }

  this.importLine = function(points) {
    setShapeType('polyline');
    this.importPath(points);
  };

  // Import an array of [x, y] Points
  this.importPath = function(points) {
    var p;
    for (var i=0, n=points.length; i<n; i++) {
      p = points[i];
      this.sink.addPoint(p[0], p[1]);
    }
    this.sink.endPath();
  };

  this.importPoints = function(points) {
    setShapeType('point');
    if (round) {
      roundPoints(points, round);
    }
    points.forEach(appendToShape);
  };

  this.importRing = function(points, isHole) {
    var area = geom.getPlanarPathArea2(points);
    setShapeType('polygon');
    if (isHole === true && area > 0 || isHole === false && area < 0) {
      verbose("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
      points.reverse();
    }
    this.importPath(points);
  };

  // Return topological shape data
  // Apply any requested snapping and rounding
  // Remove duplicate points, check for ring inversions
  //
  this.done = function() {
    var arcs;
    var lyr = {name: ''};

    if (collectionType == 'polygon' || collectionType == 'polyline') {

      if (dupeCount > 0) {
        verbose(utils.format("Removed %,d duplicate point%s", dupeCount, utils.pluralSuffix(dupeCount)));
      }
      if (skippedPathCount > 0) {
        // TODO: consider showing details about type of error
        message(utils.format("Removed %,d path%s with defective geometry", skippedPathCount, utils.pluralSuffix(skippedPathCount)));
      }

      if (pointId > 0) {
        if (pointId < xx.length) {
          xx = xx.subarray(0, pointId);
          yy = yy.subarray(0, pointId);
        }
        arcs = new ArcCollection(nn, xx, yy);

        // TODO: move shape validation after snapping (which may corrupt shapes)
        if (opts.auto_snap || opts.snap_interval) {
          T.start();
          MapShaper.snapCoords(arcs, opts.snap_interval);
          T.stop("Snapping points");
        }
        MapShaper.cleanShapes(shapes, arcs, collectionType);
      } else {
        message("No geometries were imported");
        collectionType = null;
      }
    } else if (collectionType == 'point' || collectionType === null) {
      // pass
    } else {
      error("Unexpected collection type:", collectionType);
    }

    // TODO: remove empty arcs, collapsed arcs
    // ...

    // If shapes are all null, don't add a shapes array or geometry_type
    if (collectionType) {
      lyr.geometry_type = collectionType;
      lyr.shapes = shapes;
    }

    return {
      arcs: arcs || null,
      info: {},
      layers: [lyr]
    };
  };
}
