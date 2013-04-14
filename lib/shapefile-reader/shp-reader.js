/* @requires core, dataview */

var ShpType = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINTZ: 11,
  POLYLINEZ: 13,
  POLYGONZ: 15,
  MULTIPOINTZ: 18,
  POINTM: 21,
  POLYLINEM: 23,
  POLYGONM: 25,
  MULIPOINTM: 28,
  MULTIPATCH: 31 // not supported
};

ShpType.polygonType = function(t) {
  return t == 5 || t == 15 || t == 25;
};

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
//      var coords = s.readCoords(); // [x,y,x,y,...]
//      var zdata = s.readZ();  // [z,z,...]
//      var mdata = s.readM();  // [m,m,...] or null
//      var partSizes = s.readPartSizes(); // for types w/ parts
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
  if (this instanceof ShpReader == false) {
    return new ShpReader(src);
  }

  if (Utils.isString(src)) {
    src = Node.readFile(src)
  }

  var bin = new BinArray(src),
      header = readHeader(bin);
  validateHeader(header);

  this.header = function() {
    return header;
  };

  var shapeClass = this.getRecordClass(header.type);

  // return data as nested arrays of shapes > parts > points > [x,y(,z,m)]
  // TODO: implement @format param for extracting coords in different formats
  //
  this.read = function(format) {
    var shapes = [];
    this.forEachShape(function(shp) {
      shapes.push(shp.isNull ? null : shp.read(format));
    });
    return shapes;
  }

  // Callback interface: for each record in a .shp file, pass a 
  //   record object to a callback function
  //
  this.forEachShape = function(callback) {
    var shape;
    this.reset();
    while (shape = this.nextShape()) {
      callback(shape);
    }
  };

  // Iterator interface for reading shape records
  //
  var readPos = 100;

  this.nextShape = function() {
    bin.position(readPos);
    if (bin.bytesLeft() == 0) {
      this.reset();
      return null;
    }
    var shape = new shapeClass(bin);
    readPos += shape.byteLength;
    return shape;
  };

  this.reset = function() {
    readPos = 100;
  }

  function readHeader(bin) {
    return {
      signature: bin.bigEndian().readUint32(),
      byteLength: bin.skipBytes(20).readUint32() * 2,
      version: bin.littleEndian().readUint32(),
      type: bin.readUint32(),
      bounds: bin.readFloat64Array(4), // xmin, ymin, xmax, ymax
      zbounds: bin.readFloat64Array(2),
      mbounds: bin.readFloat64Array(2)
    };
  }

  function validateHeader(header) {
    if (header.signature != 9994)
      error("Not a valid .shp file");

    var supportedTypes = [1,3,5,8,11,13,15,18,21,23,25,28];
    if (!Utils.contains(supportedTypes, header.type))
      error("Unsupported .shp type:", header.type);

    if (header.byteLength != bin.size())
      error("File size doesn't match size in header");
  }
}

ShpReader.prototype.type = function() {
  return this.header().type;
}

ShpReader.prototype.hasZ = function() {
  return Utils.contains([11,13,15,18], this.type());
};

ShpReader.prototype.hasM = function() {
  return this.hasZ() || Utils.contains([21,23,25,28], this.type());
};

// i.e. non-point type
ShpReader.prototype.hasParts = function() {
  return Utils.contains([3,5,13,15,23,25], this.type());
};

ShpReader.prototype.hasBounds = function() {
  return this.hasParts() || Utils.contains([8,18,28], this.type());
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

// Returns a constructor function for a shape record class with
//   properties and methods for reading data.
//
// Record properties
//   type, isNull, byteLength, pointCount, partCount (all types)
//
// Record methods
//   read() (all types)
//   readBounds(), readCoords()  (all but single point types)
//   readPartSizes() (polygon and polyline types)
//   readZBounds(), readZ() (Z types except POINTZ)
//   readMBounds(), readM(), hasM() (M and Z types, except POINT[MZ])
//
ShpReader.prototype.getRecordClass = function(type) {
  var hasBounds = this.hasBounds(),
      hasParts = this.hasParts(),
      hasZ = this.hasZ(),
      hasM = this.hasM(),
      singlePoint = !hasBounds;

  // @bin is a BinArray set to the first byte of a shape record
  //
  var constructor = function ShapeRecord(bin) {
    var pos = bin.position();
    this.id = bin.bigEndian().readUint32();
    this.byteLength = bin.readUint32() * 2 + 8; // bytes in content section + 8 header bytes
    this.type = bin.littleEndian().readUint32();
    this.isNull = this.type == 0;
    if (this.byteLength <= 0 || this.type !== 0 && this.type != type)
      error("Unable to read a shape -- .shp file may be corrupted");

    if (this.isNull) {
      this.pointCount = 0;
      this.partCount = 0;
    } else if (singlePoint) {
      this.pointCount = 1;
      this.partCount = 1;
    } else {
      bin.skipBytes(32); // skip bbox
      this.partCount = hasParts ? bin.readUint32() : 1;
      this.pointCount = bin.readUint32();      
    }
    this._data = function() {
      return this.isNull ? null : bin.position(pos);
    }
  };

  var singlePointProto = {
    hasM: function() {
      return this.byteLength == 12 + (hasZ ? 30 : 24); // size with M
    },

    read: function() {
      var n = 2;
      if (hasZ) n++;
      if (this.hasM()) n++; // checking for M
      return this._data().skipBytes(12).readFloat64Array(n);
    }
  };

  var multiCoordProto = {
    _xypos: function() {
      var offs = 16; // skip header, type, record size & point count
      if (hasBounds) offs += 32;
      if (hasParts) offs += 4 * this.partCount + 4; // skip part count & index
      return offs;
    },

    readBounds: function() {
      return this._data().skipBytes(12).readFloat64Array(4);
    },

    readCoords: function() {
      return this._data().skipBytes(this._xypos()).readFloat64Array(this.pointCount * 2);
    },

    readPoints: function() {
      var coords = this.readCoords(),
          zz = hasZ ? this.readZ() : null,
          mm = hasM && this.hasM() ? this.readM() : null,
          points = [], p;

      for (var i=0, n=coords.length / 2; i<n; i++) {
        p = [coords[i*2], coords[i*2+1]];
        if (zz) p.push(zz[i]);
        if (mm) p.push(mm[i]);
        points.push(p);
      }
      return points;
    },

    read: function() {
      return this.readPoints();
    }
  };

  // Mixins for various shape types

  var partsProto = {
    readPartSizes: function() {
      var partLen,
          startId = 0,
          sizes = [],
          bin = this._data().skipBytes(56); // skip to second entry in part index

      for (var i=0, n=this.partCount; i<n; i++) {
        if (i < n - 1)
          partLen = bin.readUint32() - startId;
        else
          partLen = this.pointCount - startId;

        if (partLen <= 0) error("ShapeRecord#readPartSizes() corrupted part");
        sizes.push(partLen);
        startId += partLen;
      }
      return sizes;
    },

    // overrides read() function from multiCoordProto
    read: function() {
      var points = this.readPoints();
      var parts = Utils.map(this.readPartSizes(), function(size) {
          return points.splice(0, size);
        });
      return parts;
    }
  };

  var mProto = {
    _mpos: function() {
      var pos = this._xypos() + this.pointCount * 16;
      if (hasZ) pos += this.pointCount * 8 + 16;
      return pos;
    },

    readMBounds: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos()).readFloat64Array(2) : null;
    },

    readM: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos() + 16).readFloat64Array(this.pointCount) : null;
    },

    // Test if this record contains M data
    // (according to the Shapefile spec, M data is optional in a record)
    //
    hasM: function() {
      var bytesWithoutM = this._mpos(),
          bytesWithM = bytesWithoutM + this.pointCount * 8 + 16;
      if (this.byteLength == bytesWithoutM)
        return false;
      else if (this.byteLength == bytesWithM)
        return true;
      else
        error("#hasM() Counting error");
    }
  };

  var zProto = {
    _zpos: function() {
      return this._xypos() + this.pointCount * 16;
    },

    readZBounds: function() {
      return this._data().skipBytes(this._zpos()).readFloat64Array(2);
    },

    readZ: function() {
      return this._data().skipBytes(this._zpos() + 16).readFloat64Array(this.pointCount);
    }
  };

  var proto;
  if (singlePoint) {
    proto = singlePointProto;
  } else {
    proto = multiCoordProto;
    if (hasZ)
      Utils.extend(proto, zProto);
    if (hasM)
      Utils.extend(proto, mProto);
    if (hasParts)
      Utils.extend(proto, partsProto);
  }
  constructor.prototype = proto;
  proto.constructor = constructor;
  return constructor;
};
