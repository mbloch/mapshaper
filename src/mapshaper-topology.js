/* @requires arrayutils, format, mapshaper-common */

// buildArcTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array],      // x-coords of each point in the dataset (coords of all shapes are concatenated)
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
MapShaper.buildArcTopology = function(obj) {
  if (!(obj.xx && obj.yy && obj.pathData)) error("[buildArcTopology()] Missing required param/s");

  T.start();
  var topoData = new ArcEngine(obj.xx, obj.yy, obj.pathData).buildTopology();
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


// Return an array with data for chains of vertices with same x, y coordinates
// Array ids are same as ids of x- and y-coord arrays.
// Array values are ids of next point in each chain.
// Unique (x, y) points link to themselves (i.e. arr[n] == n)
//
MapShaper.initPointChains = function(xx, yy, partIds, hash) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.5);
  // A hash table larger than ~1.5 * point count doesn't seem to improve performance much.

  // Each hash bin contains the id of the first point in a chain of points.
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  var chainIds = new Int32Array(pointCount);
  var key, headId, tailId, x, y, partId;

  for (var i=0; i<pointCount; i++) {
    if (partIds[i] == -1) {
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


//
//
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
    var end = xx.length - 1,
        key = hash(xx[end], yy[end]),
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


// Transform spaghetti shapes into topological arcs
// ArcEngine has one method: #buildTopology()
//
function ArcEngine(xx, yy, pathData) {
  var pointCount = xx.length,
      xyToUint = MapShaper.getPointToUintHash(MapShaper.calcXYBounds(xx, yy)),
      index = new ArcIndex(pointCount * 0.2, xyToUint);

  var paths = [],
      sharedArcs = [];

  var partIds = initPathIds(pointCount, pathData);

  T.start();
  var chainIds = MapShaper.initPointChains(xx, yy, partIds, xyToUint);
  T.stop("Find matching vertices");

  if (!(pointCount > 0 && yy.length == pointCount && partIds.length == pointCount && chainIds.length == pointCount)) error("Mismatched array lengths");

  function nextPoint(id) {
    var partId = partIds[id];
    if (partIds[id+1] !== partId) {
      return id - pathData[partId].size + 2;
    }
    return id + 1;
  }

  function prevPoint(id) {
    var partId = partIds[id];
    if (partIds[id - 1] !== partId) {
      return id + pathData[partId].size - 2;
    }
    return id - 1;
  }

  // Test whether point is unique
  // Endpoints of polygon rings are counted as unique
  //
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


  //
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

  // TODO: extend for polylines
  function procPath(startId, pathId, pathObj) {
    var arcIds = [],
        pathLen = pathObj.size,
        endId = startId + pathLen - 1,
        prevId, nextId;
    var inArc = false,
        firstNodeId = -1,
        firstArcId,
        sharedId;

    if (pathObj.isNull) return;

    // don't reach endpoint
    for (var i = startId; i < endId; i++) {
      prevId = i == startId ? endId - 1 : i - 1;
      nextId = i + 1; // can't overrun path

      if (pointIsNode(i, prevId, nextId)) {
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
      sharedId = findSharedPoint(startId);
      // Not in an arc, i.e. no nodes have been found...
      // Path is either an island or a pair of matching paths
      if (sharedId >= 0) {
        // island-in-hole or hole-around-island pair
        var pairedPathId = partIds[sharedId];
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

    if (pointIsSingleton(id)) return false;

    sharedId = findSharedPoint(id);
    if (sharedId < 0) {
      return true;
    }

    sharedNext = nextPoint(sharedId);
    sharedPrev = prevPoint(sharedId);

    if (xarr[sharedNext] != xarr[prev] || xarr[sharedPrev] != xarr[next] ||
      yarr[sharedNext] != yarr[prev] || yarr[sharedPrev] != yarr[next]) {
      return true;
    }

    /*
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
    Utils.forEach(pathData, function(pathObj, pathId) {
      procPath(pointId, pathId, pathObj);
      pointId += pathObj.size;
    });
    T.stop("Find topological boundaries")

    return {
      paths: paths,
      arcs:index.getArcs(),
      sharedArcFlags: new Uint8Array(sharedArcs) // convert to typed array to reduce objects in memory.
    };
  };
}


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

// Calculate minPointCount for each arc,
// to protect largest ring of each polygon feature from collapsing
//
function calcMinPointCounts(paths, pathData, arcs, sharedArcFlags) {
  var arcMinPointCounts = new Uint8Array(arcs.length);
  Utils.forEach(paths, function(path, pathId) {
    var pathLen = path.length,
        arcId;
    // if a part has 3 or more arcs, assume it won't collapse...
    // TODO: look into edge cases where this isn't true

    if (pathLen <= 2 && pathData[pathId].isPrimary) {
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
  return arcMinPointCounts;
}

function groupPathsByShape(paths, pathData) {
  // Group topological shape-parts by shape
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