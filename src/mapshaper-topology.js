/* @requires arrayutils, format, mapshaper-common */

// buildArcTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array],      // x-coords of each point in the dataset (coords of all shapes are concatenated)
//    yy: [Array],      // y-coords of each point
//    partIds: [Array],   // Part ids of each point (part ids are 0-indexed and consecutive)
//    shapeIds: [Array]   // Shape ids indexed by part id (shape ids are 0-indexed and consecutive)
// }
//
// Output format:
// {
//    arcs: [Array],   // Arcs are represented as two-element arrays
//                     //   arc[0] is an array of x-coords, arc[1] is an array of y-coords
//    shapes: [Array]  // Shapes are arrays of one or more parts; Parts are arrays of one or more arc id.
// }                   //   negative arc ids indicate reverse direction, using the same indexing scheme as TopoJSON.
//
MapShaper.buildArcTopology = function(obj) {
  if (!(obj.xx && obj.yy && obj.shapeIds && obj.pathSizes && obj.pathFlags)) error("[buildArcTopology()] Missing required param/s");

  T.start();
  var topoData = new ArcEngine(obj.xx, obj.yy, obj.pathSizes, obj.pathFlags).buildTopology();
  topoData.arcMinPointCounts = calcMinPointCounts(topoData.paths, obj.pathFlags, topoData.arcs, topoData.sharedArcFlags);
  topoData.shapes = groupPathsByShape(topoData.paths, obj.shapeIds);
  T.stop("Process topology");
  return topoData;
};

// Generates a hash function to convert an x,y coordinate into an unsigned integer
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
MapShaper.initPointChains = function(xx, yy, partIds, hash) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.5);
  // A hash table larger than ~1.5 * point count doesn't improve performance much.

  // Each hash bin contains the id of the first point in a chain of points with the same x, y coords
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  // Ids of next point in each chain, indexed by point id
  var nextIds = new Int32Array(pointCount);
  var key, headId, tailId, x, y, partId;

  for (var i=0; i<pointCount; i++) {
    if (partIds[i] == -1) {
      nextIds[i] = -1;
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
        nextIds[i] = i;
        break;
      }
      else if (xx[headId] == x && yy[headId] == y) {
        // case -- adding to a chain: place new coordinate at end of chain, point it to head of chain to create cycle
        tailId = headId;
        while (nextIds[tailId] != headId) {
          tailId = nextIds[tailId];
        }
        nextIds[i] = headId;
        nextIds[tailId] = i;
        break;
      }
      // try another hash bin
      key = (key + 1) % hashTableSize;
    }
  }
  return nextIds;
};

function ArcIndex(hashTableSize, xyToUint) {
  hashTableSize |= 0; // make sure we have an integer size
  var hashTable = new Int32Array(hashTableSize),
      hash = function(x, y) {
        return xyToUint(x, y) % hashTableSize;
      },
      chainIds = [],
      arcs = [];

  Utils.initializeArray(hashTable, -1);

  this.addArc = function(xx, yy) {
    var len = xx.length,
        key = hash(xx[len-1], yy[len-1]),
        chainId = hashTable[key],
        arcId = arcs.length;
    hashTable[key] = arcId;
    arcs.push([xx, yy]);
    chainIds.push(chainId);
    return arcId;
  };

  // Look for a previously generated arc with the same sequence of coords, but in the
  // opposite direction. (This program uses the convention of CW for space-enclosing rings, CCW for holes,
  // so coincident boundaries should contain the same points in reverse sequence).
  //
  this.findArcNeighbor = function(xx, yy, start, end, next) {
    var next = next(start),
        x0 = xx[start],
        y0 = yy[start],
        x1 = xx[next],
        y1 = yy[next],
        xn = xx[end],
        yn = yy[end],
        key = hash(x0, y0),
        arcId = hashTable[key],
        arcX, arcY, len;

    while (arcId != -1) {
      // check endpoints and one segment...
      // it would be more rigorous but slower to identify a match
      // by comparing all segments in the coordinate sequence
      arcX = arcs[arcId][0];
      arcY = arcs[arcId][1];
      len = arcX.length;
      if (arcX[0] === xn && arcX[len-1] === x0 && arcX[len-2] === x1
          && arcY[0] === yn && arcY[len-1] === y0 && arcY[len-2] === y1) {
        return arcId;
      }
      arcId = chainIds[arcId];
    }

    return -1;
  };

  this.getArcs = function() {
    return arcs;
  };
}


function ArcEngine(xx, yy, pathSizes, pathFlags) {
  var pointCount = xx.length,
      xyToUint = MapShaper.getPointToUintHash(MapShaper.calcXYBounds(xx, yy)),
      index = new ArcIndex(pointCount * 0.2, xyToUint);

  var paths = [],
      sharedArcs = [];

  var ISLAND = C.PART_IS_ISLAND,
      HAS_UNIQUE = C.PART_HAS_UNIQUE_POINT,
      SINGLE_NEIGHBOR = C.PART_HAS_SINGLE_NEIGHBOR;

  var partIds = initPathIds(pathSizes);

  // Create chains of vertices with same x, y coordinates
  //
  T.start();
  var chainIds = MapShaper.initPointChains(xx, yy, partIds, xyToUint);
  T.stop("Find matching vertices");

  if (!(pointCount > 0 && yy.length == pointCount && partIds.length == pointCount && chainIds.length == pointCount)) error("Mismatched array lengths");


  function nextPoint(id) {
    var partId = partIds[id];
    if (partIds[id+1] !== partId) {
      return id - pathSizes[partId] + 2;
    }
    return id + 1;
  }

  function prevPoint(id) {
    var partId = partIds[id];
    if (partIds[id - 1] !== partId) {
      return id + pathSizes[partId] - 2;
    }
    return id - 1;
  }

  function pointIsSingleton(id) {
    var chainId = chainIds[id],
        partId, chainPartId;

    while (chainId != id) {
      partId = partIds[id];
      if (partIds[chainId] != partId) {
        return false;
      }
      chainPartId = partIds[chainId];
      // if either point or chained point is not an endpoint, point is not singleton
      if (partIds[id-1] == partId && partIds[id+1] == partId
        || partIds[chainId-1] == chainPartId && partIds[chainId+1] == chainPartId) {
        return false;
      }
      chainId = chainIds[chainId];
    }
    return true;
  }

  function pointIsShared(id) {
    var chainId = chainIds[id],
        partId = partIds[id];
    while (chainId != id) {
      if (partId != partIds[chainId]) {
        return true;
      }
      chainId = chainIds[chainId];
    }
    return false;
  }

  // TODO: modify to check for singletons
  //
  function findSharedPoint(id) {
    var neighborPartId,
        neighborId = -1,
        chainPartId,
        partId = partIds[id],
        chainId = chainIds[id];

    while (chainId != id) {
      chainPartId = partIds[chainId];
      if (chainPartId == partId) {
        // skip
      }
      else if (neighborId == -1) {
        neighborId = chainId;
        neighborPartId = chainPartId;
      }
      else if (chainPartId != neighborPartId) {
        return -2;
      }
      chainId = chainIds[chainId];
    }
    return neighborId;
  }

  function getSharedPoints(id) {
    var chainId = chainIds[id],
        partId = partIds[id],
        arr = [];
    while (chainId != id) {
      if (partId != partIds[chainId]) {
        arr.push(chainId);
      }
      chainId = chainIds[chainId];
    }
    return arr;
  }

  // TODO: extend for polylines
  function procPath(startId, pathLen, pathId, flags) {
    var arcIds = [],
        endId = startId + pathLen - 1,
        prevId, nextId;
    var inArc = false,
        firstNodeId = -1,
        firstArcId;

    if (flags & C.PATH_IS_NULL) return;

    // don't reach endpoint
    for (var i = startId; i < endId; i++) {
      prevId = i == startId ? endId - 1 : i - 1;
      nextId = i + 1; // can't overrun path

      if (pointIsNode(i, prevId, nextId)) {
        // trace("got a node")
        if (inArc) {
          arcIds.push(addArc(firstArcId, i));
        } else {
          firstNodeId = i;
        }
        firstArcId = i;
        inArc = true;
      }
    }

    // complete the ring...
    if (inArc) {
      if (firstNodeId == startId) {
        // endpoint is a node: complete the circle
        if (!pointIsNode(endId, endId-1, startId + 1)) {
          error("Topology error")
        }
        arcIds.push(addArc(firstArcId, i));
      } else {
        // final arc wraps around
        arcIds.push(addArc(firstArcId, endId, startId + 1, firstNodeId))
      }
    }
    else {
      // Not in an arc, i.e. no nodes have been found...
      // Path is either an island or a pair of matching paths
      if (pointIsShared(startId)) {
        // island-in-hole or hole-around-island pair
        var sharedPoints = getSharedPoints(startId);
        var pairedPathId = partIds[sharedPoints[0]];
        if (pairedPathId < pathId) {
          // counterpart has already been converted to an arc; use reversed arc
          var pairedPath = paths[pairedPathId];
          if (pairedPath.length != 1) {
            error("ArcEngine error:", pairedPath);
          }

          arcIds.push(-1 -pairedPath[0]);
        }
        else {
          // first of two paths: treat like an island
          arcIds.push(addArc(startId, endId));
        }
      }
      else {
        // independent island
        arcIds.push(addArc(startId, endId));
      }
    }

    paths.push(arcIds);
  };

  function pointIsNode(id, prev, next) {
    var xarr = xx, yarr = yy, chains = chainIds, parts = partIds; // local vars: faster;

    var sharedId, sharedNext, sharedPrev;

    //if (chainId == id) return false; // singleton: not a node
    if (pointIsSingleton(id)) return false;

    if (pointIsSingleton(prev) || pointIsSingleton(next)) {
      //trace("prev/next singleton")
      return true;
    }

    sharedId = findSharedPoint(id);

    if (sharedId < 0) {
      //trace("no shared point")
      return true;
    }

    sharedNext = nextPoint(sharedId);
    sharedPrev = prevPoint(sharedId);

    if (xarr[sharedNext] != xarr[prev] || xarr[sharedPrev] != xarr[next] ||
      yarr[sharedNext] != yarr[prev] || yarr[sharedPrev] != yarr[next]) {
      //trace("coord mismatch; shared:", sharedId, "prev:", sharedPrev, "next:", sharedNext, "prev0:", prev, "next0:", next)
      return true;
    }


    /* // DONE: handle edge case where nodes (x) not detected
    --    --
   |  |  |  |
   *--x--x--*
   |        |
    --------
    */
    return false;
  }


  function mergeArcParts(src, startId, endId, startId2, endId2) {
    var len = endId - startId + endId2 - startId2 + 2,
        dest = new Float64Array(len),
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

  function addArc(startId, endId, startId2, endId2) {
    var arcId, xarr, yarr, i;
    var splitArc = endId2 != null;
    var matchId = index.findArcNeighbor(xx, yy, startId, splitArc ? endId2 : endId, nextPoint);
    if (matchId == -1) {
      if (splitArc) {
        xarr = mergeArcParts(xx, startId, endId, startId2, endId2);
        yarr = mergeArcParts(yy, startId, endId, startId2, endId2);
      } else {
        // Creating subarrays on xx and yy creates many fewer objects for memory
        //   management to track than creating new x and y Array objects for each arc.
        //   With 846MB ZCTA file, gc() time reduced from 580ms to 65ms in Node.js,
        //   topology time from >26s to ~17s, subsequent processing much faster.
        //   Negligible improvement on smaller files.
        //
        xarr = xx.subarray(startId, endId + 1);
        yarr = yy.subarray(startId, endId + 1);
      }

      arcId = index.addArc(xarr, yarr);
      sharedArcs[arcId] = 0;
    } else {
      arcId = -1 - matchId;
      sharedArcs[matchId] = 1;
    }
    return arcId;
  }

  this.buildTopology = function() {
    var pointId = 0;
    T.start();
    Utils.forEach(pathSizes, function(pathSize, pathId) {
      procPath(pointId, pathSize, pathId, pathFlags[pathId]);
      pointId += pathSize;
    });
    T.stop("Find topological boundaries")

    return {
      paths: paths,
      arcs:index.getArcs(),
      sharedArcFlags: new Uint8Array(sharedArcs) // convert to typed array to reduce objects in memory.
    };
  };
}


function initPathIds(pathSizes) {
  var pathIds = new Int32Array(Utils.sum(pathSizes)),
      j = 0;
  for (var pathId=0, pathCount=pathSizes.length; pathId < pathCount; pathId++) {
    for (var i=0, n=pathSizes[pathId]; i<n; i++, j++) {
      pathIds[j] = pathId;
    }
  }
  return pathIds;
}


function calcMinPointCounts(paths, pathFlags, arcs, sharedArcFlags) {

  // export retained point data for preventing null shapes
  //
  var arcMinPointCounts = null,
      PRIMARY = C.PATH_IS_PRIMARY;

  var arcMinPointCounts = new Uint8Array(arcs.length);
  Utils.forEach(paths, function(path, pathId) {
    // calculate minPointCount for each arc
    // (to protect largest part of each shape from collapsing)
    var pathLen = path.length,
        arcId;
    // if a part has 3 or more arcs, assume it won't collapse...
    // TODO: look into edge cases where this isn't true

    if (pathLen <= 2 && pathFlags[pathId] & PRIMARY) {
      for (var i=0; i<pathLen; i++) {
        arcId = path[i];
        if (arcId < 1) arcId = -1 - arcId;
        if (pathLen == 1) { // one-arc polygon (e.g. island) -- save two interior points
          arcMinPointCounts[arcId] = 2;
        }
        else if (sharedArcFlags[arcId] != 1) {
          arcMinPointCounts[arcId] = 1; // non-shared member of two-arc polygon: save one point
          // TODO: improve the logic here
        }
      }
    }
  });
}

function groupPathsByShape(paths, shapeIds) {
  // Group topological shape-parts by shape
  var shapes = [];
  Utils.forEach(paths, function(path, pathId) {
    var shapeId = shapeIds[pathId];
    if (shapeId >= shapes.length) {
      shapes[shapeId] = [path]; // first part in a new shape
    } else {
      shapes[shapeId].push(path);
    }
  });
  return shapes;
}