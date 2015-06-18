/* @requires mapshaper-shapes, mapshaper-geom */

MapShaper.simplifyArcsFast = function(arcs, dist) {
  var xx = [],
      yy = [],
      nn = [],
      count;
  for (var i=0, n=arcs.size(); i<n; i++) {
    count = MapShaper.simplifyPathFast([i], arcs, dist, xx, yy);
    nn.push(count);
  }
  return new ArcCollection(nn, xx, yy);
};

MapShaper.simplifyShapeFast = function(shp, arcs, dist) {
  if (!shp || !dist) return null;
  var xx = [],
      yy = [],
      nn = [],
      shp2 = [];

  shp.forEach(function(path) {
    var count = MapShaper.simplifyPathFast(path, arcs, dist, xx, yy);
    if (count > 0) {
      shp2.push([nn.length]);
      nn.push(count);
    }
  });
  return {
    shape: shp2,
    arcs: new ArcCollection(nn, xx, yy)
  };
};

MapShaper.simplifyPathFast = function(path, arcs, dist, xx, yy) {
  var iter = arcs.getShapeIter(path),
      count = 0,
      prevX, prevY, x, y;
  while (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    if (count === 0 || distance2D(x, y, prevX, prevY) > dist) {
      xx.push(x);
      yy.push(y);
      prevX = x;
      prevY = y;
      count++;
    }
  }
  if (count > 2 && (x != prevX || y != prevY)) {
    xx.push(x);
    yy.push(y);
    count++;
  }
  while (count < 4 && count > 0) {
    xx.pop();
    yy.pop();
    count--;
  }
  return count;
};
