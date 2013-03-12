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
    buf = bin.buffer(),
    signedPartArea, partArea, maxPartId, maxPartArea;

  for (var shpId=0; shpId < shapes.length; shpId++) {
    var shp = shapes[shpId];
    var partsInShape = shp.partCount;
    var offs = 0;
    var coords = new Float64Array(buf.slice(shp.coordOffset, shp.coordOffset + shp.pointCount * 32));

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
            if (partsInShape == 1) error("Shape", shapeId, "only contains a hole");
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
};


// Reads Shapefile data from an ArrayBuffer or Buffer
// Converts to format used for identifying topology.
//
MapShaper.importShpFromBuffer = function(buf) {
  return new ShapefileReader(buf).read();
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(arcs, shapes, shpType) {
  if (!Utils.isArray(arcs) || !Utils.isArray(shapes)) error("Missing exportable data.");

  var fileBytes = 100;
  var bounds = new BoundingBox();
  var shapeBuffers = Utils.map(shapes, function(shape, i) {
    var shpObj = MapShaper.exportShpRecord(shape, arcs, i+1, shpType);
    fileBytes += shpObj.buffer.byteLength;
    shpObj.bounds && bounds.mergeBounds(shpObj.bounds);
    return shpObj.buffer;
  });

  var shpBin = new BinArray(new ArrayBuffer(fileBytes), false),
      shxBytes = 100 + shapeBuffers.length * 8
      shxBin = new BinArray(new ArrayBuffer(shxBytes), false);

  // write .shp header section
  shpBin.writeInt32(9994);
  shpBin.skipBytes(5 * 4);
  shpBin.writeInt32(fileBytes / 2);
  shpBin.littleEndian = true;
  shpBin.writeInt32(1000);
  shpBin.writeInt32(shpType);
  shpBin.writeFloat64(bounds.left);
  shpBin.writeFloat64(bounds.bottom);
  shpBin.writeFloat64(bounds.right);
  shpBin.writeFloat64(bounds.top);
  // skip Z & M type bounding boxes;
  shpBin.skipBytes(4 * 8);

  // write .shx header
  shxBin.writeBuffer(shpBin.buffer(), 100); // copy .shp header to .shx
  shxBin.dataView().setInt32(24, shxBytes/2, false); // set .shx file size

  // write record sections of .shp and .shx
  Utils.forEach(shapeBuffers, function(buf) {
    shxBin.writeInt32(shpBin.position() / 2);
    //shxBin.writeBuffer(buf, 4, 4); // copy content length from shape record
    shxBin.writeInt32((buf.byteLength - 8) / 2); // copy content length from shape record
    shpBin.writeBuffer(buf);
  });

  var shxBuf = shxBin.toNodeBuffer(),
      shpBuf = shpBin.toNodeBuffer();
  return {shp: shpBuf, shx: shxBuf};
};

// Generate an ArrayBuffer containing a Shapefile record for one shape.
//
MapShaper.exportShpRecord = function(shape, arcs, id, shpType) {
  var bounds = null,
      buffer, view;
  if (!shape || shape.length == 0) {
    buffer = new ArrayBuffer(12)
    view = new DataView(buffer);
    view.setInt32(0, id, false);
    view.setInt32(4, 2, false);
    view.setInt32(8, 0, true);
  }
  else {
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
    view.setInt32(8, shpType, true);
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
        // TODO: consider getting a Float64Array view of just the points...
        view.setFloat64(pointsIdx, xx[j], true);
        view.setFloat64(pointsIdx + 8, yy[j], true);
      }
      pointCount += j;
    });

    if (data.pointCount != pointCount) error("Shp record point count mismatch; pointCount:", pointCount, "data.pointCount:", data.pointCount)
    if (pointsIdx != recordBytes) error("Shp record bytelen mismatch; pointsIdx:", pointsIdx, "recordBytes:", recordBytes, "pointCount:", pointCount)
  }
  return {bounds: bounds, buffer: buffer};
};

