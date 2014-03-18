/* @requires mapshaper-shapes */

// Convert an array of intersections into an ArcDataset (for display)
//
MapShaper.getIntersectionPoints = function(intersections) {
  // Kludge: create set of paths of length 1 to display intersection points
  var vectors = Utils.map(intersections, function(obj) {
        var x = obj.intersection.x,
            y = obj.intersection.y;
        return [[x], [y]];
      });
  return new ArcDataset(vectors);
};

// Identify intersecting segments in an ArcDataset
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
    //T.start();
    var bounds = arcs.getBounds(),
        ymin = bounds.ymin,
        yrange = bounds.ymax - ymin,
        stripeCount = calcStripeCount(arcs),
        stripeCounts = new Uint32Array(stripeCount),
        i;

    function stripeId(y) {
      return Math.floor((stripeCount-1) * (y - ymin) / yrange);
    }

    // Count segments in each stripe
    arcs.forEachSegment(function(id1, id2, xx, yy) {
      var s1 = stripeId(yy[id1]),
          s2 = stripeId(yy[id2]);
      while (true) {
        stripeCounts[s1] = stripeCounts[s1] + 2;
        if (s1 == s2) break;
        s1 += s2 > s1 ? 1 : -1;
      }
    });

    // Allocate arrays for segments in each stripe
    var stripeData = getUint32Array(Utils.sum(stripeCounts)),
        offs = 0;
    var stripes = Utils.map(stripeCounts, function(stripeSize) {
      var start = offs;
      offs += stripeSize;
      return stripeData.subarray(start, offs);
    });

    // Assign segment ids to each stripe
    Utils.initializeArray(stripeCounts, 0);
    arcs.forEachSegment(function(id1, id2, xx, yy) {
      var s1 = stripeId(yy[id1]),
          s2 = stripeId(yy[id2]),
          count, stripe, tmp;
      if (xx[id2] < xx[id1]) {
        tmp = id1;
        id1 = id2;
        id2 = tmp;
      }
      while (true) {
        count = stripeCounts[s1];
        stripeCounts[s1] = count + 2;
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
      arr = MapShaper.intersectSegments(stripes[i], raw.xx, raw.yy);
      if (arr.length > 0) extendIntersections(intersections, arr, i);
    }

    // T.stop("Intersections: " + intersections.length + " stripes: " + stripeCount);
    return intersections;

    // Add intersections from a bin, but avoid duplicates.
    //
    function extendIntersections(intersections, arr, stripeId) {
      Utils.forEach(arr, function(obj, i) {
        if (obj.key in index === false) {
          intersections.push(obj);
          index[obj.key] = true;
        }
      });
    }

  };

  function calcStripeCount(arcs) {
    var bounds = arcs.getBounds(),
        yrange = bounds.ymax - bounds.ymin,
        avg = arcs.getAverageSegment(3), // don't bother sampling all segments
        avgY = avg[1],
        count = Math.ceil(yrange / avgY / 20) || 1;  // count is positive int
    if (count > 0 === false) throw "Invalid stripe count";
    return count;
  }

})();

// Get an indexable key that is consistent regardless of point sequence
// @a, @b ids of segment 1, @c, @d ids of segment 2
MapShaper.getIntersectionKey = function(a, b, c, d) {
  var ab = a < b ? a + ',' + b : b + ',' + a,
      cd = c < d ? c + ',' + d : d + ',' + c,
      key = a < c ? ab + ',' + cd : cd + ',' + ab;
  return key;
};

// Find intersections among a group of line segments
//
// @ids: Array of indexes: [s0p0, s0p1, s1p0, s1p1, ...] where xx[sip0] <= xx[sip1]
// @xx, @yy: Arrays of x- and y-coordinates
//
MapShaper.intersectSegments = function(ids, xx, yy) {
  var lim = ids.length - 2,
      intersections = [];
  var s1p1, s1p2, s2p1, s2p2,
      s1p1x, s1p2x, s2p1x, s2p2x,
      s1p1y, s1p2y, s2p1y, s2p2y,
      hit, i, j;

  // Sort segments by xmin, to allow efficient exclusion of segments with
  // non-overlapping x extents.
  MapShaper.sortSegmentIds(xx, ids);

  i = 0;
  while (i < lim) {
    s1p1 = ids[i];
    s1p2 = ids[i+1];
    s1p1x = xx[s1p1];
    s1p2x = xx[s1p2];
    s1p1y = yy[s1p1];
    s1p2y = yy[s1p2];

    j = i;
    while (j < lim) {
      j += 2;
      s2p1 = ids[j];
      s2p1x = xx[s2p1];

      if (s1p2x <= s2p1x) break; // x extent of seg 2 is greater than seg 1: done with seg 1

      s2p1y = yy[s2p1];
      s2p2 = ids[j+1];
      s2p2x = xx[s2p2];
      s2p2y = yy[s2p2];

      // skip segments with non-overlapping y ranges
      if (s1p1y >= s2p1y) {
        if (s1p1y >= s2p2y && s1p2y >= s2p1y && s1p2y >= s2p2y) continue;
      } else {
        if (s1p1y <= s2p2y && s1p2y <= s2p1y && s1p2y <= s2p2y) continue;
      }

      // skip segments that share an endpoint
      if (s1p1x == s2p1x && s1p1y == s2p1y || s1p1x == s2p2x && s1p1y == s2p2y ||
          s1p2x == s2p1x && s1p2y == s2p1y || s1p2x == s2p2x && s1p2y == s2p2y)
        continue;

      // test two candidate segments for intersection
      hit = segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y,
          s2p1x, s2p1y, s2p2x, s2p2y);

      if (hit) {
        intersections.push({
          i: i,
          j: j,
          intersection: {x: hit[0], y: hit[1]},
          ids: [s1p1, s1p2, s2p1, s2p2],
          key: MapShaper.getIntersectionKey(s1p1, s1p2, s2p1, s2p2),
          segments: [[{x: s1p1x, y: s1p1y}, {x: s1p2x, y: s1p2y}],
              [{x: s2p1x, y: s2p1y}, {x: s2p2x, y: s2p2y}]]
        });
      }
    }
    i += 2;
  }
  return intersections;
};

MapShaper.sortSegmentIds = function(arr, ids) {
  MapShaper.quicksortSegmentIds(arr, ids, 0, ids.length-2);
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
