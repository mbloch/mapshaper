/* @requires shp-record */

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
function ShpReader(src) {
  if (this instanceof ShpReader === false) {
    return new ShpReader(src);
  }

  var file = utils.isString(src) ? new FileBytes(src) : new BufferBytes(src);
  var header = parseHeader(file.readBytes(100, 0));
  var fileSize = file.size();
  var RecordClass = new ShpRecordClass(header.type);
  var recordOffs, i, skippedBytes;

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
    var shape = readShapeAtOffset(recordOffs, i),
        offs2, skipped;
    if (!shape && recordOffs + 12 <= fileSize) {
      // Very rarely, in-the-wild .shp files may contain junk bytes between
      // records; it may be possible to scan past the junk to find the next record.
      shape = huntForNextShape(recordOffs + 4, i);
    }
    if (shape) {
      recordOffs += shape.byteLength;
      if (shape.id < i) {
        // Encountered in ne_10m_railroads.shp from natural earth v2.0.0
        message("[shp] Record " + shape.id + " appears more than once -- possible file corruption.");
        return this.nextShape();
      }
      i++;
    } else {
      if (skippedBytes > 0) {
        // Encountered in ne_10m_railroads.shp from natural earth v2.0.0
        message("[shp] Skipped " + skippedBytes + " bytes in .shp file -- possible data loss.");
      }
      file.close();
      reset();
    }
    return shape;
  };

  function reset() {
    recordOffs = 100;
    skippedBytes = 0;
    i = 1; // Shapefile id of first record
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

    var supportedTypes = [1,3,5,8,11,13,15,18,21,23,25,28];
    if (!utils.contains(supportedTypes, header.type))
      error("Unsupported .shp type:", header.type);

    if (header.byteLength != file.size())
      error("File size of .shp doesn't match size in header");

    return header;
  }

  function readShapeAtOffset(recordOffs, i) {
    var shape = null,
        recordSize, recordType, recordId, goodId, goodSize, goodType, bin;

    if (recordOffs + 12 <= fileSize) {
      bin = file.readBytes(12, recordOffs);
      recordId = bin.bigEndian().readUint32();
      // record size is bytes in content section + 8 header bytes
      recordSize = bin.readUint32() * 2 + 8;
      recordType = bin.littleEndian().readUint32();
      goodId = recordId == i; // not checking id ...
      goodSize = recordOffs + recordSize <= fileSize && recordSize >= 12;
      goodType = recordType === 0 || recordType == header.type;
      if (goodSize && goodType) {
        bin = file.readBytes(recordSize, recordOffs);
        shape = new RecordClass(bin, recordSize);
      }
    }
    return shape;
  }

  // TODO: add tests
  // Try to scan past unreadable content to find next record
  function huntForNextShape(start, id) {
    var offset = start,
        shape = null,
        bin, recordId, recordType;
    while (offset + 12 <= fileSize) {
      bin = file.readBytes(12, offset);
      recordId = bin.bigEndian().readUint32();
      recordType = bin.littleEndian().skipBytes(4).readUint32();
      if (recordId == id && (recordType == header.type || recordType === 0)) {
        // we have a likely position, but may still be unparsable
        shape = readShapeAtOffset(offset, id);
        break;
      }
      offset += 4; // try next integer position
    }
    skippedBytes += shape ? offset - start : fileSize - start;
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

// Same interface as FileBytes, for reading from a buffer instead of a file.
function BufferBytes(buf) {
  var bin = new BinArray(buf),
      bufSize = bin.size();
  this.readBytes = function(len, offset) {
    if (bufSize < offset + len) error("Out-of-range error");
    bin.position(offset);
    return bin;
  };

  this.size = function() {
    return bufSize;
  };

  this.close = function() {};
}

// Read a binary file in chunks, to support files > 1GB in Node
function FileBytes(path) {
  var DEFAULT_BUF_SIZE = 0xffffff, // 16 MB
      fs = require('fs'),
      fileSize = cli.fileSize(path),
      cacheOffs = 0,
      cache, fd;

  this.readBytes = function(len, start) {
    if (fileSize < start + len) error("Out-of-range error");
    if (!cache || start < cacheOffs || start + len > cacheOffs + cache.size()) {
      updateCache(len, start);
    }
    cache.position(start - cacheOffs);
    return cache;
  };

  this.size = function() {
    return fileSize;
  };

  this.close = function() {
    if (fd) {
      fs.closeSync(fd);
      fd = null;
      cache = null;
      cacheOffs = 0;
    }
  };

  function updateCache(len, start) {
    var headroom = fileSize - start,
        bufSize = Math.min(headroom, Math.max(DEFAULT_BUF_SIZE, len)),
        buf = new Buffer(bufSize),
        bytesRead;
    if (!fd) fd = fs.openSync(path, 'r');
    bytesRead = fs.readSync(fd, buf, 0, bufSize, start);
    if (bytesRead < bufSize) error("Error reading file");
    cacheOffs = start;
    cache = new BinArray(buf);
  }
}
