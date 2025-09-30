import { debug } from '../utils/mapshaper-logging';
import { reversePath } from '../paths/mapshaper-path-utils';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { segmentTurn } from '../geom/mapshaper-segment-geom';
import { BufferBuilder } from './mapshaper-buffer-builder';
import { getIntersectionFunction } from './mapshaper-buffer-common';
import { getBearingFunction,
  getFastGeodeticSegmentFunction,
  getGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { getDatasetCRS } from '../crs/mapshaper-projections';

// Returns a function for generating GeoJSON MultiPolygon geometries
export function getPolylineBufferMaker(dataset, opts) {
  // var sliceLen = opts.slice_length || Infinity;
  var crs = getDatasetCRS(dataset);
  var geod = getFastGeodeticSegmentFunction(crs);
  var bufferIntersection = getIntersectionFunction(crs);
  var getBearing = getBearingFunction(dataset);
  var segsPerQuadrant = opts.arc_quality >= 2 ? opts.arc_quality : 12;
  var segAngle = 360 / segsPerQuadrant / 4;
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  var pathIter = new ShapeIter(dataset.arcs);
  var builder = new BufferBuilder(bufferIntersection, opts);

  return function makeBufferGeoJSON(shape, distance) {
    var rings = [];
    (shape || []).forEach(function(path, i) {
      var pathRings = makeSinglePathRings(path, distance);
      rings = rings.concat(pathRings);
    });
    if (rings.length === 0) return null;
    var feat = {
      type: 'Feature',
      properties: null,
      geometry: {
      type: 'MultiPolygon',
        coordinates: rings.map(ring => [ring]) // to Polygon format
      }
    };
    if (opts.debug_points) {
      return [feat].concat(builder.getDebugPoints());
    }
    return feat;
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
    var left = [];
    var center = [];
    var rings = [];
    var x0, y0, x1, y1, x2, y2; // path traversal coords
    var p1, p2; // extruded points
    var p1Prev, p2Prev;
    var bearing1, bearing2, bearing2Prev, joinAngle, hit;
    var firstBearing;
    var joinPoints;
    var i = 0;
    pathIter.init(path);

    if (pathIter.hasNext()) {
      x0 = x2 = pathIter.x;
      y0 = y2 = pathIter.y;
      builder.addPathVertex([x0, y0]); // start building the path side
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
      builder.addPathVertex([x2, y2]); // extend path

      // bearing (direction) of the segment is slightly different at the first
      // and second endpoint, using geodesic math
      // TODO: no need to calculate twice with planar coordinates
      bearing1 = getBearing(x1, y1, x2, y2);
      bearing2 = getBearing(x2, y2, x1, y1) - 180;
      // extrude current segment to the left
      p1 = geod(x1, y1, bearing1 - 90, dist);
      p2 = geod(x2, y2, bearing2 - 90, dist);

      if (i == 1) {
        firstBearing = bearing1;
      } else {
        joinAngle = getJoinAngle(bearing2Prev, bearing1);
      }

      // various connections between current extruded segment and prev segment
      if (i == 1) {
        // first segment - no join
        builder.addBufferVertex(p1, false);
      } else if (joinAngle > segAngle * 1.5) {
        // round join
        // builder.addBufferVertex(p2Prev, false) // testing
        joinPoints = makeOutsideRoundJoin(x1, y1, bearing2Prev - 90, joinAngle, dist);
        builder.addBufferVertices(joinPoints);
        // builder.addBufferVertex(p1, false) // testing
        p1 = joinPoints.pop();
      } else if (joinAngle > 0 && (hit = elbowJoin(p1Prev, p2Prev, p1, p2)) ||
        joinAngle < 0 && (hit = bufferIntersection(p1Prev, p2Prev, p1, p2))) {
        // elbow join (concave or convex)
        builder.addBufferVertex(hit, false);
        p1 = hit;
      } else if (joinAngle == 0) {
        // collinear segments (can we really skip p2Prev on a sphere?)
        builder.addBufferVertex(p1, false);
      } else {
        // if (joinAngle > 0) {
        // probably a leftward bend and extruded segments do not intersect
        //   // console.log("UNEXPECTED SEGMENT JOIN")
        // }
        builder.addBufferVertex(p2Prev);
        builder.addBufferVertex(p1, joinAngle < 0);
      }

      bearing2Prev = bearing2;
      p1Prev = p1;
      p2Prev = p2;
      i++;
    }

    // TODO: add this to cap and join code below
    if (p2Prev) {
      builder.addBufferVertex(p2Prev);
    }

    if (x2 == x0 && y2 == y0) { // closed path
      // add join to finish closed path
      // TODO - figure out which bearing to use
      joinAngle = getJoinAngle(bearing2, firstBearing);
      if (joinAngle > 0) {
        builder.addBufferVertices(makeFinalJoin(x2, y2, bearing1 - 90, joinAngle, dist));
      }
    } else if (capStyle == 'round') { // open path
      // add a cap to finish open path
      builder.addBufferVertices(makeRoundCap(x2, y2, bearing2 - 90, dist));
    }

    rings.push(builder.done());
    return rings;
  }

  // function extendArray(arr, arr2) {
  //   arr2.reverse();
  //   while(arr2.length > 0) arr.push(arr2.pop());
  // }

  function makeFinalJoin(x, y, direction, angle, dist) {
    var points = makeRoundJoin(x, y, direction, angle, dist);
    points.push(geod(x, y, direction + angle, dist));
    return points;
  }

  function makeRoundCap(x, y, startDir, dist) {
    var points = makeRoundJoin(x, y, startDir, 180, dist);
    points.push(geod(x, y, startDir + 180, dist)); // add final vertex
    return points;
  }

  // The vertices of this join are outside of the arc that it approximates and
  // the segments of the join touch the arc at their midpoints.
  // The first and last of the returned vertices extend the segments on either
  // side of the join.
  function makeOutsideRoundJoin(cx, cy, startBearing, arcAngle, dist) {
    // point count of 1 would be an elbow joint
    // (elbow joins should be created elsewhere)
    var pointCount = Math.max(1, Math.round(arcAngle / segAngle));
    var stepAngle = arcAngle / pointCount;
    var points = [];
    var i = 0;
    var a, b, c, d, joinP, tanP, bearing;
    while (i <= pointCount) {
      bearing = startBearing + stepAngle * i;
      tanP = geod(cx, cy, bearing, dist);
      c = geod(tanP[0], tanP[1], bearing - 90, dist * 2);
      d = geod(tanP[0], tanP[1], bearing + 90, dist * 2);
      if (i > 0) {
        joinP = bufferIntersection(a, b, c, d);
        if (!joinP) {
          throw Error(`no intersection on ${i} of ${pointCount}`);
        } else {
          points.push(joinP);
        }
      }
      a = c;
      b = d;
      i++;
    }
    return points;
  }

  function elbowJoin(a, b, c, d) {
    var k = 2 ** 13;
    var b2 = [extend(b[0], b[0] - a[0], k), extend(b[1], b[1] - a[1], k)];
    var c2 = [extend(c[0], c[0] - d[0], k), extend(c[1], c[1] - d[1], k)];
    return bufferIntersection(a, b2, c2, d);
  }


  // function getBbox() {
  //   var lastIdx = buffer.length - 1;
  //   var x, y;
  //   if (!_bbox) {
  //     _bbox = [-Infinity, -Infinity, Infinity, Infinity];
  //   }
  //   while (_idx < lastIdx) {
  //     _idx++;
  //     x = buffer[_idx][0];
  //     y = buffer[_idx][1];
  //     _bbox[0] = Math.min(x, _bbox[0]);
  //     _bbox[1] = Math.min(y, _bbox[1]);
  //     _bbox[2] = Math.max(x, _bbox[2]);
  //     _bbox[3] = Math.max(y, _bbox[3]);
  //   }
  //   return _bbox;
  // }

  function extend(n, d, k) {
    return n + d * k;
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

}
