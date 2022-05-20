
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertIntervalParam } from '../geom/mapshaper-units';
import { snapCoords } from '../paths/mapshaper-snapping';
import { layerHasPaths, divideFeaturesByType } from '../dataset/mapshaper-layer-utils';
import { cleanShapes } from '../paths/mapshaper-path-repair-utils';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import { verbose, stop, message } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { fixInconsistentFields } from '../datatable/mapshaper-data-utils';
import { ArcCollection } from '../paths/mapshaper-arcs';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

// Apply snapping, remove duplicate coords and clean up defective paths in a dataset
// Assumes that any CRS info has been added to the dataset
// @opts: import options
export function cleanPathsAfterImport(dataset, opts) {
  var arcs = dataset.arcs;
  var snapDist;
  if (opts.snap || opts.auto_snap || opts.snap_interval) { // auto_snap is older name
    if (opts.snap_interval) {
      snapDist = convertIntervalParam(opts.snap_interval, getDatasetCRS(dataset));
    }
    if (arcs) {
      snapCoords(arcs, snapDist);
    }
  }
  dataset.layers.forEach(function(lyr) {
    if (layerHasPaths(lyr)) {
      cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }
  });
}

export function pointHasValidCoords(p) {
  // The Shapefile spec states that "measures" less then -1e38 indicate null values
  // This should not apply to coordinate data, but in-the-wild Shapefiles have been
  // seen with large negative values indicating null coordinates.
  // This test catches these and also NaNs, but does not detect other kinds of
  // invalid coords
  return p[0] > -1e38 && p[1] > -1e38;
}

// Accumulates points in buffers until #endPath() is called
// @drain callback: function(xarr, yarr, size) {}
//
function PathImportStream(drain) {
  var buflen = 10000,
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
// @opts.reserved_points -- estimate of points in dataset, for pre-allocating buffers
//
export function PathImporter(opts) {
  var bufSize = opts.reserved_points > 0 ? opts.reserved_points : 20000,
      xx = new Float64Array(bufSize),
      yy = new Float64Array(bufSize),
      shapes = [],
      properties = [],
      nn = [],
      types = [],
      collectionType = opts.type || null, // possible values: polygon, polyline, point
      round = null,
      pathId = -1,
      shapeId = -1,
      pointId = 0,
      dupeCount = 0,
      openRingCount = 0;

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  // mix in #addPoint() and #endPath() methods
  utils.extend(this, new PathImportStream(importPathCoords));

  this.startShape = function(d) {
    shapes[++shapeId] = null;
    if (d) properties[shapeId] = d;
  };

  this.importLine = function(points) {
    if (points.length < 2) {
      verbose("Skipping a defective line");
      return;
    }
    setShapeType('polyline');
    this.importPath(points);
  };

  this.importPoints = function(points) {
    setShapeType('point');
    points = points.filter(pointHasValidCoords);
    if (round) {
      points.forEach(function(p) {
        p[0] = round(p[0]);
        p[1] = round(p[1]);
      });
    }
    points.forEach(appendToShape);
  };

  this.importRing = function(points, isHole) {
    var area = geom.getPlanarPathArea2(points);
    if (!area || points.length < 4) {
      verbose("Skipping a defective ring");
      return;
    }
    setShapeType('polygon');
    if (isHole === true && area > 0 || isHole === false && area < 0) {
      // GeoJSON rings may be either direction -- no point in logging reversal
      // verbose("Reversing", isHole ? "a CW hole" : "a CCW ring");
      points.reverse();
    }
    this.importPath(points);
  };

  // Import an array of [x, y] Points
  this.importPath = function importPath(points) {
    var p;
    for (var i=0, n=points.length; i<n; i++) {
      p = points[i];
      this.addPoint(p[0], p[1]);
    }
    this.endPath();
  };

  // Return imported dataset
  // Apply any requested snapping and rounding
  // Remove duplicate points, check for ring inversions
  //
  this.done = function() {
    var arcs;
    var layers;
    var lyr = {name: ''};
    var snapDist;

    if (dupeCount > 0) {
      verbose(utils.format("Removed %,d duplicate point%s", dupeCount, utils.pluralSuffix(dupeCount)));
    }
    if (openRingCount > 0) {
      message(utils.format("Closed %,d open polygon ring%s", openRingCount, utils.pluralSuffix(openRingCount)));
    }
    if (pointId > 0) {
       if (pointId < xx.length) {
        xx = xx.subarray(0, pointId);
        yy = yy.subarray(0, pointId);
      }
      arcs = new ArcCollection(nn, xx, yy);

      //if (opts.snap || opts.auto_snap || opts.snap_interval) { // auto_snap is older name
      //  internal.snapCoords(arcs, opts.snap_interval);
      //}
    }

    if (collectionType == 'mixed') {
      layers = divideFeaturesByType(shapes, properties, types);

    } else {
      lyr = {geometry_type: collectionType};
      if (collectionType) {
        lyr.shapes = shapes;
      }
      if (properties.length > 0) {
        lyr.data = new DataTable(properties);
      }
      layers = [lyr];
    }

    layers.forEach(function(lyr) {
      //if (internal.layerHasPaths(lyr)) {
        //internal.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
      //}
      if (lyr.data) {
        fixInconsistentFields(lyr.data.getRecords());
      }
    });

    return {
      arcs: arcs || null,
      info: {},
      layers: layers
    };
  };

  function setShapeType(t) {
    var currType = shapeId < types.length ? types[shapeId] : null;
    if (!currType) {
      types[shapeId] = t;
      if (!collectionType) {
        collectionType = t;
      } else if (t != collectionType) {
        collectionType = 'mixed';
      }
    } else if (currType != t) {
      stop("Unable to import mixed-geometry features");
    }
  }

  function checkBuffers(needed) {
    if (needed > xx.length) {
      var newLen = Math.max(needed, Math.ceil(xx.length * 1.5));
      xx = utils.extendBuffer(xx, newLen, pointId);
      yy = utils.extendBuffer(yy, newLen, pointId);
    }
  }

  function appendToShape(part) {
    var currShape = shapes[shapeId] || (shapes[shapeId] = []);
    currShape.push(part);
  }

  function appendPath(n) {
    pathId++;
    nn[pathId] = n;
    appendToShape([pathId]);
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

    // check for open rings
    if (collectionType == 'polygon' && count > 0) {
      if (xsrc[0] != xsrc[n-1] || ysrc[0] != ysrc[n-1]) {
        checkBuffers(pointId + 1);
        xx[pointId] = xsrc[0];
        yy[pointId] = ysrc[0];
        openRingCount++;
        pointId++;
        count++;
      }
    }

    appendPath(count);
  }
}
