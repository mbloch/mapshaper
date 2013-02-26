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
      shapeCount = shapeIds[shapeIds.length - 1] + 1;

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
        hashTableSize = Math.round(numPoints * 0.3),
        hash = MapShaper.getXYHashFunction(bb, hashTableSize),
        hashTable = new Int32Array(hashTableSize);

    var buildingArc = false,
        arcStartId = -1;

    Utils.initializeArray(hashTable, -1);
    assert(numPoints > 0 && numPoints == yy.length, "[ArcTable] invalid vertex data.");

    var arcs = [],
        parts = [],
        currPartId = -1;

    // End the current arc
    // Receives id of end point
    //
    this.finishArc = function(endId) {
      if (buildingArc == false || arcStartId >= endId || arcStartId < 0) error("[ArcTable.finishArc()] invalid arc index.");

      // Creating subarrays on xx and yy creates many fewer objects for memory
      //   management to track than if creating new x and y Arrays for each arc.
      //   With 835MB ZCTA file, gc() time reduced from 580ms to 65ms,
      //   topology time from >26s to ~17s, later processing much faster.
      //   Negligible improvement on smaller files.
      //
      var xarr = xx.subarray(arcStartId, endId + 1),
          yarr = yy.subarray(arcStartId, endId + 1);
      var arc = [xarr, yarr];

      // Hash the last point in the arc, so this new arc can be found when we
      //   encounter the first point of a matching line-string.
      var x = xx[endId],
          y = yy[endId],
          key = hash(x, y),
          arcId = arcs.length;
        if (hashTable[key] != -1) {
        arc.chainedId = hashTable[key];
      } 
      else {
        arc.chainedId = -1;
      }
      hashTable[key] = arcId;

      arcs.push(arc);
      buildingArc = false;
      arcStartId = -1;
    };

    // Tests whether the sequence of points starting with a given point id matches
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
  

    // Tries to start a new arc starting with point at @startId.
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
          newArcId = arcs.length;

      // Check to see if this point is the first point in an arc that matches a 
      //   previously found arc.
      while (chainedArcId != -1) {
        var prevArc = arcs[chainedArcId];
        if (checkMatch(startId, prevArc)) {
          newArcId = -1 - chainedArcId;
          break;
        }
        chainedArcId = prevArc.chainedId;
        // if (chainedArcId == null) error("Arc is missing valid chain id")
      }

      // Add arc id to a topological part
      //
      if (partId !== currPartId) {
        parts[partId] = [newArcId];
        currPartId = partId;
      }
      else {
        parts[partId].push(newArcId);
      }

      // Start a new arc if we didn't find a matching arc in reversed sequence.
      //
      if (newArcId >= 0) {
        buildingArc = true;
        arcStartId = startId;
        return true;
      } 
      
      return false;
    };

    // Returns topological data for the entire dataset.
    //
    this.exportData = function() {
      // Group topological shape-parts by shape
      var shapes = [];
      Utils.forEach(shapeIds, function(shapeId, partId) {
        var part = parts[partId];
        if (shapeId >= shapes.length) {
          shapes[shapeId] = [part];
        } 
        else {
          shapes[shapeId].push(part);
        }
      });

      return {shapes: shapes, arcs:arcs};
    };

  }
};


// Generates a hash function to convert an x,y coordinate into an index in a 
//   hash table.
// @param bb A BoundingBox object giving the extent of the dataset.
//
MapShaper.getXYHashFunction = function(bb, hashTableSize) {
  assert(bb.hasBounds() && hashTableSize > 0, "Invalid hash function parameters; bbox:", bb, "table size:", hashTableSize);
  var kx = hashTableSize * 171 / bb.width(),
      ky = hashTableSize * 30269 / bb.height(),
      bx = -bb.left,
      by = -bb.bottom;

  return function(x, y) {
    var key = (((x + bx) * kx + (y + by) * ky) % hashTableSize) | 0;
    return key;
  };
};


//
//
MapShaper.buildHashChains = function(xx, yy, partIds, bbox) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.5);
  // hash table larger than 1.5 * point count doesn't improve performance much.

  // Hash table for coordinates; contains the id of the first point in each chain, indexed by hash key
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  // Function to convert x, y coordinates to indexes in hash table.
  var hash = MapShaper.getXYHashFunction(bbox, hashTableSize);

  // Ids of next point in each chain, indexed by point id
  var nextIds = new Int32Array(pointCount);  // id of next id in chain
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
