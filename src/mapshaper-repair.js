/* @require mapshaper-segments */

// Combine detection and repair for cli
//
MapShaper.findAndRepairIntersections = function(arcs) {
  T.start();
  var intersections = MapShaper.findSegmentIntersections(arcs),
      unfixable = MapShaper.repairIntersections(arcs, intersections),
      countPre = intersections.length,
      countPost = unfixable.length,
      countFixed = countPre > countPost ? countPre - countPost : 0;
  T.stop('Find and repair intersections');
  return {
    intersections_initial: countPre,
    intersections_remaining: countPost,
    intersections_repaired: countFixed
  };
};


// Try to resolve a collection of line-segment intersections by rolling
// back simplification along intersecting segments.
//
// Limitation of this method: it can't remove intersections that are present
// in the original dataset.
//
// @arcs ArcDataset object
// @intersections (Array) Output from MapShaper.findSegmentIntersections()
// Returns array of unresolved intersections, or empty array if none.
//
MapShaper.repairIntersections = function(arcs, intersections) {

  var raw = arcs.getVertexData(),
      zz = raw.zz,
      yy = raw.yy,
      xx = raw.xx,
      zlim = arcs.getRetainedInterval();

  while (repairAll(intersections) > 0) {
    // After each repair pass, check for new intersections that may have been
    // created as a by-product of repairing one set of intersections.
    //
    // Issue: several hit-detection passes through a large dataset may be slow.
    // Possible optimization: only check for intersections among segments that
    // intersect bounding boxes of segments touched during previous repair pass.
    // Need an efficient way of checking up to thousands of bounding boxes.
    // Consider indexing boxes for n * log(k) or better performance.
    //
    intersections = MapShaper.findSegmentIntersections(arcs);
  }
  return intersections;

  // Find the z value of the next vertex that should be re-introduced into
  // a set of two intersecting segments in order to remove the intersection.
  // Add the z-value and id of this point to the intersection object @obj.
  //
  function setPriority(obj) {
    ids = obj.ids;
    var i = MapShaper.findNextRemovableVertex(zz, zlim, ids[0], ids[1]),
        j = MapShaper.findNextRemovableVertex(zz, zlim, ids[2], ids[3]),
        zi = i == -1 ? Infinity : zz[i],
        zj = j == -1 ? Infinity : zz[j];

    if (zi == Infinity && zj == Infinity) {
      // No more points available to add; unable to repair.
      return Infinity;
    }

    if (zi > zj && zi < Infinity || zj == Infinity) {
      obj.newId = i;
      obj.z = zi;
    } else {
      obj.newId = j;
      obj.z = zj;
      obj.ids = [ids[2], ids[3], ids[0], ids[1]];
    }
    return obj.z;
  }

  function repairAll(intersections) {
    var repairs = 0,
        loops = 0,
        intersection, segIds, pairs, pair, len;

    intersections = Utils.mapFilter(intersections, function(obj) {
      if (setPriority(obj) == Infinity) return void 0;
      return obj;
    });

    Utils.sortOn(intersections, 'z', !!"ascending");

    while (intersections.length > 0) {
      len = intersections.length;
      intersection = intersections.pop();
      segIds = getIntersectionCandidates(intersection);
      pairs = MapShaper.intersectSegments(segIds, xx, yy);

      if (pairs.length === 0) continue;
      if (pairs.length == 1) {
        // single intersection found: re-introduce a vertex to one of the
        // intersecting segments.
        pair = pairs[0];
        if (setPriority(pair) == Infinity) continue;
        pairs = splitSegmentPair(pair);
        zz[pair.newId] = zlim;
        repairs++;
      } else {
        // found multiple intersections along two segments, because
        // vertices have been re-introduced after intersection was first added.
        // They get pushed back on the stack below
      }

      for (var i=0; i<pairs.length; i++) {
        pair = pairs[i];
        if (setPriority(pair) < Infinity) {
          intersections.push(pair);
        }
      }

      if (intersections.length >= len) {
        sortIntersections(intersections, len-1);
      }

      if (++loops > 500000) {
        trace("Caught an infinite loop at intersection:", intersection);
        return 0;
      }
    }

    // trace("repairs:", repairs);
    return repairs;
  }

  // Use insertion sort to move newly pushed intersections to their sorted position
  function sortIntersections(arr, start) {
    for (var i=start; i<arr.length; i++) {
      var obj = arr[i];
      for (var j = i-1; j >= 0; j--) {
        if (arr[j].z <= obj.z) {
          break;
        }
        arr[j+1] = arr[j];
      }
      arr[j+1] = obj;
    }
  }

  function splitSegmentPair(obj) {
    var ids = obj.ids,
        start = ids[0],
        end = ids[1],
        middle = obj.newId;
    if (!(start < middle && middle < end || start > middle && middle > end)) {
      error("[splitSegment()] Indexing error --", obj);
    }
    return [
      getSegmentPair(start, middle, ids[2], ids[3]),
      getSegmentPair(middle, end, ids[2], ids[3])
    ];
  }

  function getSegmentPair(s1p1, s1p2, s2p1, s2p2) {
    var obj = {},
        ids;
    if (xx[s1p1] > xx[s1p2]) {
      ids = [s1p2, s1p1, s2p1, s2p2];
    } else {
      ids = [s1p1, s1p2, s2p1, s2p2];
    }
    obj.ids = ids;
    return obj;
  }

  function getIntersectionCandidates(obj) {
    var segments = [];
    addSegmentVertices(segments, obj.ids[0], obj.ids[1]);
    addSegmentVertices(segments, obj.ids[2], obj.ids[3]);
    return segments;
  }

  // Gat all segments defined by two endpoints and the vertices between
  // them that are at or above the current simplification threshold.
  // @ids Accumulator array
  function addSegmentVertices(ids, p1, p2) {
    var start, end, prev;
    if (p1 <= p2) {
      start = p1;
      end = p2;
    } else {
      start = p2;
      end = p1;
    }
    prev = start;
    for (var i=start+1; i<=end; i++) {
      if (zz[i] >= zlim) {
        if (xx[prev] < xx[i]) {
          ids.push(prev, i);
        } else {
          ids.push(i, prev);
        }
        prev = i;
      }
    }
  }
};
