import { layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { stop } from '../utils/mapshaper-logging';

export function countPointsInLayer(lyr) {
  var count = 0;
  if (layerHasPoints(lyr)) {
    forEachPoint(lyr.shapes, function() {count++;});
  }
  return count;
}

// export function getPointBounds(shapes) {
//   var bounds = new Bounds();
//   forEachPoint(shapes, function(p) {
//     bounds.mergePoint(p[0], p[1]);
//   });
//   return bounds;
// }

export function getPointBounds(shapes) {
  var bounds = new Bounds();
  var shp, x, y, xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (var i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
      x = shp[j][0];
      y = shp[j][1];
      if (x > xmax) xmax = x;
      if (x < xmin) xmin = x;
      if (y > ymax) ymax = y;
      if (y < ymin) ymin = y;
    }
  }
  return shp ? new Bounds(xmin, ymin, xmax, ymax) : new Bounds();
}

export function getPointFeatureBounds(shape, bounds) {
  var n = shape ? shape.length : 0;
  var p;
  if (!bounds) bounds = new Bounds();
  for (var i=0; i<n; i++) {
    p = shape[i];
    bounds.mergePoint(p[0], p[1]);
  }
  return bounds;
}

// NOTE: layers can have multipoint features and null features
export function getPointsInLayer(lyr) {
  var coords = [];
  forEachPoint(lyr.shapes, function(p) {
    coords.push(p);
  });
  return coords;
}

// Iterate over each [x,y] point in a layer
// shapes: one layer's "shapes" array
export function forEachPoint(shapes, cb) {
  var i, n, j, m, shp;
  for (i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    for (j=0, m=shp ? shp.length : 0; j<m; j++) {
      cb(shp[j], i);
    }
  }
}

