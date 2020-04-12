
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
      index = new ArcIndex(pointCount),
      slice = usingTypedArrays() ? xx.subarray : Array.prototype.slice,
      paths, retn;
  paths = convertPaths(nn);
  retn = index.getVertexData();
  retn.paths = paths;
  return retn;

  function usingTypedArrays() {
    return !!(xx.subarray && yy.subarray);
  }

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

  function nextPoint(id) {
    var partId = pathIds[id],
        nextId = id + 1;
    if (nextId < pointCount && pathIds[nextId] === partId) {
      return id + 1;
    }
    var len = nn[partId];
    return sameXY(id, id - len + 1) ? id - len + 2 : -1;
  }

  function prevPoint(id) {
    var partId = pathIds[id],
        prevId = id - 1;
    if (prevId >= 0 && pathIds[prevId] === partId) {
      return id - 1;
    }
    var len = nn[partId];
    return sameXY(id, id + len - 1) ? id + len - 2 : -1;
  }

  function sameXY(a, b) {
    return xx[a] == xx[b] && yy[a] == yy[b];
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
        if (firstNodeId > -1) {
          arcIds.push(addEdge(arcStartId, i));
        } else {
          firstNodeId = i;
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

  // Test if a point @id is an endpoint of a topological path
  function pointIsArcEndpoint(id) {
    var id2 = chainIds[id],
        prev = prevPoint(id),
        next = nextPoint(id),
        prev2, next2;
    if (prev == -1 || next == -1) {
      // @id is an endpoint if it is the start or end of an open path
      return true;
    }
    while (id != id2) {
      prev2 = prevPoint(id2);
      next2 = nextPoint(id2);
      if (prev2 == -1 || next2 == -1 || brokenEdge(prev, next, prev2, next2)) {
        // there is a discontinuity at @id -- point is arc endpoint
        return true;
      }
      id2 = chainIds[id2];
    }
    return false;
  }

  // a and b are two vertices with the same x, y coordinates
  // test if the segments on either side of them are also identical
  function brokenEdge(aprev, anext, bprev, bnext) {
    var apx = xx[aprev],
        anx = xx[anext],
        bpx = xx[bprev],
        bnx = xx[bnext],
        apy = yy[aprev],
        any = yy[anext],
        bpy = yy[bprev],
        bny = yy[bnext];
    if (apx == bnx && anx == bpx && apy == bny && any == bpy ||
        apx == bpx && anx == bnx && apy == bpy && any == bny) {
      return false;
    }
    return true;
  }

  function mergeArcParts(src, startId, endId, startId2, endId2) {
    var len = endId - startId + endId2 - startId2 + 2,
        ArrayClass = usingTypedArrays() ? Float64Array : Array,
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
      arcId = index.addArc(mergeArcParts(xx, start1, end1, start2, end2),
          mergeArcParts(yy, start1, end1, start2, end2));
    }
    return arcId;
  }

  function addEdge(start, end) {
    // search for a matching edge that has already been generated
    var arcId = index.findDuplicateArc(xx, yy, start, end, nextPoint, prevPoint);
    if (arcId === null) {
      arcId = index.addArc(slice.call(xx, start, end + 1),
          slice.call(yy, start, end + 1));
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
