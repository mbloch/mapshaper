import { sortSegmentIds } from '../paths/mapshaper-segment-sorting';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { getAvgSegment2, forEachArcId } from '../paths/mapshaper-path-utils';
import { getWorldBounds } from '../geom/mapshaper-latlon';
import { getHighPrecisionSnapInterval } from '../paths/mapshaper-snapping';
import { SimpleIdTestIndex } from '../indexing/mapshaper-id-test-index';
import { absArcId, findArcIdFromVertexId } from '../paths/mapshaper-arc-utils';

export function getIntersectionPoints(intersections) {
  return intersections.map(function(obj) {
        return [obj.x, obj.y];
      });
}

export function getIntersectionLayer(intersections, lyr, arcs) {
  // return {geometry_type: 'point', shapes: [getIntersectionPoints(XX)]};
  var ii = arcs.getVertexData().ii;
  var index = new SimpleIdTestIndex(arcs.size());
  forEachArcId(lyr.shapes, arcId => {
    index.setId(absArcId(arcId));
  });
  var points = [];
  intersections.forEach(obj => {
    var arc1 = findArcIdFromVertexId(obj.a[0], ii);
    var arc2 = findArcIdFromVertexId(obj.b[0], ii);
    if (index.hasId(arc1) && index.hasId(arc2)) {
      points.push([obj.x, obj.y]);
    }
  });
  return {geometry_type: 'point', shapes: [points]};
}

// Identify intersecting segments in an ArcCollection
//
// To find all intersections:
// 1. Assign each segment to one or more horizontal stripes/bins
// 2. Find intersections inside each stripe
// 3. Concat and dedup
//
// Re-use buffer for temp data -- Chrome's gc starts bogging down
// if large buffers are repeatedly created.
var buf;
function getUint32Array(count) {
  var bytes = count * 4;
  if (!buf || buf.byteLength < bytes) {
    buf = new ArrayBuffer(bytes);
  }
  return new Uint32Array(buf, 0, count);
}

export function findSegmentIntersections(arcs, optArg) {
  var opts = utils.extend({}, optArg),
      bounds = arcs.getBounds(),
      // TODO: handle spherical bounds
      spherical = !arcs.isPlanar() &&
          geom.containsBounds(getWorldBounds(), bounds.toArray()),
      ymin = bounds.ymin,
      yrange = bounds.ymax - ymin,
      stripeCount = opts.stripes || calcSegmentIntersectionStripeCount(arcs),
      stripeSizes = new Uint32Array(stripeCount),
      stripeId = stripeCount > 1 && yrange > 0 ? multiStripeId : singleStripeId,
      i, j;

  if (opts.tolerance >= 0 === false) {
    // by default, use a small tolerance when detecting segment intersections
    // (intended to overcome the effects of floating point rounding errors in geometrical formulas)
    opts.tolerance = getHighPrecisionSnapInterval(bounds.toArray());
  }

  function multiStripeId(y) {
    return Math.floor((stripeCount-1) * (y - ymin) / yrange);
  }

  function singleStripeId(y) {return 0;}
  // Count segments in each stripe
  arcs.forEachSegment(function(id1, id2, xx, yy) {
    var s1 = stripeId(yy[id1]),
        s2 = stripeId(yy[id2]);
    while (true) {
      stripeSizes[s1] = stripeSizes[s1] + 2;
      if (s1 == s2) break;
      s1 += s2 > s1 ? 1 : -1;
    }
  });

  // Allocate arrays for segments in each stripe
  var stripeData = getUint32Array(utils.sum(stripeSizes)),
      offs = 0;
  var stripes = [];
  utils.forEach(stripeSizes, function(stripeSize) {
    var start = offs;
    offs += stripeSize;
    stripes.push(stripeData.subarray(start, offs));
  });
  // Assign segment ids to each stripe
  utils.initializeArray(stripeSizes, 0);

  arcs.forEachSegment(function(id1, id2, xx, yy) {
    var s1 = stripeId(yy[id1]),
        s2 = stripeId(yy[id2]),
        count, stripe;
    while (true) {
      count = stripeSizes[s1];
      stripeSizes[s1] = count + 2;
      stripe = stripes[s1];
      stripe[count] = id1;
      stripe[count+1] = id2;
      if (s1 == s2) break;
      s1 += s2 > s1 ? 1 : -1;
    }
  });

  // Detect intersections among segments in each stripe.
  var raw = arcs.getVertexData(),
      intersections = [],
      arr;
  for (i=0; i<stripeCount; i++) {
    arr = intersectSegments(stripes[i], raw.xx, raw.yy, opts);
    for (j=0; j<arr.length; j++) {
      intersections.push(arr[j]);
    }
  }
  return dedupIntersections(intersections, opts.unique ? getUniqueIntersectionKey : null);
}


export function sortIntersections(arr) {
  arr.sort(function(a, b) {
    return a.x - b.x || a.y - b.y;
  });
}



export function dedupIntersections(arr, keyFunction) {
  var index = {};
  var getKey = keyFunction || getIntersectionKey;
  return arr.filter(function(o) {
    var key = getKey(o);
    if (key in index) {
      return false;
    }
    index[key] = true;
    return true;
  });
}

// Get an indexable key from an intersection object
// Assumes that vertex ids of o.a and o.b are sorted
function getIntersectionKey(o) {
  return o.a.join(',') + ';' + o.b.join(',');
}

function getUniqueIntersectionKey(o) {
  return o.x + ',' + o.y;
}

// Fast method
// TODO: measure performance using a range of input data
export function calcSegmentIntersectionStripeCount2(arcs) {
  var segs = arcs.getFilteredPointCount() - arcs.size();
  var stripes = Math.pow(segs, 0.4) * 2;
  return Math.ceil(stripes) || 1;
}

// Alternate fast method
export function calcSegmentIntersectionStripeCount(arcs) {
  var segs = arcs.getFilteredPointCount() - arcs.size();
  var stripes = Math.ceil(Math.pow(segs * 10, 0.6) / 40);
  return stripes > 0 ? stripes : 1;
}

// Old method calculates average segment length -- slow
function calcSegmentIntersectionStripeCount_old(arcs) {
  var yrange = arcs.getBounds().height(),
      segLen = getAvgSegment2(arcs)[1], // slow
      count = 1;
  if (segLen > 0 && yrange > 0) {
    count = Math.ceil(yrange / segLen / 20);
  }
  return count || 1;
}

// Find intersections among a group of line segments
//
// TODO: handle case where a segment starts and ends at the same point (i.e. duplicate coords);
//
// @ids: Array of indexes: [s0p0, s0p1, s1p0, s1p1, ...] where xx[sip0] <= xx[sip1]
// @xx, @yy: Arrays of x- and y-coordinates
//
export function intersectSegments(ids, xx, yy, optsArg) {
  var lim = ids.length - 2,
      opts = optsArg || {},
      intersections = [],
      tolerance = opts.tolerance, // may be undefined
      s1p1, s1p2, s2p1, s2p2,
      s1p1x, s1p2x, s2p1x, s2p2x,
      s1p1y, s1p2y, s2p1y, s2p2y,
      hit, seg1, seg2, i, j;

  // Sort segments by xmin, to allow efficient exclusion of segments with
  // non-overlapping x extents.
  sortSegmentIds(xx, ids); // sort by ascending xmin

  i = 0;
  while (i < lim) {
    s1p1 = ids[i];
    s1p2 = ids[i+1];
    s1p1x = xx[s1p1];
    s1p2x = xx[s1p2];
    s1p1y = yy[s1p1];
    s1p2y = yy[s1p2];
    // count++;

    j = i;
    while (j < lim) {
      j += 2;
      s2p1 = ids[j];
      s2p1x = xx[s2p1];

      if (s1p2x < s2p1x) break; // x extent of seg 2 is greater than seg 1: done with seg 1
      //if (s1p2x <= s2p1x) break; // this misses point-segment intersections when s1 or s2 is vertical

      s2p1y = yy[s2p1];
      s2p2 = ids[j+1];
      s2p2x = xx[s2p2];
      s2p2y = yy[s2p2];

      // skip segments with non-overlapping y ranges
      if (s1p1y >= s2p1y) {
        if (s1p1y > s2p2y && s1p2y > s2p1y && s1p2y > s2p2y) continue;
      } else {
        if (s1p1y < s2p2y && s1p2y < s2p1y && s1p2y < s2p2y) continue;
      }

      // skip segments that are adjacent in a path (optimization)
      // TODO: consider if this eliminates some cases that should
      // be detected, e.g. spikes formed by unequal segments
      if (s1p1 == s2p1 || s1p1 == s2p2 || s1p2 == s2p1 || s1p2 == s2p2) {
        continue;
      }

      // test two candidate segments for intersection
      hit = geom.segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y,
          s2p1x, s2p1y, s2p2x, s2p2y, tolerance);
      if (hit) {
        seg1 = [s1p1, s1p2];
        seg2 = [s2p1, s2p2];
        intersections.push(formatIntersection(hit, seg1, seg2, xx, yy));
        if (hit.length == 4) {
          // two collinear segments may have two endpoint intersections
          intersections.push(formatIntersection(hit.slice(2), seg1, seg2, xx, yy));
        }
      }
    }
    i += 2;
  }
  return intersections;

  // @p is an [x, y] location along a segment defined by ids @id1 and @id2
  // return array [i, j] where i and j are the same endpoint ids with i <= j
  // if @p coincides with an endpoint, return the id of that endpoint twice
  function getEndpointIds(id1, id2, p) {
    var i = id1 < id2 ? id1 : id2,
        j = i === id1 ? id2 : id1;
    if (xx[i] == p[0] && yy[i] == p[1]) {
      j = i;
    } else if (xx[j] == p[0] && yy[j] == p[1]) {
      i = j;
    }
    return [i, j];
  }
}

export function formatIntersection(xy, s1, s2, xx, yy) {
  var x = xy[0],
      y = xy[1],
      a, b;
  s1 = formatIntersectingSegment(x, y, s1[0], s1[1], xx, yy);
  s2 = formatIntersectingSegment(x, y, s2[0], s2[1], xx, yy);
  a = s1[0] < s2[0] ? s1 : s2;
  b = a == s1 ? s2 : s1;
  return {x: x, y: y, a: a, b: b};
}

// Receives:
//   x, y: coordinates of intersection
//   i, j: two segment endpoints, as indexes in xx and yy arrays
// Returns:
//   if x,y falls within the segment, returns ascending indexes
//   if x,y coincides with an endpoint, returns the id of that endpoint twice
export function formatIntersectingSegment(x, y, i, j, xx, yy) {
  if (xx[i] == x && yy[i] == y) {
    return [i, i];
  }
  if (xx[j] == x && yy[j] == y) {
    return [j, j];
  }
  return i < j ? [i, j] : [j, i];
}
