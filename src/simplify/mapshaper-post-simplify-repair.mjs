import { intersectSegments } from '../paths/mapshaper-segment-intersection';
import { findNextRemovableVertex } from '../paths/mapshaper-path-utils';
import { message, verbose, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { findSegmentIntersections } from '../paths/mapshaper-segment-intersection';

// Remove line-segment intersections introduced by simplification by rolling
// back simplification along intersecting segments.
//
// Limitation of this method: it can't remove intersections that are present
// in the original dataset.
// TODO: don't roll back simplification for unrepairable intersections.
//
export function postSimplifyRepair(arcs) {
  var intersections = findSegmentIntersections(arcs),
      unfixable = repairIntersections(arcs, intersections),
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
}

// @intersections (Array) Output from findSegmentIntersections()
// Returns array of unresolved intersections, or empty array if none.
// (export for GUI)
export function repairIntersections(arcs, intersections) {
  while (unwindIntersections(arcs, intersections) > 0) {
    intersections = findSegmentIntersections(arcs);
  }
  return intersections;
}

function unwindIntersections(arcs, intersections) {
  var data = arcs.getVertexData(),
      zlim = arcs.getRetainedInterval(),
      changes = 0,
      loops = 0,
      replacements, queue, target, i;

  // create a queue of unwind targets
  queue = getUnwindTargets(intersections, zlim, data.zz);
  utils.sortOn(queue, 'z', !!"ascending");

  while (queue.length > 0) {
    target = queue.pop();
    // redetect unwind target, in case a previous unwind operation has changed things
    // TODO: don't redetect if target couldn't have been affected
    replacements = redetectIntersectionTarget(target, zlim, data.xx, data.yy, data.zz);
    if (replacements.length == 1) {
      replacements = unwindIntersection(replacements[0], zlim, data.zz);
      changes++;
    } else  {
      // either 0 or multiple intersections detected
    }

    for (i=0; i<replacements.length; i++) {
      insertUnwindTarget(queue, replacements[i]);
    }
  }
  if (++loops > 500000) {
    verbose("Caught an infinite loop at intersection:", target);
    return 0;
  }
  return changes;
}

function getUnwindTargets(intersections, zlim, zz) {
  return intersections.reduce(function(memo, o) {
    var target = getUnwindTarget(o, zlim, zz);
    if (target !== null) {
      memo.push(target);
    }
    return memo;
  }, []);
}

// @o an intersection object
// returns null if no vertices can be added along both segments
// else returns an object with properties:
//   a: intersecting segment to be partitioned
//   b: intersecting segment to be retained
//   z: threshold value of one or more points along [a] to be re-added
function getUnwindTarget(o, zlim, zz) {
  var ai = findNextRemovableVertex(zz, zlim, o.a[0], o.a[1]),
      bi = findNextRemovableVertex(zz, zlim, o.b[0], o.b[1]),
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
}

// Insert an intersection into sorted position
function insertUnwindTarget(arr, obj) {
  var ins = arr.length;
  while (ins > 0) {
    if (arr[ins-1].z <= obj.z) {
      break;
    }
    arr[ins] = arr[ins-1];
    ins--;
  }
  arr[ins] = obj;
}

// Partition one of two intersecting segments by setting the removal threshold
// of vertices indicated by @target equal to @zlim (the current simplification
// level of the ArcCollection)
function unwindIntersection(target, zlim, zz) {
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
}

function redetectIntersectionTarget(targ, zlim, xx, yy, zz) {
  var segIds = getIntersectionCandidates(targ, zlim, xx, yy, zz);
  var intersections = intersectSegments(segIds, xx, yy);
  return getUnwindTargets(intersections, zlim, zz);
}

function getIntersectionCandidates(o, zlim, xx, yy, zz) {
  var segIds = getSegmentVertices(o.a, zlim, xx, yy, zz);
  segIds = segIds.concat(getSegmentVertices(o.b, zlim, xx, yy, zz));
  return segIds;
}

// Get all segments defined by two endpoints and the vertices between
// them that are at or above the current simplification threshold.
// TODO: test intersections with identical start + end ids
function getSegmentVertices(seg, zlim, xx, yy, zz) {
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
}
