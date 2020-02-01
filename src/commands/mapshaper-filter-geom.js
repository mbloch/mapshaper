/* @requires mapshaper-common, mapshaper- */

api.filterGeom = function(lyr, arcs, opts) {
  if (!internal.layerHasGeometry(lyr)) {
    stop("Layer is missing geometry");
  }
  if (opts.bbox) {
    internal.filterByBoundsIntersection(lyr, arcs, opts);
  }
  api.filterFeatures(lyr, arcs, {remove_empty: true, verbose: false});
};

internal.filterByBoundsIntersection = function(lyr, arcs, opts) {
  var filter = internal.getBoundsIntersectionFilter(opts.bbox, lyr, arcs);
  internal.editShapes(lyr.shapes, filter);
};

internal.getBoundsIntersectionFilter = function(bbox, lyr, arcs) {
  var bounds = new Bounds(bbox);
  var filter = lyr.geometry_type == 'point' ?
        internal.getPointInBoundsTest(bounds) :
        internal.getPathBoundsIntersectionTest(bounds, arcs);
  return filter;
};

internal.getPointInBoundsTest = function(bounds) {
  return function(xy) {
    var contains =  bounds.containsPoint(xy[0], xy[1]);
    return contains ? xy : null;
  };
};

// V1 too-simple test: bounding-box intersection
// internal.getPathBoundsIntersectionTest = function(bounds, arcs) {
//   return function(path) {
//     return bounds.intersects(arcs.getSimpleShapeBounds(path)) ? path : null;
//   };
// };

internal.getPathBoundsIntersectionTest = function(bounds, arcs) {
  var bbox = bounds.toArray(),
    left = bbox[0],
    bottom = bbox[1],
    right = bbox[2],
    top = bbox[3];

  return function(path) {
    // case: bounding boxes don't intersect -> the path doesn't intersect the box
    if (!bounds.intersects(arcs.getSimpleShapeBounds(path))) {
      return null;
    }
    var intersects = false;
    var ax, ay, bx, by;
    var iter = arcs.getShapeIter(path);

    if (iter.hasNext()) {
      ax = iter.x;
      ay = iter.y;
    }
    while (iter.hasNext()) {
      bx = ax;
      by = ay;
      ax = iter.x;
      ay = iter.y;
      if (internal.segmentOutsideBBox(ax, ay, bx, by, left, bottom, right, top)) continue;
      if (internal.segmentInsideBBox(ax, ay, bx, by, left, bottom, right, top)) {
        intersects = true;
        break;
      }
      if (geom.segmentIntersection(left, top, right, top, ax, ay, bx, by) ||
          geom.segmentIntersection(left, bottom, right, bottom, ax, ay, bx, by) ||
          geom.segmentIntersection(left, bottom, left, top, ax, ay, bx, by) ||
          geom.segmentIntersection(right, bottom, right, top, ax, ay, bx, by)) {
        intersects = true;
        break;
      }
    }

    // case: bbox is entirely inside this ring
    if (!intersects && geom.testPointInRing(left, bottom, path, arcs)) {
      intersects = true;
    }
    return intersects ? path : null;
  };
};

// Return a function for testing if a shape (path or point) intersects a bounding box
// TODO: move this function to a different file
internal.getBBoxIntersectionTest = function(bbox, lyr, arcs) {
  var filter = internal.getBoundsIntersectionFilter(bbox, lyr, arcs);
  return function(shapeId) {
    var shp = lyr.shapes[shapeId];
    if (!shp) return false;
    for (var i=0; i<shp.length; i++) {
      if (filter(shp[i])) return true;
    }
    return false;
  };
};

// return array of shape ids
internal.findShapesIntersectingBBox = function(bbox, lyr, arcs) {
  var test = internal.getBBoxIntersectionTest(bbox, lyr, arcs);
  var ids = [];
  for (var i=0; i<lyr.shapes.length; i++) {
    if (test(i)) ids.push(i);
  }
  return ids;
};
