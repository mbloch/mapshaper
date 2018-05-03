/* @requires shp-record, mapshaper-file-reader */

// Read data from a .shp file
// @src is an ArrayBuffer, Node.js Buffer or filename
//
//    // Example: iterating using #nextShape()
//    var reader = new ShpReader(buf), s;
//    while (s = reader.nextShape()) {
//      // process the raw coordinate data yourself...
//      var coords = s.readCoords(); // [[x,y,x,y,...], ...] Array of parts
//      var zdata = s.readZ();  // [z,z,...]
//      var mdata = s.readM();  // [m,m,...] or null
//      // .. or read the shape into nested arrays
//      var data = s.read();
//    }
//
//    // Example: reading records using a callback
//    var reader = new ShpReader(buf);
//    reader.forEachShape(function(s) {
//      var data = s.read();
//    });
//
function ShpReader(shpSrc, shxSrc) {
  if (this instanceof ShpReader === false) {
    return new ShpReader(shpSrc, shxSrc);
  }

  var shpFile = utils.isString(shpSrc) ? new FileReader(shpSrc) : new BufferReader(shpSrc);
  var header = parseHeader(shpFile.readToBinArray(0, 100));
  var shpSize = shpFile.size();
  var RecordClass = new ShpRecordClass(header.type);
  var shpOffset, recordCount, skippedBytes;
  var shxBin, shxFile;

  if (shxSrc) {
    shxFile = utils.isString(shxSrc) ? new FileReader(shxSrc) : new BufferReader(shxSrc);
    shxBin = shxFile.readToBinArray(0, shxFile.size()).bigEndian();
  }

  reset();

  this.header = function() {
    return header;
  };

  // Callback interface: for each record in a .shp file, pass a
  //   record object to a callback function
  //
  this.forEachShape = function(callback) {
    var shape = this.nextShape();
    while (shape) {
      callback(shape);
      shape = this.nextShape();
    }
  };

  // Iterator interface for reading shape records
  this.nextShape = function() {
    var shape = readNextShape();
    if (!shape) {
      if (skippedBytes > 0) {
        // Encountered in ne_10m_railroads.shp from natural earth v2.0.0
        message("Skipped " + skippedBytes + " bytes in .shp file -- possible data loss.");
      }
      shpFile.close();
      reset();
    }
    return shape;
  };

  function readNextShape() {
    var shape, offset;
    if (done()) return null;
    if (shxBin) {
      shxBin.position(100 + recordCount * 8);
      offset = shxBin.readUint32() * 2;
      // TODO: warn if offset not equal to shpOffset?
    } else {
      offset = shpOffset;
    }
    shape = readShapeAtOffset(offset);
    if (!shape) {
      // Very rarely, in-the-wild .shp files may contain junk bytes between
      // records; it may be possible to scan past the junk to find the next record.
      // TODO: Probably better to use the .shx file to index records, rather
      // than trying to read consecutive records from the .shp file.
      shape = huntForNextShape(offset + 4, recordCount + 1);
    }
    if (shape) {
      if (shape.id <= recordCount) {
        // Encountered in ne_10m_railroads.shp from natural earth v2.0.0
        message("Shapefile record " + shape.id + " appears more than once -- possible file corruption.");
        return readNextShape();
      }
      recordCount++;
    }
    return shape || null;
  }

  function done() {
    if (shxFile && shxFile.size() <= 100 + recordCount * 8) return true;
    if (shpOffset + 12 > shpSize) return true;
    return false;
  }

  function reset() {
    shpOffset = 100;
    skippedBytes = 0;
    recordCount = 0;
  }

  function parseHeader(bin) {
    var header = {
      signature: bin.bigEndian().readUint32(),
      byteLength: bin.skipBytes(20).readUint32() * 2,
      version: bin.littleEndian().readUint32(),
      type: bin.readUint32(),
      bounds: bin.readFloat64Array(4), // xmin, ymin, xmax, ymax
      zbounds: bin.readFloat64Array(2),
      mbounds: bin.readFloat64Array(2)
    };

    if (header.signature != 9994) {
      error("Not a valid .shp file");
    }

    if (!internal.isSupportedShapefileType(header.type)) {
      error("Unsupported .shp type:", header.type);
    }

    if (header.byteLength != shpFile.size()) {
      error("File size of .shp doesn't match size in header");
    }

    return header;
  }

  function readShapeAtOffset(offset) {
    var shape = null,
        recordSize, recordType, recordId, goodSize, goodType, bin;

    if (offset + 12 <= shpSize) {
      bin = shpFile.readToBinArray(offset, 12);
      recordId = bin.bigEndian().readUint32();
      // record size is bytes in content section + 8 header bytes
      recordSize = bin.readUint32() * 2 + 8;
      recordType = bin.littleEndian().readUint32();
      goodSize = offset + recordSize <= shpSize && recordSize >= 12;
      goodType = recordType === 0 || recordType == header.type;
      if (goodSize && goodType) {
        bin = shpFile.readToBinArray(offset, recordSize);
        shape = new RecordClass(bin, recordSize);
        shpOffset = offset + shape.byteLength; // advance read position
      }
    }
    return shape;
  }

  // TODO: add tests
  // Try to scan past unreadable content to find next record
  function huntForNextShape(start, id) {
    var offset = start,
        shape = null,
        bin, recordId, recordType, count;
    while (offset + 12 <= shpSize) {
      bin = shpFile.readToBinArray(offset, 12);
      recordId = bin.bigEndian().readUint32();
      recordType = bin.littleEndian().skipBytes(4).readUint32();
      if (recordId == id && (recordType == header.type || recordType === 0)) {
        // we have a likely position, but may still be unparsable
        shape = readShapeAtOffset(offset);
        break;
      }
      offset += 4; // try next integer position
    }
    count = shape ? offset - start : shpSize - start;
    debug('Skipped', count, 'bytes', shape ? 'before record ' + id : 'at the end of the file');
    skippedBytes += count;
    return shape;
  }
}

ShpReader.prototype.type = function() {
  return this.header().type;
};

ShpReader.prototype.getCounts = function() {
  var counts = {
    nullCount: 0,
    partCount: 0,
    shapeCount: 0,
    pointCount: 0
  };
  this.forEachShape(function(shp) {
    if (shp.isNull) counts.nullCount++;
    counts.pointCount += shp.pointCount;
    counts.partCount += shp.partCount;
    counts.shapeCount++;
  });
  return counts;
};
