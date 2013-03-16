/* @requires shapes, arrayutils */


/**
 *
 */
function TopologyIndex(xx, yy, zz, scale) {

  // Arrays of arc metadata (array index == arcId)
  // (Should involve less overhead than separate object for each arc)
  this._vectorIds = [];
  this._shapeIds = [];
  this._reversed = [];
  this._nextArcIds = [];
  this._neighborArcIds = [];
  this._ringIds = [];

  this.arcCount = 0;
  this.shapeCount = 0;

  var reversedIndex = {}; // maps vectorId to arcIds of reversed arcs

  this.addArc = function(vectorId, ringId, reversed) {
    var currArcId  = this.arcCount ++;

    if (reversed) {
      reversedIndex[vectorId] = currArcId;
    }
    this._reversed.push(reversed);
    this._vectorIds.push(vectorId);
    this._ringIds.push(ringId);
  };

  this.getMergedVertexSet = function(arcIds) {

    var vec = new MshpVertexSet(scale);
    for (var i=0, len=arcIds.length; i<len; i++) {
      var arcId = arcIds[i];
      var vectorId = this._vectorIds[arcId];
      var reversed = this._reversed[arcId];
      vec.extend(xx[vectorId], yy[vectorId], zz[vectorId], reversed);
    }

    vec.calcBounds();
    return vec;
  };

  /**
   * Receive: index matching ring ids to shape ids
   */
  this.buildTopology = function(index, numShapes) {

    if (!numShapes) {
      trace("[TopoIndex.buildTopology()] missing a valid shape count.");
    }
    this.shapeCount = numShapes || 0;

    var nextRingId, currRingId, nextArcId, 
      prevRingId = -1,
      firstArcId = -1;

    for (var arcId=0, maxArcId=this.arcCount - 1; arcId <= maxArcId; arcId++ ) {

      // Cross-reference vectors that are shared between two shapes
      //

      var reversed = this._reversed[arcId];
      var vectorId = this._vectorIds[arcId];
      if (!reversed) {
        var neighborArcId = reversedIndex[vectorId];
        if (neighborArcId != null) {
          this._neighborArcIds[arcId] = neighborArcId;
          this._neighborArcIds[neighborArcId] = arcId;
        }
      }

      // For each arc, add the id of the next arc in its ring
      //

      var currRingId = this._ringIds[arcId];
      // !!! Assume that arcs have been added in sequence
      nextRingId = arcId == maxArcId ? currRingId : this._ringIds[arcId + 1];

      // Remember the id of the first arc in each ring,
      //   so we can complete the loop when we reach the last arc in the ring.
      if (prevRingId != currRingId) {
        firstArcId = arcId;
      }
      
      // Calculate the id of the next arc in the ring
      //
      if (nextRingId == currRingId) {
        nextArcId = arcId + 1;  // Case: next arc is in the same ring
      }
      else if (firstArcId == arcId) {
        nextArcId = -1;         // Case: one arc in the ring -> no next arc
      }
      else {
        nextArcId = firstArcId; // Case: last arc in the ring -> loop back to first arc
      }

      this._nextArcIds[arcId] = nextArcId;
      prevRingId = currRingId;

      // Add the shape id of the current arc
      //
      var shapeId = index[currRingId];
      this._shapeIds[arcId] = shapeId;

      //trace("arc:", arcId, "ring:", currRingId, "shape:", shapeId, "vector:", vectorId, "reversed?", reversed);
      //trace( "  ... nextArcRing:", nextRingId, "v2:", nextArcRingId2);
      //trace("ring:", currRingId, ">> shape:", shapeId);
      if (shapeId === undefined) {
        trace("[TopologyIndex.addRingIndex()] Undefined shape index for ring:", currRingId, "and arc:", arcId);
      }

    }

    // delete temporary objects
    this._ringIds = null;
    reversedIndex = null;  
  };
}




TopologyIndex.prototype.mergeShapes = function(shapeIds) {
  var shapeIndex = Utils.arrayToIndex(shapeIds);

  // trace("[mergeShapes()]:", shapeIds);
  // trace("   ... index:", shapeIndex);

  // get array of arc ids for the selected shapes
  //
  var arcIds = [];
  for (var i=0, len = this.arcCount; i<len; i++) {
    var shapeId = this._shapeIds[i];
    if (shapeId in shapeIndex) {
      arcIds.push(i);
    }
  }

  // trace("   ... arcIds:", arcIds);
  var numArcs = arcIds.length;

  // init index of visited arcs
  //
  var visitedIndex = {}; //  = Utils.createArray(numArcs, false);

  /**
   * Get the id of an arc to use as the beginning of a new merged shape.
   *
   */
  this.getAnotherArcId = function() {
    for (var i=0; i<numArcs; i++) {
      var arcId = arcIds[i];
      if (!visitedIndex[arcId]) {
        if (this.arcIsDissolved(arcId)) {
          visitedIndex[arcId] = true;
        }
        else {
          // found an arc that hasn't been visited 
          // and is not shared by two merged shapes.
          return arcId;
        }
      }
    }

    // no eligible arcs are left: done merging!
    return -1;
  };

  /**
   *  Get id of the next arc in the merged shape.
   */
  this.getNextArcId = function(firstArcId) {
    var nextArcId, 
      arcId = firstArcId;

    while (arcId != -1 && arcId != null) {
      if (visitedIndex[arcId]) {
        // Topology error: traversing to an arc that has already been visited.
        return -1;
      }

      visitedIndex[arcId] = true;

      nextArcId = this._nextArcIds[arcId];
      if (nextArcId == firstArcId) {
        return -1;
      }
      else if (nextArcId == -1 || nextArcId == null) {
        return -1;
      }

      // sanity check... next arc is in the
      // (TODO: remove this)
      var shapeId = this._shapeIds[arcId];
      var nextShapeId = this._shapeIds[nextArcId];
      if (shapeId != nextShapeId) {
        trace("*** [getNextArcId()] *** ran onto another shape; internal topology error.");
        trace("  * currShape:", shapeId, "nextShape:", nextShapeId);
        return -1;
      }      

      if (this.arcIsDissolved(nextArcId)) {
        // If we encounter an arc that is shared between merged shapes, jump onto 
        //    the adjacent shape.
        arcId = this._neighborArcIds[nextArcId];;
      }
      else {
        // Found the next arc in the merged shape.
        return nextArcId;
      }
    }

    // 
    return -1;
  }

  this.arcIsDissolved = function(arcId) {
    //trace("[arcIsDissolved()] this:", this);
    var neighborId = this._neighborArcIds[arcId];
    if (neighborId != null) {
      var neighborShapeId = this._shapeIds[neighborId];
      if (neighborShapeId in shapeIndex) {
        return true;
      }
    }
    return false;
  }

  // traverse / build
  //
  var shp = null;
  var startingArcId = this.getAnotherArcId();
  while (startingArcId != -1) {

    if (startingArcId == null) {
      trace("[] !!!! startingArcId is null; breaking");
      break;
    }

    //trace("[TopologyIndex.mergeShapes()] firstArc:", startingArcId, "shape:", this._shapeIds[startingArcId]);

    var mergedIds = [startingArcId];
    var nextArcId = this.getNextArcId(startingArcId);
    while (nextArcId != -1 && nextArcId != startingArcId) {
      // trace( "    ... arc:", nextArcId, "shape:", this._shapeIds[nextArcId]);
      mergedIds.push(nextArcId);
      nextArcId = this.getNextArcId(nextArcId);
    }

    //trace("mergedIds:", mergedIds)
    var vec = this.getMergedVertexSet(mergedIds);

    if (!shp) {
      shp = new ShapeVector(0, vec);
    }
    else {
      shp.addPartData(vec);
    }

    startingArcId = this.getAnotherArcId();
  }

  return shp;
};
