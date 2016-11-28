/* @requires mapshaper-common */

// Return function for splitting self-intersecting polygon rings
// Splitter function receives a single path, returns an array of paths
// Intersections are assumed to occur at vertices, not along segments
// (requires that MapShaper.addIntersectionCuts() has already been run)
//
MapShaper.getSelfIntersectionSplitter = function(nodes) {
  return dividePath;

  // Returns array of 0 or more divided paths
  function dividePath(path) {
    var subPaths = null;
    for (var i=0; i<path.length - 1; i++) { // don't need to check last arc
      subPaths = dividePathAtNode(path, path[i]);
      if (subPaths) {
        return subPaths;
      }
    }
    // indivisible path -- clean it by removing any spikes
    MapShaper.removeSpikesInPath(path);
    return path.length > 0 ? [path] : [];
  }

  // If arc @enterId enters a node with more than one open routes leading out:
  //   return array of sub-paths
  // else return null
  function dividePathAtNode(path, enterId) {
    var nodeIds = nodes.getConnectedArcs(enterId),
        exitIds = [],
        outId;
    for (var i=0; i<nodeIds.length; i++) {
      outId = ~nodeIds[i];
      if (contains(path, outId)) { // repeated scanning may be bottleneck
        exitIds.push(outId);
      }
    }
    if (exitIds.length > 1) {
      // path forks -- recursively subdivide
      return MapShaper.splitPathByIds(path, exitIds).reduce(accumulatePaths, null);
    }
    return null;
  }

  function accumulatePaths(memo, path) {
    var subPaths = dividePath(path);
    return memo ? memo.concat(subPaths) : subPaths;
  }

  // Added as an optimization -- tested faster than using Array#indexOf()
  function contains(arr, el) {
    for (var i=0, n=arr.length; i<n; i++) {
      if (arr[i] === el) return true;
    }
    return false;
  }
};

// Function returns an array of split-apart rings
// @path An array of arc ids describing a self-intersecting polygon ring
// @ids An array of two or more ids of arcs that originate from a single vertex
//      where @path intersects itself.
MapShaper.splitPathByIds = function(path, ids) {
  var subPaths = [];
  // Find array indexes in @path of each split id
  var indexes = ids.map(function(id) {
    var i = path.indexOf(id);
    if (i == -1) error("[splitPathByIds()] missing arc:", id);
    return i;
  });
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
  if (subPaths.length > ids.length) {
    subPaths[0] = subPaths[0].concat(subPaths.pop());
  }
  return subPaths;
};
