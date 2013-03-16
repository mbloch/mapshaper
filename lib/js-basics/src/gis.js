/**
 * Support for point-in-polygon testing and for finding the minimum distance
 * from a point to a polygon or polyline.
 */
var Proximity = new function() {

  /**
   * Returns 0 if point is inside polygon, distance if outside.
   */
  this.getPointPolygonDistance = function(x, y, shp) {
    var minDist = this.getPointPolylineDistance(x, y, shp);
    var inside = this.testPointInPolygon(x, y, shp);
    return minDist * (inside ? 0 : 1);
  };


  /**
   * Tests whether an x,y location (in projected coordinates) falls inside
   * a polygon. Inconsistent handling of case where point falls exactly on 
   * the polygon boundary.
   */
  this.testPointInPolygon = function(x, y, shp) {
    if (isNaN(x) || isNaN(y)) {
      return false;
    }

    var parts = shp.parts;
    var intersections = 0;

    /*
    for (var i = 0; i < parts.length; i++) {
      var vec = parts[i];
      var haveHit = testPointInRing(x, y, vec);
      if (haveHit) {
        intersections++;
      }
    }*/
    while(shp.nextPart()) {
      var haveHit = testPointInRing(x, y, shp);
      if (haveHit) {
        intersections++;
      }        
    }

    // Odd number of intersections: inside polgon
    // Even number: outside polygon or inside polygon hole.
    return intersections % 2 == 1;
  };

  /**
   * Returns the distance from a point to the nearest point on the 
   * boundary of a ShapeVector or MultiPath (i.e. multi-part polyline or polygon).
   * @param {number} x X coord.
   * @param {number} y Y coord.
   * @param {ShapeVector} shp ShapeVector.
   * @return {number} Distance from point to shape.
   */
  this.getPointPolylineDistance = function(x, y, shp) {
   if (isNaN(x) || isNaN(y)) {
      return Infinity;
    }

    var minDistSq = Infinity;
    while(shp.nextPart()) {
      var distSq = findPointToVectorDistanceSq(x, y, shp);
      if (distSq < minDistSq) {
        minDistSq = distSq;
      }
    }

    var dist = Math.sqrt(minDistSq);
    return dist;
  };

  function getYIntercept(x, x1, y1, x2, y2) {
    var yInt = y1 + (x - x1) * (y2 - y1) / (x2 - x1);
    return yInt;
  }

  /*
  function getXIntercept(y, x1, y1, x2, y2) {
    var xInt = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
    return xInt;
  }
  */

  /**
   * Tests whether a point falls within a polygon ring.
   * Uses the ray-intersection method: 
   *    Count intersections between a ray and each segment in the ring.
   *    Odd number of intersections = inside, even number = outside.
   * Output is undefined when point falls on the edge of the shape.
   * Assumes: VertexSet is a closed ring.
   */
  function testPointInRing(x, y, set) {
    //set.hasNext(); // Iterate to first vertex (assuming it exists).
    set.nextPoint();
    var xPrev = set.x;
    var yPrev = set.y;
    var intersections = 0;

    while (set.nextPoint()) {
      var xNext = set.x;
      var yNext = set.y;

      if (x < xPrev && x < xNext || x > xPrev && x > xNext || y > yPrev && y > yNext) {
        // Case A: Point falls to the left or right of the segment
        // or is above the segment bounding box: no intersection.
      }
      else if (y < yPrev && y < yNext || xPrev == xNext) {
        // B: Point is below the segment or segment is vertical: intersection 
        intersections++;
      }
      else {
        // C: Point is within the segment bounding box: 
        //    Intersects if y intercept is above point y.
        // Uncommon case, inlining doesn't make sense.
        var yInt = getYIntercept(x, xPrev, yPrev, xNext, yNext);
        if (yInt > y) {
          intersections++;
        }
      }
      xPrev = xNext;
      yPrev = yNext;
    }

    return intersections % 2 == 1;
  }

  /**
   * 
   * @param {number} x X coord of point to test.
   * @param {number} y Y coord.
   * @param {VectorSet} 
   * @return 
   */
  function findPointToVectorDistanceSq(x, y, shp) {
    shp.nextPoint(); // iterate to first point
    var xPrev = shp.x;
    var yPrev = shp.y;

    var minDist2 = Infinity;
    var dist2;

    var longDist2, shortDist2;

    var dist2Prev = (x - xPrev) * (x - xPrev) + (y - yPrev) * (y - yPrev);

    while (shp.nextPoint()) {
      var xNext = shp.x;
      var yNext = shp.y;

      var dist2Next = (x - xNext) * (x - xNext) + (y - yNext) * (y - yNext);
      var segLen2 = (xPrev - xNext) * (xPrev - xNext) + (yPrev - yNext) * (yPrev - yNext);

      // find distance from line
      //
      var tmp = (xNext - xPrev) * (yPrev - y) - (xPrev - x) * (yNext - yPrev);
      var lineDist2 = tmp * tmp / segLen2;

      //
      //
      if (dist2Prev > dist2Next) {
        longDist2 = dist2Prev;
        shortDist2 = dist2Next;
      }
      else {
        longDist2 = dist2Next;
        shortDist2 = dist2Prev;
      }

      // determine if point is between segment end-points
      dist2 = (longDist2 - lineDist2) < segLen2 ? lineDist2 : shortDist2;

      // update minDist2
      if (dist2 < minDist2) {
        minDist2 = dist2;
      }

      xPrev = xNext;
      yPrev = yNext;
      dist2Prev = dist2Next;
    }

    return minDist2;
  }
}
