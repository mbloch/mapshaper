
import { ArcIndex } from '../topology/mapshaper-arc-index';
import { initPointChains } from '../topology/mapshaper-topology-chains-v2';
import { reversePath } from '../paths/mapshaper-path-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { error } from '../utils/mapshaper-logging';

// Converts all polygon and polyline paths in a dataset to a topological format
// (in-place)
export function buildTopology(dataset) {
  if (!dataset.arcs) return;
  var raw = dataset.arcs.getVertexData(),
      cooked = buildPathTopology(raw.nn, raw.xx, raw.yy);
  dataset.arcs.updateVertexData(cooked.nn, cooked.xx, cooked.yy);
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
      lyr.shapes = replaceArcIds(lyr.shapes, cooked.paths);
    }
  });
}

// buildPathTopology() converts non-topological paths into
// a topological format
//
// Arguments:
//    xx: [Array|Float64Array],   // x coords of each point in the dataset
//    yy: [Array|Float64Array],   // y coords ...
//    nn: [Array]  // length of each path
//
// (x- and y-coords of all paths are concatenated into two arrays)
//
// Returns:
// {
//    xx, yy (array)   // coordinate data
//    nn: (array)      // points in each arc
//    paths: (array)   // Paths are arrays of one or more arc id.
// }
//
// Negative arc ids in the paths array indicate a reversal of arc -(id + 1)
//
export function buildPathTopology(nn, xx, yy) {
  var pointCount = xx.length,
      chainIds = initPointChains(xx, yy),
      pathIds = initPathIds(pointCount, nn),
      pathIsRing = initPathIsRing(nn, xx, yy),
      isNode = computeIsNode(nn, xx, yy, chainIds, pathIds, pathIsRing),
      index = new ArcIndex(pointCount),
      paths, retn;
  paths = convertPaths(nn);
  retn = index.getVertexData();
  retn.paths = paths;
  return retn;

  function convertPaths(nn) {
    var paths = [],
        pointId = 0,
        pathLen;
    for (var i=0, len=nn.length; i<len; i++) {
      pathLen = nn[i];
      paths.push(pathLen < 2 ? null : convertPath(pointId, pointId + pathLen - 1));
      pointId += pathLen;
    }
    return paths;
  }

  // Fast neighbour lookups using the precomputed pathIsRing cache.
  // Used by findDuplicateArc (via addEdge/addSplitEdge) and by addRing.
  function nextPoint(id) {
    var partId = pathIds[id],
        nextId = id + 1;
    if (nextId < pointCount && pathIds[nextId] === partId) {
      return nextId;
    }
    return pathIsRing[partId] ? id - nn[partId] + 2 : -1;
  }

  function prevPoint(id) {
    var partId = pathIds[id],
        prevId = id - 1;
    if (prevId >= 0 && pathIds[prevId] === partId) {
      return prevId;
    }
    return pathIsRing[partId] ? id + nn[partId] - 2 : -1;
  }

  function pointIsArcEndpoint(id) {
    return isNode[id] === 1;
  }

  // Convert a non-topological path to one or more topological arcs
  // @start, @end are ids of first and last points in the path
  // TODO: don't allow id ~id pairs
  //
  function convertPath(start, end) {
    var arcIds = [],
        firstNodeId = -1,
        arcStartId;

    // Visit each point in the path, up to but not including the last point
    for (var i = start; i < end; i++) {
      if (pointIsArcEndpoint(i)) {
        if (firstNodeId == -1) {
          firstNodeId = i;
        } else {
          arcIds.push(addEdge(arcStartId, i));
        }
        arcStartId = i;
      }
    }

    // Identify the final arc in the path
    if (firstNodeId == -1) {
      // Not in an arc, i.e. no nodes have been found...
      // Assuming that path is either an island or is congruent with one or more rings
      arcIds.push(addRing(start, end));
    }
    else if (firstNodeId == start) {
      // path endpoint is a node;
      if (!pointIsArcEndpoint(end)) {
        error("Topology error"); // TODO: better error handling
      }
      arcIds.push(addEdge(arcStartId, i));
    } else {
      // final arc wraps around
      arcIds.push(addSplitEdge(arcStartId, end, start + 1, firstNodeId));
    }
    return arcIds;
  }

  function mergeArcParts(src, startId, endId, startId2, endId2) {
    var len = endId - startId + endId2 - startId2 + 2,
        ArrayClass = src.subarray ? Float64Array : Array,
        dest = new ArrayClass(len),
        j = 0, i;
    for (i=startId; i <= endId; i++) {
      dest[j++] = src[i];
    }
    for (i=startId2; i <= endId2; i++) {
      dest[j++] = src[i];
    }
    return dest;
  }

  function addSplitEdge(start1, end1, start2, end2) {
    var arcId = index.findDuplicateArc(xx, yy, start1, end2, nextPoint, prevPoint);
    if (arcId === null) {
      // Coordinates for a split (wrap-around) edge don't form a contiguous
      // slice of xx/yy, so we build a standalone buffer and hand it to the
      // index as the arc's source.
      var mx = mergeArcParts(xx, start1, end1, start2, end2),
          my = mergeArcParts(yy, start1, end1, start2, end2);
      arcId = index.addArc(mx, my, 0, mx.length - 1);
    }
    return arcId;
  }

  function addEdge(start, end) {
    // search for a matching edge that has already been generated
    var arcId = index.findDuplicateArc(xx, yy, start, end, nextPoint, prevPoint);
    if (arcId === null) {
      arcId = index.addArc(xx, yy, start, end);
    }
    return arcId;
  }

  function addRing(startId, endId) {
    var chainId = chainIds[startId],
        pathId = pathIds[startId],
        arcId;

    while (chainId != startId) {
      if (pathIds[chainId] < pathId) {
        break;
      }
      chainId = chainIds[chainId];
    }

    if (chainId == startId) {
      return addEdge(startId, endId);
    }

    for (var i=startId; i<endId; i++) {
      arcId = index.findDuplicateArc(xx, yy, i, i, nextPoint, prevPoint);
      if (arcId !== null) return arcId;
    }
    error("Unmatched ring; id:", pathId, "len:", nn[pathId]);
  }
}


// Create a lookup table for path ids; path ids are indexed by point id
//
function initPathIds(size, pathSizes) {
  var pathIds = new Int32Array(size),
      j = 0;
  for (var pathId=0, pathCount=pathSizes.length; pathId < pathCount; pathId++) {
    for (var i=0, n=pathSizes[pathId]; i<n; i++, j++) {
      pathIds[j] = pathId;
    }
  }
  return pathIds;
}

// Per-path flag: 1 if the path is a closed ring (first vertex coincides with
// last vertex), else 0. Computed once so that prevPoint()/nextPoint() don't
// need to call sameXY() at path boundaries.
//
function initPathIsRing(nn, xx, yy) {
  var pathCount = nn.length,
      pathIsRing = new Uint8Array(pathCount),
      pstart = 0, len;
  for (var p = 0; p < pathCount; p++) {
    len = nn[p];
    if (len > 1 &&
        xx[pstart] === xx[pstart + len - 1] &&
        yy[pstart] === yy[pstart + len - 1]) {
      pathIsRing[p] = 1;
    }
    pstart += len;
  }
  return pathIsRing;
}

// Decide, for every point, whether it is a topological node (an arc
// endpoint). Being a node is a property of the entire coincident-point
// chain: all points sharing a location agree on the answer. So we walk
// each chain at most once — O(n) total — instead of doing the walk
// independently at every point (O(n * K), quadratic per chain).
//
// A chain's points are nodes iff:
//   - any member has a missing neighbour (open-path endpoint), or
//   - two members disagree on the unordered pair of neighbour coords.
//
function computeIsNode(nn, xx, yy, chainIds, pathIds, pathIsRing) {
  var n = xx.length,
      isNode = new Uint8Array(n),
      done = new Uint8Array(n);

  function nextPoint(id) {
    var part = pathIds[id], nid = id + 1;
    if (nid < n && pathIds[nid] === part) return nid;
    return pathIsRing[part] ? id - nn[part] + 2 : -1;
  }

  function prevPoint(id) {
    var part = pathIds[id], pid = id - 1;
    if (pid >= 0 && pathIds[pid] === part) return pid;
    return pathIsRing[part] ? id + nn[part] - 2 : -1;
  }

  for (var i = 0; i < n; i++) {
    if (done[i]) continue;
    var result = chainIsBroken(i);
    var id = i;
    do {
      isNode[id] = result;
      done[id] = 1;
      id = chainIds[id];
    } while (id !== i);
  }
  return isNode;

  // Returns 1 if the chain containing `start` has any broken neighbour
  // signature (i.e. all members are nodes), else 0.
  function chainIsBroken(start) {
    var prev = prevPoint(start),
        next = nextPoint(start);
    if (prev === -1 || next === -1) return 1;
    var refPX = xx[prev], refPY = yy[prev],
        refNX = xx[next], refNY = yy[next];
    var id = chainIds[start];
    while (id !== start) {
      var p = prevPoint(id), q = nextPoint(id);
      if (p === -1 || q === -1) return 1;
      var px = xx[p], py = yy[p], qx = xx[q], qy = yy[q];
      var fwd = px === refPX && py === refPY && qx === refNX && qy === refNY;
      var rev = px === refNX && py === refNY && qx === refPX && qy === refPY;
      if (!fwd && !rev) return 1;
      id = chainIds[id];
    }
    return 0;
  }
}

function replaceArcIds(src, replacements) {
  return src.map(function(shape) {
    return replaceArcsInShape(shape, replacements);
  });

  function replaceArcsInShape(shape, replacements) {
    if (!shape) return null;
    return shape.map(function(path) {
      return replaceArcsInPath(path, replacements);
    });
  }

  function replaceArcsInPath(path, replacements) {
    return path.reduce(function(memo, id) {
      var abs = absArcId(id);
      var topoPath = replacements[abs];
      if (topoPath) {
        if (id < 0) {
          topoPath = topoPath.concat(); // TODO: need to copy?
          reversePath(topoPath);
        }
        for (var i=0, n=topoPath.length; i<n; i++) {
          memo.push(topoPath[i]);
        }
      }
      return memo;
    }, []);
  }
}
