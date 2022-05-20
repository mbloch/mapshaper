import { ArcCollection } from '../paths/mapshaper-arcs';
import geom from '../geom/mapshaper-geom';

export function simplifyArcsFast(arcs, dist) {
  var xx = [],
      yy = [],
      nn = [],
      count;
  for (var i=0, n=arcs.size(); i<n; i++) {
    count = simplifyPathFast([i], arcs, dist, xx, yy);
    if (count == 1) {
      count = 0;
      xx.pop();
      yy.pop();
    }
    nn.push(count);
  }
  return new ArcCollection(nn, xx, yy);
}

export function simplifyPolygonFast(shp, arcs, dist) {
  if (!shp || !dist) return null;
  var xx = [],
      yy = [],
      nn = [],
      shp2 = [];

  shp.forEach(function(path) {
    var count = simplifyPathFast(path, arcs, dist, xx, yy);
    while (count < 4 && count > 0) {
      xx.pop();
      yy.pop();
      count--;
    }
    if (count > 0) {
      shp2.push([nn.length]);
      nn.push(count);
    }
  });
  return {
    shape: shp2.length > 0 ? shp2 : null,
    arcs: new ArcCollection(nn, xx, yy)
  };
}

function simplifyPathFast(path, arcs, dist, xx, yy) {
  var iter = arcs.getShapeIter(path),
      count = 0,
      prevX, prevY, x, y;
  while (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    if (count === 0 || geom.distance2D(x, y, prevX, prevY) > dist) {
      xx.push(x);
      yy.push(y);
      prevX = x;
      prevY = y;
      count++;
    }
  }
  if (x != prevX || y != prevY) {
    xx.push(x);
    yy.push(y);
    count++;
  }
  return count;
}
