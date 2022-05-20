import geom from '../geom/mapshaper-geom';

export function findNearestVertices(p, shp, arcs) {
  var p2 = findNearestVertex(p[0], p[1], shp, arcs);
  return findVertexIds(p2.x, p2.y, arcs);
}


export function snapVerticesToPoint(ids, p, arcs, final) {
  ids.forEach(function(idx) {
    setVertexCoords(p[0], p[1], idx, arcs);
  });
  if (final) {
    // kludge to get dataset to recalculate internal bounding boxes
    arcs.transformPoints(function() {});
  }
}


// p: point to snap
// ids: ids of nearby vertices, possibly including an arc endpoint
export function snapPointToArcEndpoint(p, ids, arcs) {
  var p2, p3, dx, dy;
  ids.forEach(function(idx) {
    if (vertexIsArcStart(idx, arcs)) {
      p2 = getVertexCoords(idx + 1, arcs);
    } else if (vertexIsArcEnd(idx, arcs)) {
      p2 = getVertexCoords(idx - 1, arcs);
    }
  });
  if (!p2) return;
  dx = p2[0] - p[0];
  dy = p2[1] - p[1];
  if (Math.abs(dx) > Math.abs(dy)) {
    p[1] = p2[1]; // snap y coord
  } else {
    p[0] = p2[0];
  }
}

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
  return [data.xx[i], data.yy[i]];
}

export function vertexIsArcEnd(idx, arcs) {
  // Test whether the vertex at index @idx is the endpoint of an arc
  var data = arcs.getVertexData(),
      ii = data.ii,
      nn = data.nn;
  for (var j=0, n=ii.length; j<n; j++) {
    if (idx === ii[j] + nn[j] - 1) return true;
  }
  return false;
}

export function vertexIsArcStart(idx, arcs) {
  var ii = arcs.getVertexData().ii;
  for (var j=0, n=ii.length; j<n; j++) {
    if (idx === ii[j]) return true;
  }
  return false;
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
