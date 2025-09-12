
import { reversePath } from '../paths/mapshaper-path-utils';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';

// Returns a function for generating GeoJSON geometries (MultiLineString or MultiPolygon)
export function getPolylineBufferMaker(arcs, geod, getBearing, opts) {
  var maker = getPathBufferMaker(arcs, geod, getBearing, opts);
  var geomType = opts.geometry_type;
  // polyline output could be used for debugging
  var outputGeom = opts.output_geometry == 'polyline' ? 'polyline' : 'polygon';

  function pathBufferCoords(pathArcs, dist) {
    var pathCoords = maker(pathArcs, dist);
    var revPathArcs;
    if (geomType == 'polyline') {
      revPathArcs = reversePath(pathArcs.concat());
      pathCoords = pathCoords.concat(maker(revPathArcs, dist));
    }
    pathCoords.push(pathCoords[0]); // close path
    return outputGeom == 'polyline' ? pathCoords : [pathCoords];
  }

  return function(shape, dist) {
    var geom = {
      type: outputGeom == 'polyline' ? 'MultiLineString' : 'MultiPolygon',
      coordinates: []
    };
    for (var i=0; i<shape.length; i++) {
      geom.coordinates.push(pathBufferCoords(shape[i], dist));
    }
    return geom.coordinates.length == 0 ? null : geom;
  };
}


function getPathBufferMaker(arcs, geod, getBearing, opts) {

  var backtrackSteps = opts.backtrack >= 0 ? opts.backtrack : 50;
  var pathIter = new ShapeIter(arcs);
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  // var tolerance;
  // TODO: implement other join styles than round

  function addRoundJoin(arr, x, y, startDir, angle, dist) {
    var increment = 10;
    var endDir = startDir + angle;
    var dir = startDir + increment;
    while (dir < endDir) {
      addBufferVertex(arr, geod(x, y, dir, dist), backtrackSteps);
      dir += increment;
    }
  }

  // function addRoundJoin2(arr, x, y, startDir, angle, dist) {
  //   var increment = 10;
  //   var endDir = startDir + angle;
  //   var dir = startDir + increment;
  //   while (dir < endDir) {
  //     addBufferVertex(arr, geod(x, y, dir, dist), backtrackSteps);
  //     dir += increment;
  //   }
  // }

  // Test if two points are within a snapping tolerance
  // TODO: calculate the tolerance more sensibly
  function veryClose(x1, y1, x2, y2, tol) {
    var dist = geom.distance2D(x1, y1, x2, y2);
    return dist < tol;
  }

  function veryCloseToPrevPoint(arr, x, y) {
    var prev = arr[arr.length - 1];
    return veryClose(prev[0], prev[1], x, y, 0.000001);
  }

  function appendPoint(arr, p) {
    var prev = arr[arr.length - 1];
    if (!veryClose(prev[0], prev[1], p[0], p[1], 1e-10)) {
      arr.push(p);
    } else {
      //var dist = geom.distance2D(prev[0], prev[1], p[0], p[1]);
      //console.log(dist)
    }
  }

  function makeCap(x, y, direction, dist) {
    if (capStyle == 'flat') {
      return [[x, y]];
    }
    return makeRoundCap(x, y, direction, dist);
  }

  function makeRoundCap(x, y, segmentDir, dist) {
    var points = [];
    var increment = 10;
    var startDir = segmentDir - 90;
    var angle = increment;
    while (angle < 180) {
      points.push(geod(x, y, startDir + angle, dist));
      angle += increment;
    }
    return points;
  }

  // get angle between two extruded segments in degrees
  // positive angle means join in convex (range: 0-180 degrees)
  // negative angle means join is concave (range: -180-0 degrees)
  function getJoinAngle(direction1, direction2) {
    var delta = direction2 - direction1;
    if (delta > 180) {
      delta -= 360;
    }
    if (delta < -180) {
      delta += 360;
    }
    return delta;
  }

  function addBufferVertex(arr, d, maxBacktrack) {
    var a, b, c, hit;
    for (var i=0, idx = arr.length - 3; i<maxBacktrack && idx >= 0; i++, idx--) {
      c = arr[arr.length - 1];
      a = arr[idx];
      b = arr[idx + 1];
      // TODO: consider using a geodetic intersection function for lat-long datasets
      hit = bufferIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      if (hit) {
        // TODO: handle collinear segments
        // if (hit.length != 2) console.log('COLLINEAR', hit)
        // segments intersect -- replace two internal segment endpoints with xx point
        while (arr.length > idx + 1) arr.pop();
        appendPoint(arr, hit);
      }
    }

    appendPoint(arr, d);
  }

  return function(path, dist) {
    var left = [];
    var x0, y0, x1, y1, x2, y2;
    var p1, p2;
    var bearing, prevBearing, firstBearing, joinAngle;
    var i = 0;
    pathIter.init(path);

    while (pathIter.hasNext()) {
      // TODO: use a tolerance
      if (pathIter.x === x2 && pathIter.y === y2) continue; // skip duplicate points
      x1 = x2;
      y1 = y2;
      x2 = pathIter.x;
      y2 = pathIter.y;
      if (i >= 1) {
        prevBearing = bearing;
        bearing = getBearing(x1, y1, x2, y2);
        p1 = geod(x1, y1, bearing - 90, dist);
        p2 = geod(x2, y2, bearing - 90, dist);
        // left.push([x1, y1], p1) // debug extrusion lines
        // left.push([x2, y2], p2) // debug extrusion lines
      }
      if (i == 1) {
        firstBearing = bearing;
        x0 = x1;
        y0 = y1;
        left.push(p1, p2);
      }
      if (i > 1) {
        joinAngle = getJoinAngle(prevBearing, bearing);
        if (veryCloseToPrevPoint(left, p1[0], p1[1])) {
          // skip first point
          addBufferVertex(left, p2, backtrackSteps);
        } else if (joinAngle > 0) {
          addRoundJoin(left, x1, y1, prevBearing - 90, joinAngle, dist);
          addBufferVertex(left, p1, backtrackSteps);
          addBufferVertex(left, p2, backtrackSteps);
        } else {
          addBufferVertex(left, p1, backtrackSteps);
          addBufferVertex(left, p2, backtrackSteps);
        }
      }
      i++;
    }
    // TODO: handle defective polylines

    if (x2 == x0 && y2 == y0) {
      // add join to finish closed path
      joinAngle = getJoinAngle(bearing, firstBearing);
      if (joinAngle > 0) {
        addRoundJoin(left, x2, y2, bearing - 90, joinAngle, dist);
      }
    } else {
      // add a cap to finish open path
      left.push.apply(left, makeCap(x2, y2, bearing, dist));
    }
    return left;
  };
}

export function addBufferVertex(arr, d, maxBacktrack) {
  var a, b, c, hit;
  for (var i=0, idx = arr.length - 3; i<maxBacktrack && idx >= 0; i++, idx--) {
    c = arr[arr.length - 1];
    a = arr[idx];
    b = arr[idx + 1];
    // TODO: consider using a geodetic intersection function for lat-long datasets
    hit = bufferIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
    if (hit) {
      // TODO: handle collinear segments
      if (hit.length != 2) {
        // console.log("COLLINEAR", hit)
      }
      // segments intersect -- replace two internal segment endpoints with xx point
      while (arr.length > idx + 1) arr.pop();
      // TODO: check proximity of hit to several points
      arr.push(hit);
    }
  }

  // TODO: check proximity to previous point
  arr.push(d); // add new point
}

// Exclude segments with non-intersecting bounding boxes before
// calling intersection function
// Possibly slightly faster than direct call... not worth it?
export function bufferIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  if (ax < cx && ax < dx && bx < cx && bx < dx ||
      ax > cx && ax > dx && bx > cx && bx > dx ||
      ay < cy && ay < dy && by < cy && by < dy ||
      ay > cy && ay > dy && by > cy && by > dy) return null;
  return geom.segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy);
}
