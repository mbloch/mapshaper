/* @requires mapshaper-common */

// Return function for splitting self-intersecting polygon rings
// Returned function receives a single path, returns an array of paths
// Assumes that any intersections occur at vertices, not along segments
// (requires that MapShaper.divideArcs() has already been run)
//
MapShaper.getSelfIntersectionSplitter = function(nodes) {

  function contains(arr, el) {
    for (var i=0, n=arr.length; i<n; i++) {
      if (arr[i] === el) return true;
    }
    return false;
  }

  // If arc @enterId enters a node with more than one open routes leading out:
  //   return array of sub-paths
  // else return null
  function dividePathAtNode(path, enterId) {
    var count = 0,
        subPaths = null,
        exitIds, firstExitId;
    nodes.forEachConnectedArc(enterId, function(arcId) {
      var exitId = ~arcId;
      // TODO: remove performance bottleneck
      // contains() is faster than native array.indexOf(), could do better.
      // if (path.indexOf(exitId) > -1) { // ignore arcs that are not on this path
      if (contains(path, exitId)) { // ignore arcs that are not on this path
        if (count === 0) {
          firstExitId = exitId;
        } else if (count === 1) {
          exitIds = [firstExitId, exitId];
        } else {
          exitIds.push(exitId);
        }
        count++;
      }
    });
    if (exitIds) {
      subPaths = MapShaper.splitPathByIds(path, exitIds);
      // recursively divide each sub-path
      return subPaths.reduce(function(memo, subPath) {
        return memo.concat(dividePath(subPath));
      }, []);
    }
    return null;
  }

  function dividePath(path) {
    var subPaths = null;
    for (var i=0; i<path.length - 1; i++) { // don't need to check last arc
      subPaths = dividePathAtNode(path, path[i]);
      if (subPaths) {
        return subPaths;
      }
    }
    // indivisible path -- remove any spikes
    MapShaper.removeSpikesInPath(path);
    return path.length > 0 ? [path] : [];
  }

  return dividePath;
};

// @path An array of arc ids
// @ids An array of two or more start ids
MapShaper.splitPathByIds = function(path, ids) {
  var n = ids.length;
  var ii = ids.map(function(id) {
    var idx = path.indexOf(id);
    if (idx == -1) error("[splitPathByIds()] Path is missing id:", id);
    return idx;
  });
  utils.genericSort(ii, true);
  var subPaths = ii.map(function(idx, i) {
    var split;
    if (i == n-1) {
      // place first path item first
      split = path.slice(0, ii[0]).concat(path.slice(idx));
    } else {
      split = path.slice(idx, ii[i+1]);
    }
    return split;
  });

  // make sure first sub-path starts with arc at path[0]
  if (ii[0] !== 0) {
    subPaths.unshift(subPaths.pop());
  }
  if (subPaths[0][0] !== path[0]) {
    error("[splitPathByIds()] Indexing error");
  }
  return subPaths;
};
