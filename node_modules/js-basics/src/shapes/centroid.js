/** @requires arrayutils, core.geo */

var Centroid = {};

Centroid.findPolygonCentroid = function(shp) {
  var maxArea = 0;
  var maxPart; // VertexSet

  // get part w/ largest bb
  Utils.forEach(shp.parts, function(vec) {
    var area = vec.width() * vec.height();
    if (area > maxArea) {
      maxPart = vec;
      maxArea = area;
    }
  });

  var p = null;
  if (maxPart) {
    p = Centroid.findRingCentroid(maxPart);
  }
  return p;
};


Centroid.findRingCentroid = function(set) {
  var aSum = 0;
  var xSum = 0;
  var ySum = 0;

  if ( !set.hasNext() ) {
    return null;
  }
  
  var xPrev = set.nextX;
  var yPrev = set.nextY;

  var intersections = 0;

  while (set.hasNext()) {
    //p = set.nextVertex;
    //var xNext = p.x;
    //var yNext = p.y;
    var xNext = set.nextX;
    var yNext = set.nextY;
    
    var tmp = xPrev * yNext - xNext * yPrev;
    aSum += tmp;
    xSum += (xPrev + xNext ) * tmp;
    ySum += (yPrev + yNext ) * tmp;

    xPrev = xNext;
    yPrev = yNext;
  }
  
  var area = aSum * 0.5;

  var cx = 1 / (6 * area) * xSum;
  var cy = 1 / (6 * area) * ySum;

  return new Point(cx, cy);
};