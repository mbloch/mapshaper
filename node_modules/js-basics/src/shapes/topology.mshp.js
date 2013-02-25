/* @requires shapes.mshp, core, data */


function MshpTopology(mshpStr) {
  
  MshpParser.prototype.parseTopologyData = MshpTopology.prototype.parseTopologyData;
  var mshpParser = new MshpParser(mshpStr);

}

/**
 * Build: table of arcs
 */
MshpTopology.prototype.parseTopologyData = function(bytes, extractPolygons, buildTopoIndex) {

  var shapeRings = [];
  var newRing;
  var topoIndex = [];

  var numRingArcs = bytes.readUnsignedInt();
  var ringCount = 0;

  var bounds = new BoundingBox();

  for (var j = 0; j < numRingArcs; j++) {
    var code = bytes.readByte();
    if (code == 1) {
      ringCount++;
    }
    var ringId = ringCount - 1;
    var arcId = bytes.readUnsignedShort();
    var reverseFlag = bytes.readByte() === 0;

    if (buildTopoIndex && reverseFlag === true) {
      topoIndex[arcId] = true;
    }

    if (extractPolygons) {
      newRing = shapeRings[ringId];

      if (!newRing) { // new ring...
        newRing = new MshpVertexSet(this._vectorScale);
        shapeRings[ringId] = newRing;
      }
   
      newRing.addPart(this._xx[arcId], this._yy[arcId], this._zz[arcId], reverseFlag);
    }
  }

  if (buildTopoIndex) {
    this._sharedArcIndex = topoIndex;
  }

  if (!extractPolygons) {
    return null;
  }

  // Got rings
  // Next, get record:part associations
  //
  var numParts = bytes.readUnsignedInt();
  var shapeCount = 0;
  var shapeVectors = [];

  for (var i = 0; i < numParts; i++) {
    var haveShape = false;
    do {
      var code = bytes.readByte();
      var partId = bytes.readUnsignedShort();
      bytes.readByte();

      if (code == 1) {
        shapeCount++;
      }
      var shapeId = shapeCount - 1; // shape id starts at 1;

      // null shape indicator : VERIFY & CHANGE THIS (remove magic number)
      if (partId == 65535) {
        trace("[MshpParser.parseTopologyData()] Found null shape; part id:", i);
        //shapeVectors[shapeId] = null;
        shapeVectors[shapeId] = new ShapeVector(i); // using empty vector as a placeholder instead of null
      }
      else {
        haveShape = true;
      }

    } while (!haveShape);

    var newRing = shapeRings[partId];
    if (!newRing) {
      trace('@@@ Missing ring:', partId,
        'in MshpParser.unpackShapes(). skipping');
      continue;
    }
    newRing.calcBounds();

    var shape = shapeVectors[shapeId];

    if (!shape) {
      shape = new ShapeVector(shapeId, newRing);
      shapeVectors[shapeId] = shape;
    }
    else {
      shape.addPartData(newRing);
    }
  }

  return shapeVectors;
};
