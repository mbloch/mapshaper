/* @requires mapshaper-shape-geom */


geom.getPathCentroid = function(ids, arcs) {
  var iter = arcs.getShapeIter(ids),
      sum = 0,
      sumX = 0,
      sumY = 0,
      ax, ay, tmp, area;
  if (!iter.hasNext()) return null;
  ax = iter.x;
  ay = iter.y;
  while (iter.hasNext()) {
    tmp = ax * iter.y - ay * iter.x;
    sum += tmp;
    sumX += tmp * (iter.x + ax);
    sumY += tmp * (iter.y + ay);
    ax = iter.x;
    ay = iter.y;
  }
  area = sum / 2;
  if (area === 0) {
    return geom.getAvgPathXY(ids, arcs);
  } else return {
    x: sumX / (6 * area),
    y: sumY / (6 * area)
  };
};

geom.getShapeCentroid = function(shp, arcs) {
  var maxPath = geom.getMaxPath(shp, arcs);
  return maxPath ? geom.getPathCentroid(maxPath, arcs) : null;
};

// Get a point suitable for anchoring a label
// Method:
// - find largest ring of polygon (see keep-shapes)
// - if area of largest ring > x% of bbox of largest ring:
//     get centroid;
//     if centroid is inside polygon:
//       return centroid
// - get array of x-values along y-extent of largest ring
// - for each x:
//     get array of internal segments;
//     save midpoint of each segment;
// - for each midpoint:
//     get smallest distance from polygon boundary
// - use midpoint with the greatest distance
//
geom.getInteriorPoint = function(shp, arcs) {
  var maxPath = geom.getMaxPath(shp, arcs),
      pathBounds = arcs.getSimpleShapeBounds(ids),
      NUM_TICS = 20;

  if (!pathBounds.hasBounds() || pathBounds.area() === 0) {
    return null;
  }

  // get y values:
  var tics = utils.getInnerTicks(pathBounds.ymin, pathBounds.ymax, NUM_TICS);
  var midpoints = tics.reduce(function(memo, y) {
    var a = [pathBounds.xmin, y],
        b = [pathBounds.xmax, y];
    var segments = MapShaper.findIntersectingSegments(a, b, shp, arcs);
    return memo;
  }, []);

  return null;
};

MapShaper.findIntersectingSegments = function(a, b, shp, arcs) {

};

// TODO: find better home + name for this
utils.getInnerTics = function(min, max, steps) {
  var range = max - min,
      step = range / (steps + 1),
      arr = [];
  for (var i = 1; i<=steps; i++) {
    arr.push(min + step * i);
  }
  return arr;
};
