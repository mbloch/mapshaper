/* @requires mapshaper-common */

// buildTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array|Float64Array],   // x-coords of each point in the dataset
//    yy: [Array|Float64Array],   // y-coords "  "  "  "
//    pathData: [Array] // array of path data records, e.g.: {size: 20, shapeId: 3, isHole: false, isNull: false, isPrimary: true}
// }
// Note: x- and y-coords of all paths are concatenated into two long arrays, for easy indexing
// Note: Input coords can use typed arrays (better performance) or regular arrays (for testing)
//
// Output format:
// {
//    arcs: [Array],   // Arcs are represented as two-element arrays
//                     //   arc[0] and arc[1] are x- and y-coords in an Array or Float64Array
//    shapes: [Array]  // Shapes are arrays of one or more path; paths are arrays of one or more arc id.
// }                   //   Arc ids use the same numbering scheme as TopoJSON (see note).
// Note: Arc ids in the shapes array are indices of objects in the arcs array.
//       Negative ids signify that the arc coordinates are in reverse sequence.
//       Negative ids are converted to array indices with the fornula fwId = ~revId.
//       -1 is arc 0 reversed, -2 is arc 1 reversed, etc.
// Note: Arcs use typed arrays or regular arrays for coords, depending on the input array type.
//
MapShaper.buildTopology = function(obj) {
  if (!(obj.xx && obj.yy && obj.pathData)) error("[buildTopology()] Missing required param/s");

  T.start();
  var topoData = buildPathTopology(obj.xx, obj.yy, obj.pathData);
  topoData.arcMinPointCounts = calcMinPointCounts(topoData.paths, obj.pathData, topoData.arcs, topoData.sharedArcFlags);
  topoData.shapes = groupPathsByShape(topoData.paths, obj.pathData);
  delete topoData.paths;
  T.stop("Process topology");
  return topoData;
};


// Based on a function published by Mike Bostock
// https://github.com/mbostock/topojson/issues/64#issuecomment-16692286
// This function is simpler but tested well on a range of inputs.
//
MapShaper.xyToUintHash = (function() {
  var buf = new ArrayBuffer(16),
      floats = new Float64Array(buf),
      uints = new Uint32Array(buf);

  return function(x, y) {
    floats[0] = x;
    floats[1] = y;
    var xk = uints[0] ^ uints[1],
        yk = uints[2] ^ uints[3];
    return (xk << 3 ^ xk >>> 5 ^ yk) & 0x7fffffff;
  }
}());


//
//
function ArcIndex(pointCount, xyToUint) {
  var hashTableSize = Math.ceil(pointCount * 0.25);
  var hashTable = new Int32Array(hashTableSize),
      hash = function(x, y) {
        return xyToUint(x, y) % hashTableSize;
      },
      chainIds = [],
      arcs = [],
      sharedArcs = [];

  Utils.initializeArray(hashTable, -1);

  this.addArc = function(xx, yy) {
    var end = xx.length - 1,
        key = hash(xx[end], yy[end]),
        chainId = hashTable[key],
        arcId = arcs.length;

    hashTable[key] = arcId;
    arcs.push([xx, yy]);
    sharedArcs.push(0);
    chainIds.push(chainId);
    return arcId;
  };

  // Look for a previously generated arc with the same sequence of coords, but in the
  // opposite direction. (This program uses the convention of CW for space-enclosing rings, CCW for holes,
  // so coincident boundaries should contain the same points in reverse sequence).
  //
  this.findArcNeighbor = function(xx, yy, start, end, getNext) {
    var next = getNext(start),
        key = hash(xx[start], yy[start]),
        arcId = hashTable[key],
        arcX, arcY, len;

    while (arcId != -1) {
      // check endpoints and one segment...
      // it would be more rigorous but slower to identify a match
      // by comparing all segments in the coordinate sequence
      arcX = arcs[arcId][0];
      arcY = arcs[arcId][1];
      len = arcX.length;
      if (arcX[0] === xx[end] && arcX[len-1] === xx[start] && arcX[len-2] === xx[next]
          && arcY[0] === yy[end] && arcY[len-1] === yy[start] && arcY[len-2] === yy[next]) {
        sharedArcs[arcId] = 1;
        return arcId;
      }
      arcId = chainIds[arcId];
    }
    return -1;
  };

  this.getArcs = function() {
    return arcs;
  };


  this.getSharedArcFlags = function() {
    return sharedArcs;
  }
}


// Transform spaghetti paths into topological paths
//
function buildPathTopology(xx, yy, pathData) {
  var pointCount = xx.length,
      index = new ArcIndex(pointCount, MapShaper.xyToUintHash),
      typedArrays = !!(xx.subarray && yy.subarray),
      slice, array;

  var pathIds = initPathIds(pointCount, pathData);

  if (typedArrays) {
    array = Float64Array;
    slice = xx.subarray;
  } else {
    array = Array;
    slice = Array.prototype.slice;
  }

  T.start();
  var chainIds = initPointChains(xx, yy, MapShaper.xyToUintHash);
  T.stop("Find matching vertices");


  T.start();
  var pointId = 0;
  var paths = Utils.map(pathData, function(pathObj) {
    var pathLen = pathObj.size,
        arcs = pathObj.isNull ? null : convertPath(pointId, pointId + pathLen - 1);
    pointId += pathLen;
    return arcs;
  });
  T.stop("Find topological boundaries")

  var sharedArcFlags = index.getSharedArcFlags();
  if (typedArrays) {
    sharedArcFlags = new Uint8Array(sharedArcFlags)
  }

  return {
    paths: paths,
    arcs: index.getArcs(),
    sharedArcFlags: sharedArcFlags
  };

  function nextPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id+1] === partId) {
      return id + 1;
    }
    var len = pathData[partId].size;
    return sameXY(id, id - len + 1) ? id - len + 2 : -1;
  }

  function prevPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id - 1] === partId) {
      return id - 1;
    }
    var len = pathData[partId].size;
    return sameXY(id, id + len - 1) ? id + len - 2 : -1;
  }

  function sameXY(a, b) {
    return xx[a] == xx[b] && yy[a] == yy[b];
  }


  // Convert a non-topological path to one or more topological arcs
  // @start, @end are ids of first and last points in the path
  //
  function convertPath(start, end) {
    var arcIds = [],
        firstNodeId = -1,
        arcStartId;

    // Visit each point in the path, up to but not including the last point
    //
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
    //
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
      arcIds.push(addEdge(arcStartId, end, start + 1, firstNodeId))
    }

    return arcIds;
  };

  // @a and @b are ids of two points with same x, y coords
  // Return false if adjacent points match, either in fw or rev direction
  //
  function brokenEdge(a, b) {
    var xarr = xx, yarr = yy; // local vars: faster
    var aprev = prevPoint(a),
        anext = nextPoint(a),
        bprev = prevPoint(b),
        bnext = nextPoint(b);
    if (aprev == -1 || anext == -1 || bprev == -1 || bnext == -1) {
      return true;
    }
    else if (xarr[aprev] == xarr[bnext] && xarr[anext] == xarr[bprev] &&
      yarr[aprev] == yarr[bnext] && yarr[anext] == yarr[bprev]) {
      return false;
    }
    else if (xarr[aprev] == xarr[bprev] && xarr[anext] == xarr[bnext] &&
      yarr[aprev] == yarr[bprev] && yarr[anext] == yarr[bnext]) {
      return false;
    }
    return true;
  }

  // Test if a point @id is an endpoint of a topological path
  //
  function pointIsArcEndpoint(id) {
    var chainId = chainIds[id];
    if (chainId == id) {
      // point is unique -- point is arc endpoint iff it is start or end of an open path
      return nextPoint(id) == -1 || prevPoint(id) == -1;
    }
    do {
      if (brokenEdge(id, chainId)) {
        // there is a discontinuity at @id -- point is arc endpoint
        return true;
      }
      chainId = chainIds[chainId];
    } while (id != chainId);
    // path parallels all adjacent paths at @id -- point is not arc endpoint
    return false;
  }


  function mergeArcParts(src, startId, endId, startId2, endId2) {
    var len = endId - startId + endId2 - startId2 + 2,
        dest = new array(len),
        j = 0, i;
    for (i=startId; i <= endId; i++) {
      dest[j++] = src[i];
    }
    for (i=startId2; i <= endId2; i++) {
      dest[j++] = src[i];
    }
    if (j != len) error("mergeArcParts() counting error.");
    return dest;
  }

  function addEdge(startId1, endId1, startId2, endId2) {
    var splitArc = endId2 != null,
        start = startId1,
        end = splitArc ? endId2 : endId1,
        arcId, xarr, yarr;

    // Look for previously identified arc, in reverse direction (normal topology)
    arcId = index.findArcNeighbor(xx, yy, start, end, nextPoint);
    if (arcId >= 0) return ~arcId;

    // Look for matching arc in same direction
    // (Abnormal topology, but we're accepting it because real-world Shapefiles
    //   sometimes have duplicate paths)
    arcId = index.findArcNeighbor(xx, yy, end, start, prevPoint);
    if (arcId >= 0) return arcId;

    if (splitArc) {
      xarr = mergeArcParts(xx, startId1, endId1, startId2, endId2);
      yarr = mergeArcParts(yy, startId1, endId1, startId2, endId2);
    } else {
      xarr = slice.call(xx, startId1, endId1 + 1);
      yarr = slice.call(yy, startId1, endId1 + 1);
    }
    return index.addArc(xarr, yarr);
  }

  //
  //
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
      arcId = index.findArcNeighbor(xx, yy, i, i, nextPoint);
      if (arcId >= 0) return ~arcId;

      arcId = index.findArcNeighbor(xx, yy, i, i, prevPoint);
      if (arcId >= 0) return arcId;
    }

    error("Unmatched ring.")
  }
}


// Create a lookup table for path ids; path ids are indexed by point id
//
function initPathIds(size, pathData) {
  var pathIds = new Int32Array(size),
      j = 0;
  for (var pathId=0, pathCount=pathData.length; pathId < pathCount; pathId++) {
    for (var i=0, n=pathData[pathId].size; i<n; i++, j++) {
      pathIds[j] = pathId;
    }
  }
  return pathIds;
}



// Return an array with data for chains of vertices with same x, y coordinates
// Array ids are same as ids of x- and y-coord arrays.
// Array values are ids of next point in each chain.
// Unique (x, y) points link to themselves (i.e. arr[n] == n)
//
function initPointChains(xx, yy, hash) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.4);
  // A hash table larger than ~1.5 * point count doesn't seem to improve performance much.

  // Hash table is temporary storage for building chains of matching point ids.
  // Each hash bin contains the id of the first point in a chain.
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  //
  var chainIds = new Int32Array(pointCount);
  var key, headId, x, y;

  for (var i=0; i<pointCount; i++) {
    x = xx[i];
    y = yy[i];
    key = hash(x, y) % hashTableSize;

    // Points with different (x, y) coords can hash to the same bin;
    // ... use linear probing to find a different bin for each (x, y) coord.
    while (true) {
      headId = hashChainIds[key];
      if (headId == -1) {
        // case -- first coordinate in chain: start new chain, point to self
        hashChainIds[key] = i;
        chainIds[i] = i;
        break;
      }
      else if (xx[headId] == x && yy[headId] == y) {
        // case -- extending a chain: insert new point after head of chain
        chainIds[i] = chainIds[headId];
        chainIds[headId] = i;
        break;
      }
      // case -- this bin is used by another coord, try the next bin
      key = (key + 1) % hashTableSize;
    }
  }
  return chainIds;
};


// Calculate number of interior points to preserve in each arc
// to protect selected rings from collapsing.
//
function calcMinPointCounts(paths, pathData, arcs, sharedArcFlags) {
  var arcMinPointCounts = new Uint8Array(arcs.length);
  Utils.forEach(paths, function(path, pathId) {
    // if a part has 3 or more arcs, assume it won't collapse...
    // TODO: look into edge cases where this isn't true
    if (path.length <= 2 && pathData[pathId].isPrimary) {
      protectPath(path, arcs, sharedArcFlags, arcMinPointCounts)
    }
  });
  return arcMinPointCounts;
}

function protectPath(path, arcs, sharedArcFlags, minArcPoints) {
  var arcId;
  for (var i=0, arcCount=path.length; i<arcCount; i++) {
    arcId = path[i];
    if (arcId < 1) arcId = ~arcId;
    if (arcCount == 1) { // one-arc polygon (e.g. island) -- save two interior points
      minArcPoints[arcId] = 2;
    }
    else if (sharedArcFlags[arcId] != 1) {
      minArcPoints[arcId] = 1; // non-shared member of two-arc polygon: save one point
      // TODO: improve the logic here
    }
  }
}

// Use shapeId property of @pathData objects to group paths by shape
//
function groupPathsByShape(paths, pathData) {
  var shapes = [];
  Utils.forEach(paths, function(path, pathId) {
    var shapeId = pathData[pathId].shapeId;
    if (shapeId >= shapes.length) {
      shapes[shapeId] = [path]; // first part in a new shape
    } else {
      shapes[shapeId].push(path);
    }
  });
  return shapes;
}

// Export functions for testing
MapShaper.topology = {
  buildPathTopology: buildPathTopology,
  ArcIndex: ArcIndex,
  groupPathsByShape: groupPathsByShape,
  protectPath: protectPath,
  initPathIds: initPathIds
};