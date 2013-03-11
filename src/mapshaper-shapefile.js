/* @requires shapefile-import */

/**
 * This replaces the default ShapefileReader.read() function.
 * Data is stored in a format used by MapShaper for topology building.
 */
ShapefileReader.prototype.read = function() {

  var supportedTypes = {
    5: "polygon",
    3: "polyline"
  };

  if (this.header.type in supportedTypes == false) {
    stop("Only polygon and polyline (type 5 and 3) Shapefiles are supported.");
  }

  var bin = this._bin,
      shapes = [],
      pointCount = 0,
      partCount = 0,
      shapeCount = 0;

  var rememberHoles = true,
      rememberMaxParts = true;

  bin.position(100); // skip to the shape data section

  // FIRST PASS
  // get metadata about each shape and get total point count in file
  // (need total point count to instantiate typed arrays)
  //
  while(this.hasNext()) {
    var meta = this.readShapeMetadata(bin, this.header);
    bin.skipBytes(meta.pointCount * 16);
    // TODO: update to support M and Z types

    shapes.push(meta);
    pointCount += meta.pointCount;
    partCount += meta.partCount;
    shapeCount++;
  }


  // SECOND PASS
  // Read coordinates and other data into buffers
  // TODO (?) Identify polygon holes...
  //

  // Typed arrays tested ~2x faster than new Array(pointCount) in node;
  // 
  var xx = new Float64Array(pointCount);
      yy = new Float64Array(pointCount),
      partIds = new Uint32Array(pointCount),   
      shapeIds = [];

  // Experimental: Adding arrays for part-level data: bounding boxes,
  //   ids of max part in each shape (for shape preservation)
  //
  if (rememberMaxParts) {
    var maxPartFlags = new Uint8Array(partCount);
  }
  if (rememberHoles) {
    var holeFlags = new Uint8Array(partCount);
  }

  var x, y,
    pointId = 0, 
    partId = 0,
    shapeId = 0,
    dataView = bin.dataView(),
    signedPartArea, partArea, maxPartId, maxPartArea;

  for (var shpId=0; shpId < shapes.length; shpId++) {
    var shp = shapes[shpId];
    var offs = shp.coordOffset;
    var partsInShape = shp.partCount;
    for (var i=0; i<partsInShape; i++) {
      shapeIds.push(shapeId);
      partSize = shp.partSizes[i];

      for (var j=0; j<partSize; j++) {
        // DataView at least as fast as Buffer API in nodejs
        x = dataView.getFloat64(offs, true);
        y = dataView.getFloat64(offs + 8, true);
        xx[pointId] = x;
        yy[pointId] = y;
        offs += 16;
        partIds[pointId] = partId;
        pointId++;       
      }

      signedPartArea = msSignedRingArea(xx, yy, pointId - partSize, partSize);

      if (rememberMaxParts) {
        partArea = Math.abs(signedPartArea);
        if (i === 0 || partArea > maxPartArea) {
          if (i > 0) {
            maxPartFlags[maxPartId] = 0;
          }
          maxPartFlags[partId] = 1;
          maxPartId = partId;
          maxPartArea = partArea;
        }
      }

      if (rememberHoles) {
        if (signedPartArea == 0) error("A ring in shape", shapeId, "has zero area or is not closed");
        if (signedPartArea == -1 && partsInShape == 1) error("Shape", shapeId, "only contains a hole");
        holeFlags[partId] = signedPartArea < 0 ? 1 : 0;
      }
      partId++;
    }
    shapeId++;
  }

  this.header.pointCount = pointCount;
  return {
    xx: xx,
    yy: yy,
    partIds: partIds,
    shapeIds: shapeIds,
    header: this.header,
    maxPartFlags: maxPartFlags || null,
    holeFlags: holeFlags || null
  };
};


// Reads Shapefile data from an ArrayBuffer or Buffer
// Converts to format used for identifying topology.
//
MapShaper.importShpFromBuffer = function(buf) {
  return new ShapefileReader(buf).read();
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(obj) {
  assert(Utils.isArray(obj.arcs) && Utils.isArray(obj.shapes), "Missing exportable data.");

  var fileBytes = 100;
  var bounds = new BoundingBox();
  var shapeBuffers = Utils.map(obj.shapes, function(shape, i) {
    var shpObj = MapShaper.exportShpRecord(shape, obj.arcs, i+1);
    fileBytes += shpObj.buffer.byteLength;
    shpObj.bounds && bounds.mergeBounds(shpObj.bounds);
    return shpObj.buffer;
  });

  var bufClass = Node.inNode ? Buffer : ArrayBuffer;
  var shpBin = new BinArray(new bufClass(fileBytes), false),
      shpBuf = shpBin.buffer(),
      shxBytes = 100 + shapeBuffers.length * 8
      shxBin = new BinArray(new bufClass(shxBytes), false),
      shxBuf = shxBin.buffer();

  // write .shp header section
  shpBin.writeInt32(9994);
  shpBin.clearBytes(5 * 4);
  shpBin.writeInt32(fileBytes / 2);
  shpBin.littleEndian = true;
  shpBin.writeInt32(1000);
  shpBin.writeInt32(Shapefile.POLYGON);
  shpBin.writeFloat64(bounds.left);
  shpBin.writeFloat64(bounds.bottom);
  shpBin.writeFloat64(bounds.right);
  shpBin.writeFloat64(bounds.top);
  // skip Z & M type bounding boxes;
  shpBin.clearBytes(4 * 8);

  // write .shx header
  shxBin.writeBuffer(shpBuf, 100); // copy .shp header to .shx
  shxBin.dataView().setInt32(24, shxBytes/2, false); // set .shx file size

  // write record sections of .shp and .shx
  Utils.forEach(shapeBuffers, function(buf) {
    shxBin.writeInt32(shpBin.position() / 2);
    //shxBin.writeBuffer(buf, 4, 4); // copy content length from shape record
    shxBin.writeInt32((buf.byteLength - 8) / 2); // copy content length from shape record
    shpBin.writeBuffer(buf);
  });

  return {shp: shpBuf, shx: shxBuf};
};

// Generate an ArrayBuffer containing a Shapefile record for one shape.
//
MapShaper.exportShpRecord = function(shape, arcs, id) {
  var bounds = null,
      buf, view;
  if (!shape || shape.length == 0) {
    buffer = new ArrayBuffer(12)
    view = new DataView(buffer);
    view.setInt32(0, id, false);
    view.setInt32(4, 2, false);
    view.setInt32(8, 0, true);
  } 
  else { // assume polygon record
    var data = MapShaper.convertTopoShape(shape, arcs),
        bounds = data.bounds,
        partsIdx = 5 * 4 + 4 * 8,
        pointsIdx = partsIdx + 4 * data.partCount,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    buffer = new ArrayBuffer(recordBytes);
    view = new DataView(buffer);
    view.setInt32(0, id, false);
    view.setInt32(4, (recordBytes - 8) / 2, false);
    view.setInt32(8, Shapefile.POLYGON, true);
    view.setFloat64(12, bounds.left, true);
    view.setFloat64(20, bounds.bottom, true);
    view.setFloat64(28, bounds.right, true);
    view.setFloat64(36, bounds.top, true);
    view.setInt32(44, data.partCount, true);
    view.setInt32(48, data.pointCount, true);

    Utils.forEach(data.parts, function(part, i) {
      view.setInt32(partsIdx + i * 4, pointCount, true);
      var xx = part[0], yy = part[1];
      for (var j=0, len=xx.length; j<len; j++, pointsIdx += 16) {
        view.setFloat64(pointsIdx, xx[j], true);
        view.setFloat64(pointsIdx + 8, yy[j], true);
      }
      pointCount += j;
    });

    assert(data.pointCount == pointCount, "Shp record point count mismatch; pointCount:", pointCount, "data.pointCount:", data.pointCount)
    assert(pointsIdx == recordBytes, "Shp record bytelen mismatch; pointsIdx:", pointsIdx, "recordBytes:", recordBytes, "pointCount:", pointCount)
  }
  return {bounds: bounds, buffer: buffer};
};

