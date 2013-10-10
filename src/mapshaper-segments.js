/* @requires mapshaper-shapes, mapshaper-sorting */

MapShaper.getIntersectionPaths = function(arcs) {
  var intersections = MapShaper.findSegmentIntersections(arcs),
      vectors = [];
  Utils.forEach(intersections, function(obj) {
    var s1p1 = obj.segments[0][0],
        s1p2 = obj.segments[0][1],
        s2p1 = obj.segments[1][0],
        s2p2 = obj.segments[1][1],
        pint = obj.intersection;
    vectors.push([[s1p1.x, s1p2.x], [s1p1.y, s1p2.y]]);
    vectors.push([[s2p1.x, pint.x, s2p2.x], [s2p1.y, pint.y, s2p2.y]]);
  });
  return new ArcDataset(vectors);
};

MapShaper.findSegmentIntersections = function(arcs) {
  T.start();
  var i, j;
  var segCount = arcs.getFilteredPointCount() - arcs.size();
  var xminIds = new Uint32Array(segCount),
      xmaxIds = new Uint32Array(segCount),
      xxmin = new Float64Array(segCount);

  // Initialize collection of segments
  j = 0;
  arcs.forEach(function(path) {
    path.hasNext();
    var bi = path.i,
        bx = path.x,
        ai, ax;
    while (path.hasNext()) {
      ai = bi;
      ax = bx;
      bi = path.i;
      bx = path.x;
      if (ax < bx) {
        xminIds[j] = ai;
        xmaxIds[j] = bi;
        xxmin[j] = ax;
      } else {
        xminIds[j] = bi;
        xmaxIds[j] = ai;
        xxmin[j] = bx;
      }
      j++;
    }
  });

  if (j != segCount) {
    error("Segment counting problem.");
  }

  // Get array of segment ids, sorted by xmin coordinate
  var segIds = MapShaper.bucketSortIds(xxmin),
      segId;
  xxmin = null; // done with this

  // Optimization: horizontal binning
  // Bin segments into horizontal stripes + a bin for segs that span stripes
  // Two phases can identify all intersections:
  // 1. Find intersections inside each bin
  // 2. Find intersections between all segments and segments in spanning bin

  // TODO: Consider alternative:
  // Segments that span stripes are assigned to each intersecting stripe
  // (+) no residual group, fewer total comparisons
  // (-) intersections between two spanning segments will be detected multiple times

  // Init horizontal stripes
  //
  var stripeCount = 1000, // TODO: adapt to data; 1000 good for large datasets.
      stripeSizes = new Uint32Array(stripeCount + 1),
      stripeOffsets = new Uint32Array(stripeCount + 1), offset,
      stripeIds = new Uint16Array(segCount), stripeId;

  var raw = arcs.getVertexData(),
      xx = raw.xx,
      yy = raw.yy,
      bounds = arcs.getBounds(),
      ymin = bounds.ymin,
      ymax = bounds.ymax,
      yrange = ymax - ymin;

  var s1, s2, y1, y2;
  for (i=0; i<segCount; i++) {
    segId = segIds[i];
    y1 = yy[xminIds[segId]];
    y2 = yy[xmaxIds[segId]];
    s1 = Math.floor((stripeCount-1) * (y1 - ymin) / yrange);
    s2 = Math.floor((stripeCount-1) * (y2 - ymin) / yrange);
    stripeId = s1 == s2 ? s1 : stripeCount;
    stripeSizes[stripeId]++;
    stripeIds[i] = stripeId;
  }

  var stripes = Utils.map(stripeSizes, function(stripeSize) {
    return new Uint32Array(stripeSize);
  });

  // Assign sorted seg ids to each stripe
  for (i=0; i<segCount; i++) {
    stripeId = stripeIds[i];
    offset = stripeOffsets[stripeId]++;
    stripes[stripeId][offset] = segIds[i];
  }

  // Check for intersections within each stripe.
  //T.start();
  var intersections = [],
      arr;
  for (i = 0; i<stripeCount; i++) {
    arr = MapShaper.intersectSegments(stripes[i], stripes[i], xminIds, xmaxIds, xx, yy);
    if (arr.length > 0) intersections = intersections.concat(arr);
  }
  //T.stop('In-stripe intersections')

  // Check for intersections between all segments and segments that overlap two or more stripes.
  //T.start();
  arr = MapShaper.intersectSegments(segIds, stripes[stripeCount], xminIds, xmaxIds, xx, yy);
  if (arr.length > 0) intersections = intersections.concat(arr);

  //T.stop('Remaining intersections')
  T.stop("Find intersections -- " + segCount + " segments, " + intersections.length + " intersections");
  return intersections;
};

// Find intersections between segments
// Segments are pre-sorted by xmin, to allow efficient exclusion of segments with
// non-overlapping x extents.
//
// @ids1, @ids2: arrays of segment ids, sorted by xmin (ascending)
// @xminIds, @xmaxIds: coordinate ids, indexed by segment id
// @xx, @yy: arrays of x- and y-coordinates
//
MapShaper.intersectSegments = function(ids1, ids2, xminIds, xmaxIds, xx, yy) {
  var s1, s2, s1p1, s1p2, s2p1, s2p2,
      s1p1x, s1p2x, s2p1x, s2p2x,
      s1p1y, s1p2y, s2p1y, s2p2y,
      hit;
  var size1 = ids1.length,
      size2 = ids2.length;
  var ptr2 = 0,
      j;
  var intersections = [];

  // compare only
  for (var i=0; i<size1; i++) {
    s1 = ids1[i];
    s1p1 = xminIds[s1];
    s1p2 = xmaxIds[s1];
    s1p1x = xx[s1p1];
    s1p2x = xx[s1p2];
    s1p1y = yy[s1p1];
    s1p2y = yy[s1p2];

    j = ptr2;

    // Test intersection between s1 and segments with overlapping x extents
    while (j < size2) {
      s2 = ids2[j++];
      s2p1 = xminIds[s2];
      s2p1x = xx[s2p1];

      if (s2p1x < s1p1x) { // x extent of segment 2 is less than segment 1: advance seg. 2 pointer
        ptr2 = j;
        continue;
      }

      if (s1 == s2) continue; // comparing segment to self; skip

      if (s1p2x <= s2p1x) break; // x extent of seg 2 is greater than seg 1: done with seg 1

      s2p1y = yy[s2p1];
      s2p2 = xmaxIds[s2];
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

      // edge case: prevent double-hit if segments have same xmin
      if (s1p1x == s2p1x && s1p1y < s2p1y) continue;

      // test two candidate segments for intersection
      hit = segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y,
          s2p1x, s2p1y, s2p2x, s2p2y);
      if (hit) {
        intersections.push({
          intersection: {x: hit[0], y: hit[1]},
          segments: [[{x: s1p1x, y: s1p1y}, {x: s1p2x, y: s1p2y}], [{x: s2p1x, y: s2p1y}, {x: s2p2x, y: s2p2y}]]
        });
      }
    }
  }
  return intersections;
};
