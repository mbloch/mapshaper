import { debug } from '../utils/mapshaper-logging';
import { reversePath } from '../paths/mapshaper-path-utils';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { segmentTurn } from '../geom/mapshaper-segment-geom';
import { BufferBuilder } from './mapshaper-buffer-builder';

// Returns a function for generating GeoJSON MultiPolygon geometries
export function getPolylineBufferMaker(arcs, geod, getBearing, opts) {
  // var sliceLen = opts.slice_length || Infinity;
  var segsPerQuadrant = opts.arc_quality >= 2 ? opts.arc_quality : 12;
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  var pathIter = new ShapeIter(arcs);
  var builder = new BufferBuilder(opts);

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
        builder.addPathVertex([x1, y1]);
      } else {
        joinAngle = getJoinAngle(prevBearing, bearing1);
      }

      builder.addPathVertex([x2, y2]);

      if (i > 1 && joinAngle > 0) {
        if (prevP) {
          // start join from last extruded vertex of previous buffer slice
          // builder.addBufferVertex(prevP);
        }
        builder.addBufferVertices(makeRoundJoin(x1, y1, prevBearing - 90, joinAngle, dist));
      }

      builder.addBufferVertex(p1, joinAngle < 0);
      builder.addBufferVertex(p2);

      // TODO: restore slicing?
      // if (center.length - 1 >= sliceLen) {
      //   builder.done(rings);
      // }

      i++;
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
