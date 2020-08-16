import geom from '../geom/mapshaper-geom';

// Find ids of vertices with identical coordinates to x,y in an ArcCollection
// Caveat: does not exclude vertices that are not visible at the
//   current level of simplification.
export function findVertexIds(x, y, arcs) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      ids = [];
  for (var i=0, n=xx.length; i<n; i++) {
    if (xx[i] == x && yy[i] == y) ids.push(i);
  }
  return ids;
}

export function getVertexCoords(i, arcs) {
  var data = arcs.getVertexData();
  return {x: data.xx[i], y: data.yy[i]};
}

export function setVertexCoords(x, y, i, arcs) {
  var data = arcs.getVertexData();
  data.xx[i] = x;
  data.yy[i] = y;
}

export function findNearestVertex(x, y, shp, arcs, spherical) {
  var calcLen = spherical ? geom.greatCircleDistance : geom.distance2D,
      minLen = Infinity,
      minX, minY, dist, iter;
  for (var i=0; i<shp.length; i++) {
    iter = arcs.getShapeIter(shp[i]);
    while (iter.hasNext()) {
      dist = calcLen(x, y, iter.x, iter.y);
      if (dist < minLen) {
        minLen = dist;
        minX = iter.x;
        minY = iter.y;
      }
    }
  }
  return minLen < Infinity ? {x: minX, y: minY} : null;
}