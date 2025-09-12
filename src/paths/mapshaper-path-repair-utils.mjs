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
export function removeSpikesInPath(ids) {
  var n = ids.length;
  if (n >= 2) {
    if (ids[0] == ~ids[n-1]) {
      ids.pop();
      ids.shift();
    } else {
      for (var i=1; i<n; i++) {
        if (ids[i-1] == ~ids[i]) {
          ids.splice(i-1, 2);
          break;
        }
      }
    }
    if (ids.length < n) {
      removeSpikesInPath(ids);
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

  // Returns array of 0 or more divided paths
  function dividePath(path) {
    var subPaths = null;
    for (var i=0, n=path.length; i < n - 1; i++) { // don't need to check last arc
      subPaths = dividePathAtNode(path, path[i]);
      if (subPaths !== null) {
        return subPaths;
      }
    }
    // indivisible path -- clean it by removing any spikes
    removeSpikesInPath(path);
    return path.length > 0 ? [path] : [];
  }

  // If arc @enterId enters a node with more than one open routes leading out:
  //   return array of sub-paths
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
    // path forks -- recursively subdivide
    var subPaths = splitPathByIds(path, exitArcIndexes);
    return subPaths.reduce(accumulatePaths, null);
  }

  function accumulatePaths(memo, path) {
    var subPaths = dividePath(path);
    if (memo === null) {
      return subPaths;
    }
    memo.push.apply(memo, subPaths);
    return memo;
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
