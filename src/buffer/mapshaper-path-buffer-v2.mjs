import { debug } from '../utils/mapshaper-logging';
import { reversePath } from '../paths/mapshaper-path-utils';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { segmentTurn } from '../geom/mapshaper-segment-geom';

// Returns a function for generating GeoJSON MultiPolygon geometries
export function getPolylineBufferMaker(arcs, geod, getBearing, opts) {
  var sliceLen = opts.slice_length || Infinity;
  var backtrackSteps = opts.backtrack >= 0 ? opts.backtrack : 100;
  var segsPerQuadrant = opts.arc_quality >= 2 ? opts.arc_quality : 12;
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  var pathIter = new ShapeIter(arcs);
  var left, center, rings;

  return function makeBufferGeoJSON(shape, distance) {
    var rings = [];
    (shape || []).forEach(function(path, i) {
      var pathRings = makeSinglePathRings(path, distance);
      rings = rings.concat(pathRings);
    });
    if (rings.length === 0) return null;
    return {
      type: 'MultiPolygon',
      coordinates: rings.map(ring => [ring]) // to Polygon format
    };
  };

  // each path may be converted into multiple buffer rings, which later
  // need to be dissolved
  function makeSinglePathRings(pathArcs, dist) {
    var revPathArcs;
    var rings = [];
    if (!opts.right || opts.left) {
      rings = rings.concat(makeLeftBufferRings(pathArcs, dist));
    }
    if (!opts.left || opts.right) {
      revPathArcs = reversePath(pathArcs.concat());
      rings = rings.concat(makeLeftBufferRings(revPathArcs, dist));
    }
    return rings;
  }

  function makeLeftBufferRings(path, dist) {
    left = [];
    center = [];
    rings = [];
    var x0, y0, x1, y1, x2, y2; // path traversal coords
    var p1, p2; // extruded points
    var prevP;
    var bearing1, bearing2, prevBearing, joinAngle;
    var firstBearing;
    var i = 0;
    pathIter.init(path);

    if (pathIter.hasNext()) {
      x0 = x2 = pathIter.x;
      y0 = y2 = pathIter.y;
      i++;
    }

    while (pathIter.hasNext()) {
      // TODO: use a tolerance
      if (pathIter.x === x2 && pathIter.y === y2) {
        debug("skipping a duplicate point");
        continue;
      }
      x1 = x2;
      y1 = y2;
      x2 = pathIter.x;
      y2 = pathIter.y;

      // calculate bearing at both segment points
      // TODO: no need to calculate twice with planar coordinates
      prevBearing = bearing2;
      bearing1 = getBearing(x1, y1, x2, y2);
      bearing2 = getBearing(x2, y2, x1, y1) - 180;
      // extrude current segment to the left
      prevP = p2;
      p1 = geod(x1, y1, bearing1 - 90, dist);
      p2 = geod(x2, y2, bearing2 - 90, dist);

      if (i == 1) {
        firstBearing = bearing1;
      } else {
        joinAngle = getJoinAngle(prevBearing, bearing1);
      }

      // extend center coords (i.e. original path)
      if (center.length == 0) {
        center.push([x1, y1]);
        if (prevP) {
          // addBufferVertex(prevP);
        }
      }
      center.push([x2, y2]);

      // if (veryCloseToPrevPoint(left, p1[0], p1[1])) {
      //   console.log("VERY CLOSE")
      //   // skip first point
      //   addBufferVertex(p2);
      // }

      if (i > 1 && joinAngle > 0) {
        if (prevP) {
          // start join from last extruded vertex of previous buffer slice
          addBufferVertex(prevP);
        }
        makeRoundJoin(x1, y1, prevBearing - 90, joinAngle, dist).forEach(addBufferVertex);
        addBufferVertex(p1);
        addBufferVertex(p2);
        // left.push(p1, p2)
      } else {
        // left.push(p1, p2)
        addBufferVertex(p1);
        addBufferVertex(p2);
      }

      // TODO: finish
      if (center.length - 1 >= sliceLen) {
        finishRing();
      }
      i++;
    }

    if (center.length > 1) {
      finishRing();
    }

    if (x2 == x0 && y2 == y0) { // closed path
      // add join to finish closed path
      // TODO - figure out which bearing to use
      joinAngle = getJoinAngle(bearing2, firstBearing);
      if (joinAngle > 0) {
        appendJoinToRing(rings[rings.length-1], x2, y2, bearing1 - 90, joinAngle, dist);
      }
    } else { // open path
      // add a cap to finish open path
      // left.push.apply(left, makeCap(x2, y2, bearing, dist));
      appendCapToRing(rings[rings.length-1], x2, y2, bearing2, dist);
    }

    return rings;
  }

  function finishRing() {
    if (center.length < 2) {
      debug('defective path, skipping');
      return;
    }
    var ring = center.reverse().concat(left);
    ring.push(ring[0]);

    // Start next partial (if there is one)
    left = [];
    center = [];
    rings.push(ring);
  }

  // function extendArray(arr, arr2) {
  //   arr2.reverse();
  //   while(arr2.length > 0) arr.push(arr2.pop());
  // }

  function appendJoinToRing(ring, x, y, direction, angle, dist) {
    var p1 = ring.pop();
    var coords = makeRoundJoin(x, y, direction, angle, dist);
    ring.push.apply(ring, coords);
    ring.push(geod(x, y, direction + angle, dist));
    ring.push(p1);
  }

  function appendCapToRing(ring, x, y, direction, dist) {
    if (capStyle == 'flat' || ring.length < 4) {
      return;
    }
    var p1 = ring.pop();
    var coords = makeRoundCap(x, y, direction - 90, dist);
    ring.push.apply(ring, coords);
    ring.push(p1);
  }

  function makeRoundCap(x, y, startDir, dist) {
    var points = makeRoundJoin(x, y, startDir, 180, dist);
    points.push(geod(x, y, startDir + 180, dist)); // add final vertex
    return points;
  }

  // get interior vertices of an interpolated CW arc
  function makeRoundJoin(cx, cy, startBearing, arcAngle, dist) {
    var points = [];
    var increment = 90 / segsPerQuadrant;
    var angle = increment;
    while (angle < arcAngle) {
      points.push(geod(cx, cy, startBearing + angle, dist));
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


  function addBufferVertex(d) {
    var arr = left;
    var a, b, c, c0, hit;
    // c is the start point of the segment formed by appending point d to the polyline.
    c0 = c = arr[arr.length - 1];
    for (var i=0, idx = arr.length - 3; i < backtrackSteps && idx >= 0; i++, idx--) {
      a = arr[idx];
      b = arr[idx + 1];
      // TODO: consider using a geodetic intersection function for lat-long datasets
      hit = bufferIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      // TODO: disregard hits caused by oxbows
      if (hit) {
        // console.log('HIT turn:', segmentTurn(a, b, c, d))
        if (false && segmentTurn(a, b, c, d) == 1) {
          // interpretation: segment cd crosses segment ab from outside to inside
          // the buffer -- we need to start a new partial; otherwise,
          // the following code would likely remove a loop representing
          // an oxbow-type hole in the buffer.
          //
          finishRing();
          break;
        }
        // TODO: handle collinear segments
        // if (hit.length != 2) console.log('COLLINEAR', hit)
        // segments intersect -- replace two internal segment endpoints with xx point
        while (arr.length > idx + 1) arr.pop();
        appendPoint(arr, hit);
        c = hit; // update starting point of the newly added segment
      }
    }
    appendPoint(arr, d);
  }

  function addBufferVertex_v1(d) {
    var arr = left;
    appendPoint(arr, d);
  }

}

function veryCloseToPrevPoint(arr, x, y) {
  var prev = arr[arr.length - 1];
  return veryClose(prev[0], prev[1], x, y, 0.000001);
}

// Test if two points are within a snapping tolerance
// TODO: calculate the tolerance more sensibly
function veryClose(x1, y1, x2, y2, tol) {
  var dist = geom.distance2D(x1, y1, x2, y2);
  return dist < tol;
}

function appendPoint(arr, p) {
  var prev = arr[arr.length - 1];
  if (!prev || !veryClose(prev[0], prev[1], p[0], p[1], 1e-10)) {
    arr.push(p);
  } else {
    //var dist = geom.distance2D(prev[0], prev[1], p[0], p[1]);
    //console.log(dist)
  }
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
