/* @require mapshaper-segment-intersection */

// Remove line-segment intersections introduced by simplification by rolling
// back simplification along intersecting segments.
//
// Limitation of this method: it can't remove intersections that are present
// in the original dataset.
// TODO: don't roll back simplification for unrepairable intersections.
//
internal.postSimplifyRepair = function(arcs) {
  var intersections = internal.findSegmentIntersections(arcs),
      unfixable = internal.repairIntersections(arcs, intersections),
      countPre = intersections.length,
      countPost = unfixable.length,
      countFixed = countPre > countPost ? countPre - countPost : 0,
      msg;
  if (countPre > 0) {
    msg = utils.format("Repaired %'i intersection%s", countFixed,
        utils.pluralSuffix(countFixed));
    if (countPost > 0) {
      msg += utils.format("; %'i intersection%s could not be repaired", countPost,
          utils.pluralSuffix(countPost));
    }
    message(msg);
  }
};

// @intersections (Array) Output from internal.findSegmentIntersections()
// Returns array of unresolved intersections, or empty array if none.
//
internal.repairIntersections = function(arcs, intersections) {
  while (internal.unwindIntersections(arcs, intersections) > 0) {
    intersections = internal.findSegmentIntersections(arcs);
  }
  return intersections;
};

internal.unwindIntersections = function(arcs, intersections) {
  var data = arcs.getVertexData(),
      zlim = arcs.getRetainedInterval(),
      changes = 0,
      loops = 0,
      replacements, queue, target, i;

  // create a queue of unwind targets
  queue = internal.getUnwindTargets(intersections, zlim, data.zz);
  utils.sortOn(queue, 'z', !!"ascending");

  while (queue.length > 0) {
    target = queue.pop();
    // redetect unwind target, in case a previous unwind operation has changed things
    // TODO: don't redetect if target couldn't have been affected
    replacements = internal.redetectIntersectionTarget(target, zlim, data.xx, data.yy, data.zz);
    if (replacements.length == 1) {
      replacements = internal.unwindIntersection(replacements[0], zlim, data.zz);
      changes++;
    } else  {
      // either 0 or multiple intersections detected
    }

    for (i=0; i<replacements.length; i++) {
      internal.insertUnwindTarget(queue, replacements[i]);
    }
  }
  if (++loops > 500000) {
    verbose("Caught an infinite loop at intersection:", target);
    return 0;
  }
  return changes;
};

internal.getUnwindTargets = function(intersections, zlim, zz) {
  return intersections.reduce(function(memo, o) {
    var target = internal.getUnwindTarget(o, zlim, zz);
    if (target !== null) {
      memo.push(target);
    }
    return memo;
  }, []);
};

// @o an intersection object
// returns null if no vertices can be added along both segments
// else returns an object with properties:
//   a: intersecting segment to be partitioned
//   b: intersecting segment to be retained
//   z: threshold value of one or more points along [a] to be re-added
internal.getUnwindTarget = function(o, zlim, zz) {
  var ai = internal.findNextRemovableVertex(zz, zlim, o.a[0], o.a[1]),
      bi = internal.findNextRemovableVertex(zz, zlim, o.b[0], o.b[1]),
      targ;
  if (ai == -1 && bi == -1) {
    targ = null;
  } else if (bi == -1 || ai != -1 && zz[ai] > zz[bi]) {
    targ = {
      a: o.a,
      b: o.b,
      z: zz[ai]
    };
  } else {
    targ = {
      a: o.b,
      b: o.a,
      z: zz[bi]
    };
  }
  return targ;
};

// Insert an intersection into sorted position
internal.insertUnwindTarget = function(arr, obj) {
  var ins = arr.length;
  while (ins > 0) {
    if (arr[ins-1].z <= obj.z) {
      break;
    }
    arr[ins] = arr[ins-1];
    ins--;
  }
  arr[ins] = obj;
};

// Partition one of two intersecting segments by setting the removal threshold
// of vertices indicated by @target equal to @zlim (the current simplification
// level of the ArcCollection)
internal.unwindIntersection = function(target, zlim, zz) {
  var replacements = [];
  var start = target.a[0],
      end = target.a[1],
      z = target.z;
  for (var i = start + 1; i <= end; i++) {
    if (zz[i] == z || i == end) {
      replacements.push({
        a: [start, i],
        b: target.b,
        z: z
      });
      if (i != end) zz[i] = zlim;
      start = i;
    }
  }
  if (replacements.length < 2) error("Error in unwindIntersection()");
  return replacements;
};

internal.redetectIntersectionTarget = function(targ, zlim, xx, yy, zz) {
  var segIds = internal.getIntersectionCandidates(targ, zlim, xx, yy, zz);
  var intersections = internal.intersectSegments(segIds, xx, yy);
  return internal.getUnwindTargets(intersections, zlim, zz);
};

internal.getIntersectionCandidates = function(o, zlim, xx, yy, zz) {
  var segIds = internal.getSegmentVertices(o.a, zlim, xx, yy, zz);
  segIds = segIds.concat(internal.getSegmentVertices(o.b, zlim, xx, yy, zz));
  return segIds;
};

// Get all segments defined by two endpoints and the vertices between
// them that are at or above the current simplification threshold.
// TODO: test intersections with identical start + end ids
internal.getSegmentVertices = function(seg, zlim, xx, yy, zz) {
  var start, end, prev, ids = [];
  if (seg[0] <= seg[1]) {
    start = seg[0];
    end = seg[1];
  } else {
    start = seg[1];
    end = seg[0];
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
  return ids;
};
