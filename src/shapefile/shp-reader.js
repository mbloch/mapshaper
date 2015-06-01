/* @requires shp-record */

// Read data from a .shp file
// @src is an ArrayBuffer, Node.js Buffer or filename
//
//    // Example: read everthing into nested arrays
//    // coordinates are read as 2-4 element arrays [x,y(,z,m)]
//    // nested in arrays for shapes, parts and line-strings depending on the type
//    var reader = new ShpReader("file.shp");
//    var data = reader.read();
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
  var RecordClass = new ShpRecordClass(header.type);
  var recordOffs = 100;

  this.header = function() {
    return header;
  };

  // return data as nested arrays of shapes > parts > points > [x,y(,z,m)]
  this.read = function() {
    var shapes = [];
    this.forEachShape(function(shp) {
      shapes.push(shp.isNull ? null : shp.read(format));
    });
    return shapes;
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
    var fileSize = file.size(),
        recordSize,
        shape = null,
        bin;

    if (recordOffs + 8 < fileSize) {
      bin = file.readBytes(8, recordOffs);
      // byteLen is bytes in content section + 8 header bytes
      recordSize = bin.bigEndian().skipBytes(4).readUint32() * 2 + 8;
      // todo: what if size is 0
      if (recordOffs + recordSize <= fileSize && recordSize >= 12) {
        bin = file.readBytes(recordSize, recordOffs);
        recordOffs += recordSize;
        shape = new RecordClass(bin);
      } else {
        trace("Unaccounted bytes in .shp file -- possible corruption");
      }
    }

    if (shape === null) {
      file.close();
      recordOffs = 100;
    }

    return shape;
  };

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
      error("File size doesn't match size in header");

    return header;
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
