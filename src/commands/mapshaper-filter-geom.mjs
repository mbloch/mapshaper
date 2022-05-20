import { segmentInsideBBox } from '../clipping/mapshaper-bbox2-clipping';
import { segmentOutsideBBox } from '../clipping/mapshaper-bbox2-clipping';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { layerHasGeometry } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { Bounds } from '../geom/mapshaper-bounds';
import geom from '../geom/mapshaper-geom';
import { stop } from '../utils/mapshaper-logging';

cmd.filterGeom = function(lyr, arcs, opts) {
  if (!layerHasGeometry(lyr)) {
    stop("Layer is missing geometry");
  }
  if (opts.bbox) {
    filterByBoundsIntersection(lyr, arcs, opts);
  }
  cmd.filterFeatures(lyr, arcs, {remove_empty: true, verbose: false});
};

function filterByBoundsIntersection(lyr, arcs, opts) {
  var filter = getBoundsIntersectionFilter(opts.bbox, lyr, arcs);
  editShapes(lyr.shapes, filter);
}

function getBoundsIntersectionFilter(bbox, lyr, arcs) {
  var bounds = new Bounds(bbox);
  var filter = lyr.geometry_type == 'point' ?
        getPointInBoundsTest(bounds) :
        getPathBoundsIntersectionTest(bounds, arcs);
  return filter;
}

function getPointInBoundsTest(bounds) {
  return function(xy) {
    var contains =  bounds.containsPoint(xy[0], xy[1]);
    return contains ? xy : null;
  };
}

// V1 too-simple test: bounding-box intersection
// internal.getPathBoundsIntersectionTest = function(bounds, arcs) {
//   return function(path) {
//     return bounds.intersects(arcs.getSimpleShapeBounds(path)) ? path : null;
//   };
// };

function getPathBoundsIntersectionTest(bounds, arcs) {
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
      if (segmentOutsideBBox(ax, ay, bx, by, left, bottom, right, top)) continue;
      if (segmentInsideBBox(ax, ay, bx, by, left, bottom, right, top)) {
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
}

// Return a function for testing if a shape (path or point) intersects a bounding box
// TODO: move this function to a different file
export function getBBoxIntersectionTest(bbox, lyr, arcs) {
  var filter = getBoundsIntersectionFilter(bbox, lyr, arcs);
  return function(shapeId) {
    var shp = lyr.shapes[shapeId];
    if (!shp) return false;
    for (var i=0; i<shp.length; i++) {
      if (filter(shp[i])) return true;
    }
    return false;
  };
}

// return array of shape ids
export function findShapesIntersectingBBox(bbox, lyr, arcs) {
  var test = getBBoxIntersectionTest(bbox, lyr, arcs);
  var ids = [];
  for (var i=0; i<lyr.shapes.length; i++) {
    if (test(i)) ids.push(i);
  }
  return ids;
}
