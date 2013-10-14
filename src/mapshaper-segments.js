/* @requires mapshaper-shapes, mapshaper-sorting */

MapShaper.getIntersectionPoints = function(arcs) {
  // Kludge: create set of paths of length 1 to display intersection points
  var intersections = MapShaper.findSegmentIntersections(arcs),
      vectors = Utils.map(intersections, function(obj) {
        return [[obj.intersection.x], [obj.intersection.y]];
      });
  return new ArcDataset(vectors);
};

// Method: bin segments into horizontal stripes
// Segments that span stripes are assigned to all intersecting stripes
// To find all intersections:
// 1. Assign each segment to a bin
// 2. Find intersections inside each bin
// 3. Remove duplicate intersections
//
MapShaper.findSegmentIntersections = (function() {

  // Re-use buffer for temp data -- Chrome's gc starts bogging down
  // if large buffers are repeatedly created.
  var buf;
  function getUint32Array(count) {
    var bytes = count * 4;
    if (!buf || buf.length < bytes) {
      buf = new ArrayBuffer(bytes);
    }
    return new Uint32Array(buf, 0, count);
  }

  return function(arcs) {
    T.start();
    var bounds = arcs.getBounds(),
        ymin = bounds.ymin,
        yrange = bounds.ymax - ymin,
        pointCount = arcs.getFilteredPointCount() - arcs.size(),
        stripeCount = Math.ceil(Math.sqrt(pointCount) * 1.5), // TODO: refine
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
    arcs.forEachSegment(function(id1, id2, xx, yy, arcId) {
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
      MapShaper.sortIdsFast(raw.xx, stripes[i]);
      arr = MapShaper.intersectSegments(stripes[i], raw.xx, raw.yy);
      if (arr.length > 0) extendIntersections(intersections, arr, i);
    }

    T.stop("Intersections: " + intersections.length);
    return intersections;

    // Add intersections from a bin, but avoid duplicates.
    //
    function extendIntersections(intersections, arr, stripeId) {
      Utils.forEach(arr, function(obj, i) {
        var key = obj.ids.join(',');
        if (key in index) {
          // trace("Dupe:", obj);
          return;
        }
        intersections.push(obj);
        index[key] = true;
      });
    }
  };
})();

// Find intersections among a group of line segments
// Segments are pre-sorted by xmin, to allow efficient exclusion of segments with
// non-overlapping x extents.
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

  i = 0;
  while (i < lim) {
    s1p1 = ids[i++];
    s1p2 = ids[i++];
    s1p1x = xx[s1p1];
    s1p2x = xx[s1p2];
    s1p1y = yy[s1p1];
    s1p2y = yy[s1p2];

    j = i;
    while (j <= lim) {
      s2p1 = ids[j++];
      s2p1x = xx[s2p1];

      if (s1p2x <= s2p1x) break; // x extent of seg 2 is greater than seg 1: done with seg 1

      s2p1y = yy[s2p1];
      s2p2 = ids[j++];
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
          intersection: {x: hit[0], y: hit[1]},
          ids: [s1p1, s1p2, s2p1, s2p2],
          segments: [[{x: s1p1x, y: s1p1y}, {x: s1p2x, y: s1p2y}], [{x: s2p1x, y: s2p1y}, {x: s2p2x, y: s2p2y}]]
        });
      }
    }
  }
  return intersections;
};
