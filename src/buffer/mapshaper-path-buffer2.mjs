import { testSegmentBoundsIntersection } from '../geom/mapshaper-bounds-geom';
import { segmentTurn } from '../geom/mapshaper-segment-geom';
import { bufferIntersection } from '../buffer/mapshaper-path-buffer';
import { reversePath } from '../paths/mapshaper-path-utils';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { Bounds } from '../geom/mapshaper-bounds';

export function getPolylineBufferMaker2(arcs, geod, getBearing, opts) {
  var makeLeftBuffer = getPathBufferMaker2(arcs, geod, getBearing, opts);
  var geomType = opts.geometry_type;

  function polygonCoords(ring) {
    return [ring];
  }

  function needLeftBuffer(path, arcs) {
    if (geomType == 'polyline') {
      return opts.type != 'right';
    }
    // assume polygon type
    if (opts.type == 'outer') {
      return geom.getPathWinding(path, arcs) == 1;
    }
    if (opts.type == 'inner') {
      return geom.getPathWinding(path, arcs) == -1;
    }
    return true;
  }

  function needRightBuffer() {
    return geomType == 'polyline' && opts.type != 'left';
  }

  function makeBufferParts(pathArcs, dist) {
    var leftPartials, rightPartials, parts, revPathArcs;

    if (needLeftBuffer(pathArcs, arcs)) {
      leftPartials = makeLeftBuffer(pathArcs, dist);
    }
    if (needRightBuffer()) {
      revPathArcs = reversePath(pathArcs.concat());
      rightPartials = makeLeftBuffer(revPathArcs, dist);
    }
    parts = (leftPartials || []).concat(rightPartials || []);
    return parts.map(polygonCoords);
  }

  // Returns a GeoJSON Geometry (MultiLineString or MultiPolygon) or null
  return function(shape, dist) {
    var geom = {
      type: 'MultiPolygon',
      coordinates: []
    };
    for (var i=0; i<shape.length; i++) {
      geom.coordinates = geom.coordinates.concat(makeBufferParts(shape[i], dist));
    }
    return geom.coordinates.length == 0 ? null : geom;
  };
}

function getPathBufferMaker2(arcs, geod, getBearing, opts) {
  var backtrackSteps = opts.backtrack >= 0 ? opts.backtrack : 50;
  var pathIter = new ShapeIter(arcs);
  // var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  var partials, left, center;
  var bounds;
  // TODO: implement other join styles than round

  // function updateTolerance(dist) {

  // }

  function addRoundJoin(x, y, startDir, angle, dist) {
    var increment = 10;
    var endDir = startDir + angle;
    var dir = startDir + increment;
    while (dir < endDir) {
      addBufferVertex(geod(x, y, dir, dist));
      dir += increment;
    }
  }

  // function addRoundJoin2(arr, x, y, startDir, angle, dist) {
  //   var increment = 10;
  //   var endDir = startDir + angle;
  //   var dir = startDir + increment;
  //   while (dir < endDir) {
  //     addBufferVertex(arr, geod(x, y, dir, dist));
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

  // function makeCap(x, y, direction, dist) {
  //   if (capStyle == 'flat') {
  //     return [[x, y]];
  //   }
  //   return makeRoundCap(x, y, direction, dist);
  // }

  // function makeRoundCap(x, y, segmentDir, dist) {
  //   var points = [];
  //   var increment = 10;
  //   var startDir = segmentDir - 90;
  //   var angle = increment;
  //   while (angle < 180) {
  //     points.push(geod(x, y, startDir + angle, dist));
  //     angle += increment;
  //   }
  //   return points;
  // }

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


  // TODO: handle polygon holes
  function addBufferVertex(d) {
    var arr = left;
    var a, b, c, c0, hit;
    // c is the start point of the segment formed by appending point d to the polyline.
    c0 = c = arr[arr.length - 1];
    for (var i=0, idx = arr.length - 3; idx >= 0; i++, idx--) {
      a = arr[idx];
      b = arr[idx + 1];
      // TODO: consider using a geodetic intersection function for lat-long datasets
      hit = bufferIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      if (hit) {
        if (segmentTurn(a, b, c, d) == 1) {
          // interpretation: segment cd crosses segment ab from outside to inside
          // the buffer -- we need to start a new partial; otherwise,
          // the following code would likely remove a loop representing
          // an oxbow-type hole in the buffer.
          //
          finishPartial();
          break;
        } else {
          // console.log('HIT', internal.segmentTurn(a, b, c, d))
        }
        // TODO: handle collinear segments (consider creating new partial)
        // if (hit.length != 2) console.log('COLLINEAR', hit)

        // segments intersect, indicating a spurious loop: remove the loop and
        // replace the endpoints of the intersecting segments with the intersection point.
        while (arr.length > idx + 1) arr.pop();
        appendPoint(arr, hit);
        c = hit; // update starting point of the newly added segment
      }

      // Maintain a bounding box around vertices before the backtrack limit.
      // If the latest segment intersects this bounding box, there could be a self-
      // intersection -- start a new partial to prevent self-intersection.
      //
      if (i >= backtrackSteps) {
        if (!bounds) {
          bounds = new Bounds();
          bounds.mergePoint(a[0], a[1]);
        }
        bounds.mergePoint(b[0], b[1]);
        if (testSegmentBoundsIntersection(c0, d, bounds)) {
          finishPartial();
        }
        break;
      }
    }

    appendPoint(arr, d);
  }

  function finishPartial() {
    // Get endpoints of the two polylines, for starting the next partial
    var leftEP = left[left.length - 1];
    var centerEP = center[center.length - 1];

    // Make a polygon ring
    var ring = [];
    extendArray(ring, left);
    center.reverse();
    extendArray(ring, center);
    ring.push(ring[0]); // close ring
    partials.push(ring);

    // Start next partial
    left.push(leftEP);
    center.push(centerEP);

    // clear bbox
    // bbox = null;
  }

  function extendArray(arr, arr2) {
    arr2.reverse();
    while(arr2.length > 0) arr.push(arr2.pop());
  }

  return function(path, dist) {
    // var x0, y0;
    var x1, y1, x2, y2;
    var p1, p2;
    // var firstBearing;
    var bearing, prevBearing, joinAngle;
    partials = [];
    left = [];
    center = [];
    pathIter.init(path);

    // if (pathIter.hasNext()) {
    //   x0 = x2 = pathIter.x;
    //   y0 = y2 = pathIter.y;
    // }
    while (pathIter.hasNext()) {
      // TODO: use a tolerance
      if (pathIter.x === x2 && pathIter.y === y2) continue; // skip duplicate points
      x1 = x2;
      y1 = y2;
      x2 = pathIter.x;
      y2 = pathIter.y;

      prevBearing = bearing;
      bearing = getBearing(x1, y1, x2, y2);
      // shift original polyline segment to the left by buffer distance
      p1 = geod(x1, y1, bearing - 90, dist);
      p2 = geod(x2, y2, bearing - 90, dist);

      if (center.length === 0) {
        // first loop, second point in this partial
        // if (partials.length === 0) {
        //   firstBearing = bearing;
        // }
        left.push(p1, p2);
        center.push([x1, y1], [x2, y2]);
      } else {
        //
        joinAngle = getJoinAngle(prevBearing, bearing);
        if (veryCloseToPrevPoint(left, p1[0], p1[1])) {
          // skip first point
          addBufferVertex(p2);
        } else if (joinAngle > 0) {
          addRoundJoin(x1, y1, prevBearing - 90, joinAngle, dist);
          addBufferVertex(p1);
          addBufferVertex(p2);
        } else {
          addBufferVertex(p1);
          addBufferVertex(p2);
        }
        center.push([x2, y2]);
      }
    }

    if (center.length > 1) {
      finishPartial();
    }
    // TODO: handle defective polylines

    // if (x2 == x0 && y2 == y0) {
    //   // add join to finish closed path
    //   joinAngle = getJoinAngle(bearing, firstBearing);
    //   if (joinAngle > 0) {
    //     addRoundJoin(leftpart, x2, y2, bearing - 90, joinAngle, dist);
    //   }
    // } else {
    //   // add a cap to finish open path
    //   leftpart.push.apply(leftpart, makeCap(x2, y2, bearing, dist));
    // }

    return partials;
  };
}
