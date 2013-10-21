/* @require mapshaper-segments */

// Combine detection and repair for cli
//
MapShaper.findAndRepairIntersections = function(arcs) {
  T.start();
  var intersections = MapShaper.findSegmentIntersections(arcs),
      unfixable = MapShaper.repairIntersections(arcs, intersections);
  T.stop('Find and repair intersections');
  var info = {
    pre: intersections.length,
    post: unfixable.length
  };
  info.repaired = info.post < info.pre ? info.pre - info.post : 0;
  return info;
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

  // index of segments that have been modified (see addSegmentVertices())
  var segmentIndex = {};

  while (repairEach(intersections) > 0) {
    // After each repair pass, check for new intersections that may have been
    // created as a by-product of repairing one set of intersections.
    //
    // Issue: several hit-detection passes through a large dataset may be slow.
    //
    // Possible optimization: only check for intersections among segments that
    // intersect bounding boxes of segments touched during previous repair pass.
    // Need: efficient way of checking up to thousands of bb... could
    // index boxes for n * log(k) or better performance....
    //
    intersections = MapShaper.findSegmentIntersections(arcs);
  }
  return intersections;

  function repairEach(intersections) {
    var fixes = 0;
    Utils.forEach(intersections, function(obj) {
      fixes += repairIntersection(obj);
    });
    return fixes;
  }

  function addSegmentVertices(ids, p1, p2) {
    // Consider: scan entire section between p1 & p2 for additional vertices
    // even if segment has not been processed already, and get rid of index.
    //
    var k = MapShaper.getSegmentKey(p1, p2),
        start, end, prev;

    if (k in segmentIndex === false) {
      ids.push(p1, p2);
      segmentIndex[k] = true;
    } else {
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
        }
      }
    }
  }

  /*
  function getStripeBounds(segments) {
    var bb = new Bounds();
    for (var i=0; i<segments.length; i++) {
      bb.mergePoint(xx[i], yy[i]);
    }
    return bb;
  }
  */

  function repairIntersection(obj) {
    var repairs = 0,
        ids = obj.ids,
        segments = [];
    addSegmentVertices(segments, ids[0], ids[1]);
    addSegmentVertices(segments, ids[2], ids[3]);

    while (true) {
      var collisions = MapShaper.intersectSegments(segments, raw.xx, raw.yy),
          collision;
      if (collisions.length === 0) {
        // No intersections found... success!
        break;
      }

      // Fix first collision; if more than one, fix in subsequent pass.
      collision = collisions[0];
      ids = collision.ids;
      var i = MapShaper.findNextRemovableVertex(zz, zlim, ids[0], ids[1]),
          j = MapShaper.findNextRemovableVertex(zz, zlim, ids[2], ids[3]),
          zi = i == -1 ? Infinity : zz[i],
          zj = j == -1 ? Infinity : zz[j];

      if (zi == Infinity && zj == Infinity) {
        // No more points available to add; unable to repair.
        break;
      }

      // Re-introduce the next-highest vertex to the polyline

      var startId, endId, newId, segId;
      if (zi < zj) {
        start = ids[0];
        end = ids[1];
        newId = i;
        segId = collision.i;
      } else {
        start = ids[2];
        end = ids[3];
        newId = j;
        segId = collision.j;
      }

      // if (segments[segId] != start || segments[segId+1] != end) error("id error")

      zz[newId] = zlim; // add segment to line at current z level

      // Split segment containing new point into two
      segments[segId + 1] = newId;
      if (xx[newId] < xx[start]) {
        segments[segId] = newId;
        segments[segId + 1] = start;
      } else {
        segments[segId + 1] = newId;
      }

      if (xx[newId] < xx[end]) {
        segments.push(newId, end);
      } else {
        segments.push(end, newId);
      }

      repairs++;
    }
    return repairs;
  }
};

MapShaper.getSegmentKey = function(id1, id2) {
  return id1 + "~" + id2;
};

MapShaper.findNextRemovableVertex = function(zz, zlim, start, end) {
  var tmp, jz = 0, j = -1, z;
  if (start > end) {
    tmp = start;
    start = end;
    end = tmp;
  }
  for (var i=start+1; i<end; i++) {
    z = zz[i];
    if (z < zlim && z > jz) {
      j = i;
      jz = z;
    }
  }
  return j;
};
