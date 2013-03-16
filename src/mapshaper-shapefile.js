/* @requires shapefile-import, mapshaper-common */

// Reads Shapefile data from an ArrayBuffer or Buffer
// Converts to format used for identifying topology.
//
MapShaper.importShp = function(src) {
  var reader = new ShapefileReader(src);
  reader.read = readShpRecords;
  return reader.read();
};


// This replaces the default ShapefileReader.read() function.
// Data is stored in a format used by MapShaper for calculating topology
//
function readShpRecords() {

  var supportedTypes = {
    5: "polygon",
    3: "polyline"
  };

  var shpType = this.header.type;
  if (shpType in supportedTypes == false) {
    stop("Only polygon and polyline (type 5 and 3) Shapefiles are supported.");
  }

  var expectRings = shpType == 5;

  var bin = this._bin,
      shapes = [],
      pointCount = 0,
      partCount = 0,
      shapeCount = 0;

  var findHoles = expectRings,
      findMaxParts = expectRings;

  bin.position(100); // skip to the shape data section

  // FIRST PASS
  // get metadata about each shape and get total point count in file
  // (need total point count to instantiate typed arrays)
  //
  while(bin.bytesLeft() > 0) {
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
  //

  // Using typed arrays wherever for performance
  // 
  var xx = new Float64Array(pointCount);
      yy = new Float64Array(pointCount),
      partIds = new Uint32Array(pointCount),   
      shapeIds = [];

  if (findMaxParts) {
    var maxPartFlags = new Uint8Array(partCount);
  }
  if (findHoles) {
    var holeFlags = new Uint8Array(partCount);
  }

  var x, y,
    pointId = 0, 
    partId = 0,
    shapeId = 0,
    holeCount = 0,
    buf, //  = bin.buffer(),
    signedPartArea, partArea, maxPartId, maxPartArea;

  for (var shpId=0; shpId < shapes.length; shpId++) {
    var shp = shapes[shpId];
    var partsInShape = shp.partCount;
    var offs = 0;
    //var coords = new Float64Array(bin._buffer.slice(shp.coordOffset, shp.coordOffset + shp.pointCount * 32));
    //bin.position(shp.coordOffset + shp.pointCount * 32);
    bin.position(shp.coordOffset);
    var coords = bin.readFloat64Array(shp.pointCount * 2);
    for (var i=0; i<partsInShape; i++) {
      shapeIds.push(shapeId);
      var partSize = shp.partSizes[i];

      for (var j=0; j<partSize; j++) {
        xx[pointId] = coords[offs++];
        yy[pointId] = coords[offs++];
        partIds[pointId] = partId;
        pointId++;       
      }

      if (expectRings) {
        signedPartArea = msSignedRingArea(xx, yy, pointId - partSize, partSize);

        if (findMaxParts) {
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

        if (findHoles) {
          if (signedPartArea == 0) error("A ring in shape", shapeId, "has zero area or is not closed");
          if (signedPartArea < 0) {
            if (partsInShape == 1) {
              error("Shape", shapeId, "only contains a hole");
            }
            holeFlags[partId] = signedPartArea < 0 ? 1 : 0;
            holeCount++;
          }
        }        
      }

      partId++;
    }
    shapeId++;
  }

  var info = {
    input_point_count: pointCount,
    input_part_count: partId,
    input_shape_count: shapeId,
    input_geometry_type: expectRings ? "polygon" : "polyline",
    shapefile_header: this.header
  }
  //this.header.pointCount = pointCount;
  return {
    xx: xx,
    yy: yy,
    partIds: partIds,
    shapeIds: shapeIds,
    maxPartFlags: maxPartFlags || null,
    holeFlags: holeFlags || null,
    info: info
  };
}


// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(arcs, shapes, shpType) {
  if (!Utils.isArray(arcs) || !Utils.isArray(shapes)) error("Missing exportable data.");
  T.start();
  var fileBytes = 100;
  var bounds = new BoundingBox();
  var shapeBuffers = Utils.map(shapes, function(shape, i) {
    var shpObj = MapShaper.exportShpRecord(shape, arcs, i+1, shpType);
    fileBytes += shpObj.buffer.byteLength;
    shpObj.bounds && bounds.mergeBounds(shpObj.bounds);
    return shpObj.buffer;
  });
  T.stop("export shape records");

  T.start();

  // write .shp header section
  var shpBin = new BinArray(fileBytes, false)
    .writeInt32(9994)
    .skipBytes(5 * 4)
    .writeInt32(fileBytes / 2)
    .littleEndian()
    .writeInt32(1000)
    .writeInt32(shpType)
    .writeFloat64(bounds.left)
    .writeFloat64(bounds.bottom)
    .writeFloat64(bounds.right)
    .writeFloat64(bounds.top)
    .skipBytes(4 * 8); // skip Z & M type bounding boxes;

  // write .shx header
  var shxBytes = 100 + shapeBuffers.length * 8;
  var shxBin = new BinArray(shxBytes, false)
    .writeBuffer(shpBin.buffer(), 100) // copy .shp header to .shx
    .position(24)
    .bigEndian()
    .writeInt32(shxBytes/2)
    .littleEndian()
    .position(100);

  // write record sections of .shp and .shx
  Utils.forEach(shapeBuffers, function(buf) {
    shxBin.writeInt32(shpBin.position() / 2)
    shxBin.writeInt32((buf.byteLength - 8) / 2); // content length
    // alternative: shxBin.writeBuffer(buf, 4, 4);
    shpBin.writeBuffer(buf);
  });
  T.stop("convert to binary");
  var shxBuf = shxBin.buffer(),
      shpBuf = shpBin.buffer();
  return {shp: shpBuf, shx: shxBuf};
};


// Returns an ArrayBuffer containing a Shapefile record for one shape
//   and the bounding box of the shape.
//
MapShaper.exportShpRecord = function(shape, arcs, id, shpType) {
  var bounds = null,
      bin;
  if (!shape || shape.length == 0) {
    bin = new BinArray(12, false)
      .writeInt32(id)
      .writeInt32(2)
      .littleEndian()
      .writeInt32(0);
  }
  else {
    var data = MapShaper.convertTopoShape(shape, arcs),
        bounds = data.bounds,
        partsIdx = 52,
        pointsIdx = partsIdx + 4 * data.partCount,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    bin = new BinArray(recordBytes, false)
      .writeInt32(id)
      .writeInt32((recordBytes - 8) / 2)
      .littleEndian()
      .writeInt32(shpType)
      .writeFloat64(bounds.left)
      .writeFloat64(bounds.bottom)
      .writeFloat64(bounds.right)
      .writeFloat64(bounds.top)
      .writeInt32(data.partCount)
      .writeInt32(data.pointCount);

    Utils.forEach(data.parts, function(part, i) {
      bin.position(partsIdx + i * 4)
        .writeInt32(pointCount)
        .position(pointsIdx + pointCount * 16);
      var xx = part[0],
          yy = part[1];
      for (var j=0, len=xx.length; j<len; j++) {
        bin.writeFloat64(xx[j]);
        bin.writeFloat64(yy[j]);
      }
      pointCount += j;
    });
    if (data.pointCount != pointCount) error("Shp record point count mismatch; pointCount:"
        , pointCount, "data.pointCount:", data.pointCount);

  }
  return {bounds: bounds, buffer: bin.buffer()};
};

