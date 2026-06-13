import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { editShapeParts, forEachShapePart } from '../paths/mapshaper-shape-utils';

// Clean polygon or polyline shapes (in-place)
//
export function cleanShapes(shapes, arcs, type) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = cleanShape(shapes[i], arcs, type);
  }
}

// Remove defective arcs and zero-area polygon rings
// Remove simple polygon spikes of form: [..., id, ~id, ...]
// Don't remove duplicate points
// Don't check winding order of polygon rings
function cleanShape(shape, arcs, type) {
  return editShapeParts(shape, function(path) {
    var cleaned = cleanPath(path, arcs);
    if (type == 'polygon' && cleaned) {
      removeSpikesInPath(cleaned); // assumed by addIntersectionCuts()
      if (geom.getPlanarPathArea(cleaned, arcs) === 0) {
        cleaned = null;
      }
    }
    return cleaned;
  });
}

function cleanPath(path, arcs) {
  var nulls = 0;
  for (var i=0, n=path.length; i<n; i++) {
    if (arcs.arcIsDegenerate(path[i])) {
      nulls++;
      path[i] = null;
    }
  }
  return nulls > 0 ? path.filter(function(id) {return id !== null;}) : path;
}


// Remove pairs of ids where id[n] == ~id[n+1] or id[0] == ~id[n-1];
// (in place)
// Iterative (was recursive): each pass removes at most one spike pair --
// the wrap-around pair first, otherwise the first interior pair -- and repeats
// until none remain. A path with many spikes used to recurse once per removal,
// risking a stack overflow on degenerate input.
export function removeSpikesInPath(ids) {
  var removed = true;
  while (removed) {
    removed = false;
    var n = ids.length;
    if (n < 2) break;
    if (ids[0] == ~ids[n-1]) {
      ids.pop();
      ids.shift();
      removed = true;
    } else {
      for (var i=1; i<n; i++) {
        if (ids[i-1] == ~ids[i]) {
          ids.splice(i-1, 2);
          removed = true;
          break;
        }
      }
    }
  }
}


// Returns a function for splitting self-intersecting polygon rings
// The splitter function receives a single polygon ring represented as an array
// of arc ids, and returns an array of split-apart rings.
//
// Self-intersections in the input ring are assumed to occur at vertices, not along segments.
// This requires that internal.addIntersectionCuts() has already been run.
//
// The rings output by this function may overlap each other, but each ring will
// be non-self-intersecting. For example, a figure-eight shaped ring will be
// split into two rings that touch each other where the original ring crossed itself.
//
export function getSelfIntersectionSplitter(nodes) {
  var pathIndex = new IdTestIndex(nodes.arcs.size(), true);
  var filter = function(arcId) {
    return pathIndex.hasId(~arcId);
  };
  return function(path) {
    pathIndex.setIds(path);
    var paths = dividePath(path);
    pathIndex.clear();
    return paths;
  };

  // Returns an array of 0 or more indivisible (non-self-intersecting) sub-paths.
  //
  // Iterative work-stack version of what was a mutually-recursive descent
  // (dividePath -> dividePathAtNode -> accumulatePaths -> dividePath ...). A
  // ring with many chained self-intersections forced a recursion depth
  // proportional to the number of splits and could overflow the call stack.
  //
  // The stack is processed depth-first, and each fork's sub-paths are pushed in
  // reverse so they pop in their original left-to-right order. This reproduces
  // the recursive version exactly, which matters because:
  //   - output order is preserved (covered by self-intersection-test.mjs), and
  //   - the shared `pathIndex` is mutated (clearId) as nodes are split, so a
  //     later sibling's split can depend on an earlier sibling's clears; the
  //     same depth-first order keeps those mutations in the same sequence.
  function dividePath(rootPath) {
    var results = [];
    var stack = [rootPath];
    while (stack.length > 0) {
      var path = stack.pop();
      var subPaths = splitPathAtFirstFork(path);
      if (subPaths === null) {
        // indivisible path -- clean it by removing any spikes
        removeSpikesInPath(path);
        if (path.length > 0) results.push(path);
      } else {
        for (var i = subPaths.length - 1; i >= 0; i--) {
          stack.push(subPaths[i]);
        }
      }
    }
    return results;
  }

  // Find the first node where @path forks and split it there (one level only),
  // returning the sub-paths; return null if the path does not fork.
  function splitPathAtFirstFork(path) {
    for (var i=0, n=path.length; i < n - 1; i++) { // don't need to check last arc
      var subPaths = dividePathAtNode(path, path[i]);
      if (subPaths !== null) {
        return subPaths;
      }
    }
    return null;
  }

  // If arc @enterId enters a node with more than one open route leading out:
  //   return array of sub-paths (split at this node only)
  // else return null
  function dividePathAtNode(path, enterId) {
    var nodeIds = nodes.getConnectedArcs(enterId, filter),
        exitArcIndexes, exitArcId, idx;
    if (nodeIds.length < 2) return null;
    exitArcIndexes = [];
    for (var i=0; i<nodeIds.length; i++) {
      exitArcId = ~nodeIds[i];
      idx = indexOf(path, exitArcId);
      if (idx > -1) { // repeated scanning may be bottleneck
        // important optimization (TODO: explain this)
        // TODO: test edge case: exitArcId occurs twice in the path
        pathIndex.clearId(exitArcId);
        exitArcIndexes.push(idx);
      } else {
        // TODO: investigate why this happens
      }
    }
    if (exitArcIndexes.length < 2) {
      return null;
    }
    // path forks -- the caller subdivides the returned sub-paths further
    return splitPathByIds(path, exitArcIndexes);
  }

  // Added as an optimization -- faster than using Array#indexOf()
  function indexOf(arr, el) {
    for (var i=0, n=arr.length; i<n; i++) {
      if (arr[i] === el) return i;
    }
    return -1;
  }

}

// Function returns an array of split-apart rings
// @path An array of arc ids describing a self-intersecting polygon ring
// @ids An array of two or more indexes of arcs that originate from a single vertex
//      where @path intersects itself -- assumes indexes are in ascending sequence
export function splitPathByIds(path, indexes) {
  var subPaths = [];
  utils.genericSort(indexes, true); // sort ascending
  if (indexes[0] > 0) {
    subPaths.push(path.slice(0, indexes[0]));
  }
  for (var i=0, n=indexes.length; i<n; i++) {
    if (i < n-1) {
      subPaths.push(path.slice(indexes[i], indexes[i+1]));
    } else {
      subPaths.push(path.slice(indexes[i]));
    }
  }
  // handle case where first subring is split across endpoint of @path
  if (subPaths.length > indexes.length) {
    utils.merge(subPaths[0], subPaths.pop());
  }
  return subPaths;
}
