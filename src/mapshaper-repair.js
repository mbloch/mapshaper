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

  while (repairAll(intersections) > 0) {
    // After each repair pass, check for new intersections that may have been
    // created as a by-product of repairing one set of intersections.
    //
    // Issue: several hit-detection passes through a large dataset may be slow.
    //
    // Possible optimization: only check for intersections among segments that
    // intersect bounding boxes of segments touched during previous repair pass.
    // Need an efficient way of checking up to thousands of bb... could
    // index boxes for n * log(k) or better performance.
    //
    intersections = MapShaper.findSegmentIntersections(arcs);
  }
  return intersections;

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
    var repairs = 0;
    var index = {};

    intersections = Utils.mapFilter(intersections, function(obj) {
      if (setPriority(obj) == Infinity) return void 0;
      index[obj.key] = true;
      return obj;
    });

    // sort on priority
    Utils.sortOn(intersections, 'z', !!"ascending");

    var loops = 0;
    while (intersections.length > 0) {
      if (loops++ > 100000) return 0; // just in case
      var len = intersections.length;
      var obj = intersections.pop();
      var ids = [];
      addSegmentVertices(ids, obj.ids[0], obj.ids[1]);
      addSegmentVertices(ids, obj.ids[2], obj.ids[3]);

      var collisions = MapShaper.intersectSegments(ids, xx, yy),
          pairs, pair;

      if (collisions.length === 0) continue;
      if (collisions.length == 1) {
        pair = collisions[0];
        if (setPriority(pair) == Infinity) continue;
        pairs = splitSegmentPair(pair);
        zz[pair.newId] = zlim;
        repairs++;
      } else {
        pairs = collisions;
      }

      for (var i=0; i<pairs.length; i++) {
        pair = pairs[i];
        if (setPriority(pair) < Infinity) {
          if (pair.key in index === false) {
            index[pair.key] = true;
            intersections.push(pair);
          }
        }
      }

      // TODO: find a way to avoid this indexing kludge
      delete index[obj.key];

      if (intersections.length >= len) {
        sortIntersections(intersections, len-1);
      }
    }

    trace("repairs:", repairs);
    return repairs;
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
    obj.key = MapShaper.getIntersectionKey.apply(null, ids);
    return obj;
  }

  // Use insertion sort to move newly pushed intersections to their sorted position
  function sortIntersections(arr, start) {
    for (var i=start; i<arr.length; i++) {
      var obj = arr[i];
      for (var j = i-1; j >= 0; j--) {
        if (arr[j].z < obj.z) {
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

  function addSegmentVertices(ids, p1, p2) {
    // Scan section between p1 & p2 for additional vertices
    //
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
      }
    }
  }
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
