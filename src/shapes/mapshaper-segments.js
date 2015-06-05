/* @requires mapshaper-shapes */

// Convert an array of intersections into an ArcCollection (for display)
//
MapShaper.getIntersectionPoints = function(intersections) {
  return intersections.map(function(obj) {
        return [obj.x, obj.y];
      });
};

var count = 0;

// Identify intersecting segments in an ArcCollection
//
// Method: bin segments into horizontal stripes
// Segments that span stripes are assigned to all intersecting stripes
// To find all intersections:
// 1. Assign each segment to one or more bins
// 2. Find intersections inside each bin (ignoring duplicate intersections)
//
MapShaper.findSegmentIntersections = (function() {

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

  return function(arcs) {
    var bounds = arcs.getBounds(),
        // TODO: handle spherical bounds
        spherical = !arcs.isPlanar() &&
            containsBounds(MapShaper.getWorldBounds(), bounds.toArray()),
        ymin = bounds.ymin,
        yrange = bounds.ymax - ymin,
        stripeCount = MapShaper.calcSegmentIntersectionStripeCount(arcs),
        stripeSizes = new Uint32Array(stripeCount),
        i;

    function stripeId(y) {
      return Math.floor((stripeCount-1) * (y - ymin) / yrange);
    }

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
        index = {},
        arr;
    for (i=0; i<stripeCount; i++) {
      arr = MapShaper.intersectSegments(stripes[i], raw.xx, raw.yy, spherical);
      if (arr.length > 0) {
        extendIntersections(intersections, arr, i);
      }
    }
    console.log('xx', count);
    return intersections;

    // Add intersections from a bin, but avoid duplicates.
    function extendIntersections(intersections, arr, stripeId) {
      arr.forEach(function(obj, i) {
        var key = MapShaper.getIntersectionKey(obj.a, obj.b);
        if (key in index === false) {
          intersections.push(obj);
          index[key] = true;
        }
      });
    }
  };
})();

MapShaper.calcSegmentIntersectionStripeCount = function(arcs) {
  var yrange = arcs.getBounds().height(),
      segLen = arcs.getAvgSegment2()[1],
      count = 1;
  if (segLen > 0 && yrange > 0) {
    count = Math.ceil(yrange / segLen / 20);
  }
  return count || 1;
};

// Get an indexable key that is consistent regardless of point sequence
// @a, @b endpoint ids in format [i, j]
MapShaper.getIntersectionKey = function(a, b) {
  return a.concat(b).sort().join(',');
};

// Find intersections among a group of line segments
// TODO: handle case where a segment starts and ends at the same point (i.e. duplicate coords);
//
// @ids: Array of indexes: [s0p0, s0p1, s1p0, s1p1, ...] where xx[sip0] <= xx[sip1]
// @xx, @yy: Arrays of x- and y-coordinates
//
MapShaper.intersectSegments = function(ids, xx, yy, spherical) {
  var lim = ids.length - 2,
      intersections = [];
  var s1p1, s1p2, s2p1, s2p2,
      s1p1x, s1p2x, s2p1x, s2p2x,
      s1p1y, s1p2y, s2p1y, s2p2y,
      m1, m2,
      hit, i, j;


  // Sort segments by xmin, to allow efficient exclusion of segments with
  // non-overlapping x extents.
  MapShaper.sortSegmentIds(xx, ids); // sort by ascending xmin

  i = 0;
  while (i < lim) {
    s1p1 = ids[i];
    s1p2 = ids[i+1];
    s1p1x = xx[s1p1];
    s1p2x = xx[s1p2];
    s1p1y = yy[s1p1];
    s1p2y = yy[s1p2];
    count++;

    j = i;
    while (j < lim) {
      j += 2;
      s2p1 = ids[j];
      s2p1x = xx[s2p1];
      count++;

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

      // skip segments that share an endpoint
      if (s1p1x == s2p1x && s1p1y == s2p1y || s1p1x == s2p2x && s1p1y == s2p2y ||
          s1p2x == s2p1x && s1p2y == s2p1y || s1p2x == s2p2x && s1p2y == s2p2y) {
        // TODO: don't reject segments that share exactly one endpoint and fold back on themselves
        continue;
      }

      // test two candidate segments for intersection
      hit = segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y,
          s2p1x, s2p1y, s2p2x, s2p2y);

      if (hit) {
        intersections.push({
          x: hit[0],
          y: hit[1],
          a: getEndpointIds(s1p1, s1p2, hit),
          b: getEndpointIds(s2p1, s2p2, hit)
        });
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
};

MapShaper.orderSegmentIds = function(xx, ids, spherical) {
  function swap(i, j) {
    var tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  for (var i=0, n=ids.length; i<n; i+=2) {
    if (xx[ids[i]] > xx[ids[i+1]]) {
      swap(i, i+1);
    }
  }
};

MapShaper.sortSegmentIds = function(xx, ids) {
  MapShaper.orderSegmentIds(xx, ids);
  MapShaper.quicksortSegmentIds(xx, ids, 0, ids.length-2);
};

MapShaper.insertionSortSegmentIds = function(arr, ids, start, end) {
  var id, id2;
  for (var j = start + 2; j <= end; j+=2) {
    id = ids[j];
    id2 = ids[j+1];
    for (var i = j - 2; i >= start && arr[id] < arr[ids[i]]; i-=2) {
      ids[i+2] = ids[i];
      ids[i+3] = ids[i+1];
    }
    ids[i+2] = id;
    ids[i+3] = id2;
  }
};

MapShaper.quicksortSegmentIds = function (a, ids, lo, hi) {
  var i = lo,
      j = hi,
      pivot, tmp;
  while (i < hi) {
    pivot = a[ids[(lo + hi >> 2) << 1]]; // avoid n^2 performance on sorted arrays
    while (i <= j) {
      while (a[ids[i]] < pivot) i+=2;
      while (a[ids[j]] > pivot) j-=2;
      if (i <= j) {
        tmp = ids[i];
        ids[i] = ids[j];
        ids[j] = tmp;
        tmp = ids[i+1];
        ids[i+1] = ids[j+1];
        ids[j+1] = tmp;
        i+=2;
        j-=2;
      }
    }

    if (j - lo < 40) MapShaper.insertionSortSegmentIds(a, ids, lo, j);
    else MapShaper.quicksortSegmentIds(a, ids, lo, j);
    if (hi - i < 40) {
      MapShaper.insertionSortSegmentIds(a, ids, i, hi);
      return;
    }
    lo = i;
    j = hi;
  }
};
