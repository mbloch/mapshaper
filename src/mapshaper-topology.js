/* @requires arrayutils, format, mapshaper-common */

// buildTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array],      // x-coords of each point in the dataset (coords of all paths are concatenated)
//    yy: [Array],      // y-coords of each point
//    pathData: [Array] // array of path data records, e.g.: {size: 20, shapeId: 3, isHole: false, isNull: false, isPrimary: true}
// }
//
// Output format:
// {
//    arcs: [Array],   // Arcs are represented as two-element arrays
//                     //   arc[0] is an array of x-coords, arc[1] is an array of y-coords
//    shapes: [Array]  // Shapes are arrays of one or more parts; Parts are arrays of one or more arc id.
// }                   //   negative arc ids indicate reverse direction, using the same indexing scheme as TopoJSON.
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

// Returns a function that translates (x,y) coords into unsigned ints for hashing
// @bbox A Bounds object giving the extent of the dataset.
//
MapShaper.getPointToUintHash = function(bbox) {
  var mask = (1 << 29) - 1,
      kx = (1e8 * Math.E / bbox.width()),
      ky = (1e8 * Math.PI / bbox.height()),
      bx = -bbox.xmin,
      by = -bbox.ymin;

  return function(x, y) {
    // transform coords to integer range and scramble bits a bit
    var key = x * kx + bx;
    key ^= y * ky + by;
    // key ^= Math.PI * 1e9;
    key &= 0x7fffffff; // mask as positive integer
    return key;
  };
};


//
//
function ArcIndex(hashTableSize, xyToUint) {
  hashTableSize |= 0; // make sure we have an integer size
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
        arcId = hashTable[hash(xx[start], yy[start])],
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
      xyToUint = MapShaper.getPointToUintHash(MapShaper.calcXYBounds(xx, yy)),
      index = new ArcIndex(pointCount * 0.2, xyToUint),
      typedArrays = !!(xx.subarray && yy.subarray),
      slice, array;

  var pathIds = initPathIds(pointCount, pathData);
  var paths = [];

  if (typedArrays) {
    array = Float64Array;
    slice = xx.subarray;
  } else {
    array = Array;
    slice = Array.prototype.slice;
  }

  T.start();
  var chainIds = initPointChains(xx, yy, pathIds, xyToUint);
  T.stop("Find matching vertices");

  T.start();
  var pointId = 0;
  Utils.forEach(pathData, function(pathObj, pathId) {
    var procPath = pointIsRingEndpoint(pointId) ? procClosedPath : procOpenPath;
    paths[pathId] = procPath(pointId, pathId, pathObj);
    pointId += pathObj.size;
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
    if (pathIds[id+1] !== partId) {
      return id - pathData[partId].size + 2;
    }
    return id + 1;
  }

  function prevPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id - 1] !== partId) {
      return id + pathData[partId].size - 2;
    }
    return id - 1;
  }

  function pointIsRingEndpoint(id1) {
    var pathId = pathIds[id1],
        pathLen = pathData[pathId].size,
        id2 = id1 + pathLen - 1;
    return pathLen >= 4 && xx[id1] === xx[id2] && yy[id1] === yy[id2];
  }

  // Test whether point is unique
  // Endpoints of polygon rings are counted as unique
  //
  function pointIsSingleton(id) {
    var chainId = chainIds[id],
        partId, chainPartId;

    while (chainId != id) {
      partId = pathIds[id];
      if (pathIds[chainId] != partId) {
        return false;
      }
      chainPartId = pathIds[chainId];
      // if either point or chained point is not an endpoint, point is not singleton
      if (pathIds[id-1] == partId && pathIds[id+1] == partId
        || pathIds[chainId-1] == chainPartId && pathIds[chainId+1] == chainPartId) {
        return false;
      }
      chainId = chainIds[chainId];
    }
    return true;
  }

  // Convert an open path to one or more topological paths
  //
  function procOpenPath(pathStartId, pathId, pathObj) {
    var arcIds = [],
        pathEndId = pathStartId + pathObj.size - 1,
        arcStartId = pathStartId,
        xarr, yarr;

    for (var i=pathStartId + 1; i<=pathEndId; i++) {
      if (!pointIsSingleton(i) || i == pathEndId) {
        xarr = slice.call(xx, arcStartId, i + 1);
        yarr = slice.call(yy, arcStartId, i + 1);
        arcIds.push(index.addArc(xarr, yarr));
        arcStartId = i;
      }
    }
    return arcIds;
  }


  // Convert a closed path to one or more arcs
  //
  function procClosedPath(pathStartId, pathId, pathObj) {
    var arcIds = [],
        pathLen = pathObj.size,
        pathEndId = pathStartId + pathLen - 1;
    var inArc = false,
        firstNodeId = -1,
        arcStartId;

    if (pathObj.isNull) return;

    // Visit each point in the path, up to but not including the endpoint
    //
    for (var i = pathStartId; i < pathEndId; i++) {
      if (pointIsNode(i)) {
        if (inArc) {
          arcIds.push(addEdge(arcStartId, i));
        } else {
          firstNodeId = i;
        }
        arcStartId = i;
        inArc = true;
      }
    }

    // Identify the final arc in the path
    //
    if (inArc) {
      if (firstNodeId == pathStartId) {
        // path endpoint is a node;
        if (!pointIsNode(pathEndId)) {
          error("Topology error"); // TODO: better error handling
        }
        arcIds.push(addEdge(arcStartId, i));
      } else {
        // final arc wraps around
        arcIds.push(addEdge(arcStartId, pathEndId, pathStartId + 1, firstNodeId))
      }
    }
    else {
      // TODO: refactor, messy
      // Not in an arc, i.e. no nodes have been found...
      // Assuming that path is either an island or is congruent with one or more ring-arcs
      var matchingPathId = findIntersectingPath(pathStartId);
      if (matchingPathId >= 0) {
        var pairedPath = paths[matchingPathId],
            pairedPathObj = pathData[matchingPathId];
        if (pairedPath.length != 1) {
          error("ArcEngine error:", pairedPath);
        }
        var pairedArcId = pairedPath[0],
            arcId = pathObj.isHole == pairedPathObj.isHole ? pairedArcId : -1 - pairedArcId;
        arcIds.push(arcId);
      } else {
        arcIds.push(addEdge(pathStartId, pathEndId));
      }
    }
    return arcIds;
  };

  // Return id of previously discovered path that intersects point at @pointId, or -1
  //
  function findIntersectingPath(pointId) {
    var pathId = pathIds[pointId],
        chainId = chainIds[pointId];

    while (chainId != pointId) {
      if (pathIds[chainId] < pathId) {
        return pathIds[chainId];
      }
      chainId = chainIds[chainId];
    }
    return -1;
  }

  // @a and @b are ids of two points with same x, y coords
  // Return false if adjacent points match, either in fw or rev direction
  //
  function pointsDiverge(a, b) {
    var xarr = xx, yarr = yy; // local vars: faster
    var aprev = prevPoint(a),
        anext = nextPoint(a),
        bprev = prevPoint(b),
        bnext = nextPoint(b);

    if (xarr[aprev] == xarr[bnext] && xarr[anext] == xarr[bprev] &&
      yarr[aprev] == yarr[bnext] && yarr[anext] == yarr[bprev]) {
      return false;
    } else if (xarr[aprev] == xarr[bprev] && xarr[anext] == xarr[bnext] &&
      yarr[aprev] == yarr[bprev] && yarr[anext] == yarr[bnext]) {
      return false;
    }
    return true;
  }

  // Test if a point on a path is at the junction between
  // two or more topological edges (arcs)
  //
  function pointIsNode(id) {
    var chainId = chainIds[id];
    while (id != chainId) {
      if (pointsDiverge(id, chainId)) {
        return true;
      }
      chainId = chainIds[chainId];
    }
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
    if (arcId >= 0) return -1 - arcId;

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
function initPointChains(xx, yy, pathIds, hash) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.5);
  // A hash table larger than ~1.5 * point count doesn't seem to improve performance much.

  // Each hash bin contains the id of the first point in a chain of points.
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  var chainIds = new Int32Array(pointCount);
  var key, headId, tailId, x, y, partId;

  for (var i=0; i<pointCount; i++) {
    if (pathIds[i] == -1) {
      chainIds[i] = -1;
      continue;
    }
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
        // case -- adding to a chain: place new coordinate at end of chain, point it to head of chain to create cycle
        tailId = headId;
        while (chainIds[tailId] != headId) {
          tailId = chainIds[tailId];
        }
        chainIds[i] = headId;
        chainIds[tailId] = i;
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
    if (arcId < 1) arcId = -1 - arcId;
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

// export functions for testing
MapShaper.topology = {
  buildPathTopology: buildPathTopology,
  ArcIndex: ArcIndex,
  groupPathsByShape: groupPathsByShape,
  protectPath: protectPath,
  initPathIds: initPathIds
};