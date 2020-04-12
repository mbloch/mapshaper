import { layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { Bounds } from '../geom/mapshaper-bounds';

export function countPointsInLayer(lyr) {
  var count = 0;
  if (layerHasPoints(lyr)) {
    forEachPoint(lyr.shapes, function() {count++;});
  }
  return count;
}

export function getPointBounds(shapes) {
  var bounds = new Bounds();
  forEachPoint(shapes, function(p) {
    bounds.mergePoint(p[0], p[1]);
  });
  return bounds;
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

export function forEachPoint(shapes, cb) {
  var i, n, j, m, shp;
  for (i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    for (j=0, m=shp ? shp.length : 0; j<m; j++) {
      cb(shp[j], i);
    }
  }
}

