/* @requires shapefile-import, arrayutils, mapshaper-common */

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
  assert(obj.xx && obj.yy && obj.partIds && obj.shapeIds, "[buildArcTopology()] Missing required param/s");

  var xx = obj.xx, 
      yy = obj.yy,
      partIds = obj.partIds,
      shapeIds = obj.shapeIds,
      pointCount = xx.length,
      partCount = partIds[pointCount-1] + 1,
      shapeCount = shapeIds[shapeIds.length - 1] + 1,
      maxPartFlags = obj.maxPartFlags || null;

  assert(pointCount > 0 && yy.length == pointCount && partIds.length == pointCount, "Mismatched array lengths");
  assert(shapeIds.length == partCount, "[buildArcTopology()] Size mismatch; shapeIds array should match partCount");

  var bbox = MapShaper.calcXYBounds(xx, yy);

  // Create chains of vertices that hash to the same place.
  // (some points in a chain will have identical coords, others represent a hash collision)
  //
  T.start();
  var chainedIds = MapShaper.buildHashChains(xx, yy, partIds, bbox);
  T.stop("Vertex hashing");


  // Loop through all the points in the dataset, identifying arcs.
  //  
  T.start();  
  var arcTable = new ArcTable(xx, yy, bbox),
      inArc = false;

  for (var i=0; i < pointCount; i++) {
    if (pointIsArcEndpoint(i)) {

      // If we're in an arc, then end it.
      if (inArc) {
        if (partIds[i] !== partIds[i-1]) error("Encountered a new ring while building an arc; i:", i, "partId:", partId);
        arcTable.finishArc(i);
      }

      // Start a new arc, if this node is the first point of a new arc.
      // (returns true if node at i starts a new arc)
      inArc = arcTable.newArc(i);
    }
  }
  T.stop("Identifying shared segments.");

  return arcTable.exportData();

  function sameXY(id1, id2) {
    return xx[id1] === xx[id2] && yy[id1] === yy[id2];
  }

  // Tests whether a point is a node (i.e. the endpoint of an arc).
  //
  function pointIsArcEndpoint(id) {
    var isNode = false,
        x = xx[id],
        y = yy[id],    
        partId = partIds[id],
        isPartEndpoint = partId !== partIds[id-1] || partId !== partIds[id+1];
    // trace("partIsArcEndpoint()", id, "x, y:", x, y);

    if (isPartEndpoint) {
      // case -- if point is endpoint of a non-topological ring, then point is a node.
      // TODO: some nodes formed with this rule might be removed if arcs on either side
      //   of the node belong to the same shared boundary.
      //
      isNode = true;
    }
    else {
      // Count number of points with the same (x, y) coords as this point.
      //
      var matchCount = 0,
          nextId = chainedIds[id],
          nextX, nextY,
          matchId, matchPartId;

      while (nextId != id) {
        nextX = xx[nextId];
        nextY = yy[nextId];
        if (nextX == x && nextY == y) {
          matchCount++;
          if (matchCount == 1) {
            // If this point matches only one other point, we'll need the id of 
            //   the matching point.
            matchId = nextId;
          }
        }
        nextId = chainedIds[nextId];
      }

      if (matchCount > 1) {
        // case -- if point matches several other points, then point is a node.
        isNode = true;
      }
      else if (matchCount == 1) {
        // case -- point matches exactly one other point in the dataset
        // TODO: test with edge cases: several identical points clustered together,
        //   case where matching point is on the same ring, etc.
        //         
        // if matching point is an endpoint, then curr point is (also) a node.
        var matchIsPartEndpoint = partIds[matchId] !== partIds[matchId + 1] || partIds[matchId] !== partIds[matchId - 1];
        if (matchIsPartEndpoint) {
          isNode = true;
        }
        // if prev and next points don't match next and prev points on other ring, then point is a node
        else if (!sameXY(id+1, matchId-1) || !sameXY(id-1, matchId+1)) {
          isNode = true;
        }
      }
    }
    return isNode;
  }

  //
  //
  function ArcTable(xx, yy, bb) {
    var numPoints = xx.length,
        hashTableSize = Math.round(numPoints * 0.2),
        hash = MapShaper.getXYHashFunction(bb, hashTableSize),
        hashTable = new Int32Array(hashTableSize),
        typedArrays = !!xx.subarray;

    var buildingArc = false,
        arcStartId = -1;

    Utils.initializeArray(hashTable, -1);
    assert(numPoints > 0 && numPoints == yy.length, "[ArcTable] invalid vertex data.");

    var arcs = [],
        chainIds = [],
        sharedArcs = [],
        parts = [],
        currPartId = -1;

    var maxPartSize,
      maxPartId;

    // End the current arc
    // Receives id of end point
    //
    this.finishArc = function(endId) {
      if (buildingArc == false || arcStartId >= endId || arcStartId < 0) error("[ArcTable.finishArc()] invalid arc index.");

      // Creating subarrays on xx and yy creates many fewer objects for memory
      //   management to track than creating new x and y Array objects for each arc.
      //   With 846MB ZCTA file, gc() time reduced from 580ms to 65ms,
      //   topology time from >26s to ~17s, subsequent processing much faster.
      //   Negligible improvement on smaller files.
      //
      var xarr, yarr, lim = endId + 1;
          if (typedArrays) {
            xarr = xx.subarray(arcStartId, lim),
            yarr = yy.subarray(arcStartId, lim);
          } else {
            xarr = xx.slice(arcStartId, lim),
            yarr = yy.slice(arcStartId, lim);
          }
          
      var arc = [xarr, yarr];

      // Hash the last point in the arc, so this new arc can be found when we
      //   encounter the first point of a matching line-string.
      var x = xx[endId],
          y = yy[endId],
          key = hash(x, y),
          chainId = hashTable[key],
          arcId = arcs.length;

      hashTable[key] = arcId;

      // arc.chainedId = chainedId;
      // pushing chained id onto array instead of 
      // adding as property of arc Array
      chainIds.push(chainId);
      arcs.push(arc);
      buildingArc = false;
      arcStartId = -1;
    };

    // Tests whether the sequence of points starting with point @id matches
    //   the reverse-ordered coordinates of an arc.
    //
    function checkMatch(id, arc) {
      var xarr = arc[0], yarr = arc[1];
      for (var arcId = xarr.length - 1; arcId >= 0; arcId--, id++) {
        if (xarr[arcId] !== xx[id] || yarr[arcId] !== yy[id]) {
          return false;
        }
      }
      return true;
    }
  

    // Try to start a new arc starting with point at @startId.
    // Returns true if a new arc was started.
    // Returns false if the arc matches a previously identified arc or if
    //   the point otherwise does not begin a new arc.
    //
    // @startId Index of an arc endpoint.
    //
    this.newArc = function(startId) {
      if (buildingArc || arcStartId != -1) error("[ArcTable.newArc()] Tried to create a new arc while extending previous arc.");

      var partId = partIds[startId];
      if (partId !== partIds[startId + 1]) {
        // case -- point is the last point in a ring -- no arc
        return false;
      }

      var x = xx[startId],
          y = yy[startId],
          key = hash(x, y),
          chainedArcId = hashTable[key],
          matchId = -1,
          arcId = arcs.length; // anticipating a new arc

      // Check to see if this point is the first point in an arc that matches a 
      //   previously found arc.
      while (chainedArcId != -1) {
        var chainedArc = arcs[chainedArcId];
        if (checkMatch(startId, chainedArc)) {
          matchId = chainedArcId;
          arcId = -1 - chainedArcId;
          break;
        }
        //chainedArcId = prevArc.chainedId;
        chainedArcId = chainIds[chainedArcId];
        // if (chainedArcId == null) error("Arc is missing valid chain id")
      }

      // Add arc id to a topological part
      //
      if (partId !== currPartId) {
        parts[partId] = [arcId];
        currPartId = partId;
      }
      else {
        parts[partId].push(arcId);
      }

      // Start a new arc if we didn't find a matching arc in reversed sequence.
      //
      if (arcId >= 0) {
        buildingArc = true;
        arcStartId = startId;
        sharedArcs[arcId] = 0;
        return true;
      } 
      sharedArcs[matchId] = 1;
      return false;
    };

    // Returns topological data for the entire dataset.
    //
    this.exportData = function() {

      // export shared-arc flags
      if (sharedArcs.length !== arcs.length) error("Shared arc array doesn't match arc count");
      var sharedArcFlags = new Uint8Array(sharedArcs); // convert to typed array to reduce memory mgmt overhead.

      // export retained point data for preventing null shapes
      //
      var arcMinPointCounts = null;
      if (!!maxPartFlags) {
        var arcMinPointCounts = new Uint8Array(arcs.length);
        Utils.forEach(parts, function(part, partId) {
          // calculate minPointCount for each arc
          // (to protect largest part of each shape from collapsing)
          var partLen = part.length;

          // if a part has 3 or more arcs, assume it won't collapse...
          // TODO: look into edge cases where this isn't true

          if (maxPartFlags[partId] == 1 && partLen <= 2) { 
            for (var i=0; i<partLen; i++) {
              var arcId = part[i];
              if (arcId < 1) arcId = -1 - arcId;
              if (partLen == 1) { // one-arc polygon (e.g. island) -- save two interior points
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

      // Group topological shape-parts by shape
      var shapes = [];
      Utils.forEach(parts, function(part, partId) {
        var shapeId = shapeIds[partId];
        if (shapeId >= shapes.length) {
          shapes[shapeId] = [part]; // first part in a new shape
        } else {
          shapes[shapeId].push(part);
        }
      });

      return {shapes: shapes, arcs:arcs, arcMinPointCounts: arcMinPointCounts, sharedArcFlags: sharedArcFlags};
    };

  }
};


// Generates a hash function to convert an x,y coordinate into an index in a 
//   hash table.
// @bbox A BoundingBox giving the extent of the dataset.
//
MapShaper.getXYHashFunction = function(bbox, hashTableSize) {
  hashTableSize |= 0;
  if (!bbox.hasBounds() || hashTableSize <= 0) error("Invalid hash function parameters; bbox:", bb, "table size:", hashTableSize);
  var mask = (1 << 29) - 1,
      // transform coords to integer range and scramble bits a bit
      kx = (1e8 * Math.E / bbox.width()),
      ky = (1e8 * Math.PI / bbox.height()),
      bx = bbox.left,
      by = bbox.bottom;

  return function(x, y) {
    // scramble bits some more
    var key = x * kx + bx;
    key ^= y * ky + by;
    // key ^= Math.PI * 1e9;
    key &= 0x7fffffff; // mask as positive integer
    key %= hashTableSize; // TODO: test if power-of-2 table size is faster...
    return key;
  };
};


//
//
MapShaper.buildHashChains = function(xx, yy, partIds, bbox) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.6);
  // hash table larger than ~1.5 * point count doesn't improve performance much.

  // Hash table for coordinates; contains the id of the first point in each chain, indexed by hash key
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  // Function to convert x, y coordinates to indexes in hash table.
  var hash = MapShaper.getXYHashFunction(bbox, hashTableSize);

  // Ids of next point in each chain, indexed by point id
  var nextIds = new Int32Array(pointCount);
  // Utils.initializeArray(nextIds, -1);
 
  var key, headId, tailId;

  for (var i=0; i<pointCount; i++) {
    key = hash(xx[i], yy[i]);
    headId = hashChainIds[key];
    // case -- first coordinate in chain: start new chain, point to self
    if (headId == -1) {
      hashChainIds[key] = i;
      nextIds[i] = i;
    }
    // case -- adding to a chain: place new coordinate at end of chain, point it to head of chain to create cycle
    else {
      tailId = headId;
      while (nextIds[tailId] != headId) {
        tailId = nextIds[tailId];
      }
      nextIds[i] = headId;
      nextIds[tailId] = i;
    }
  }
  return nextIds;
};
