/* @requires shapes, dataview */

var Shapefile = {
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
  MULTIPATCH: 31
};

// Read data from a .shp file
// @src is an ArrayBuffer, Buffer or filename
//
function ShapefileReader(src, opts) {
  if (Utils.isString(src)) {
    src = Node.readFile(src)
  }
  this._bin = new BinArray(src);
  this._header = this.readHeader(this._bin);
}

ShapefileReader.prototype.type = function() {
  return this._header.type;
};

ShapefileReader.prototype.getCounts = function() {
  var counts = {
    nullCount: 0,
    partCount: 0,
    shapeCount: 0,
    pointCount: 0
  };

  this.forEachShape(function(shp) {
    if (shp.type == Shapefile.NULL) {
      counts.nullCount++;
    }
    counts.pointCount += shp.pointCount;
    counts.partCount += shp.partCount;
    counts.shapeCount++;
  })
  return counts;
};

ShapefileReader.prototype.forEachShape = function(callback) {
  var shapeClass = this.getRecordClass(this.type());
  var offs = 100,
      i = 0,
      shape;
  while (this._bin.position(offs).bytesLeft() > 0) {
    shape = new shapeClass(this._bin);
    if (i + 1 !== shape.id) error("ShapefileReader#forEachShape() id mismatch; expected:", i+1, "found:", shape.id)
    offs += shape.byteLength;
    callback(shape, i);
    i++;
  }
};

ShapefileReader.prototype.readHeader = function(bin) {
  var fileCode = bin.bigEndian().readUint32(),
      wordsInFile = bin.skipBytes(20).readUint32();
  return {
    byteCount: wordsInFile * 2,
    version: bin.littleEndian().readUint32(),
    type: bin.readUint32(),
    xmin: bin.readFloat64(),
    ymin: bin.readFloat64(),
    xmax: bin.readFloat64(),
    ymax: bin.readFloat64(),
    zmin: bin.readFloat64(),
    zmax: bin.readFloat64(),
    mmin: bin.readFloat64(),
    mmax: bin.readFloat64()
  };
};

ShapefileReader.prototype.getRecordClass = function(type) {
  var zTypes = [11,13,15,18],
      mTypes = zTypes.concat([21,23,25,28]),
      multipointTypes = [8,18,28],
      areaTypes = [3,5,13,15,23,25];

  var hasBounds = Utils.contains(areaTypes.concat(multipointTypes), type),
      hasParts = Utils.contains(areaTypes, type),
      hasZ = Utils.contains(zTypes, type),
      hasM = Utils.contains(mTypes, type),
      singlePoint = !hasBounds;

  // trace("bounds?", hasBounds, "parts?", hasParts, "z?", hasZ, "m?", hasM, "point?", singlePoint);

  var constructor = function(bin) {
    var pos = bin.position();
    this.id = bin.bigEndian().readUint32();
    this.byteLength = bin.readUint32() * 2 + 8; // bytes in content section + 8 header bytes
    this.type = bin.littleEndian().readUint32();
    this.isNull = this.type == 0;

    if (this.isNull) {
      this.pointCount = 0;
      this.partCount = 0;
    } else if (singlePoint) {
      this.pointCount = 1;
      this.partCount = 0;
    } else {
      bin.skipBytes(32); // skip bbox
      this.partCount = hasParts ? bin.readUint32() : 0;
      this.pointCount = bin.readUint32();      
    }
    this._data = function() {
      return this.isNull ? null : bin.position(pos);
    }   
  };

  var proto = {
    _xydata: function() {
      var offs = 12; // start of content section
      if (hasBounds) offs += 32;
      if (!singlePoint) offs += 4; // skip part count
      if (hasParts) offs += 4 * (this.partCount + 1); // skip part count & index
      return this._data().skipBytes(offs);
    },

    getCoords: function() {
      return this._xydata().readFloat64Array(this.pointCount * 2);
    },

    hasBounds: getFalse,
    hasParts: getFalse,
    hasZ: getFalse,
    hasM: getFalse
  };

  function getFalse() {return false};
  function getTrue() {return true};

  var boundsProto = {
    getBounds: function() {
      return this._data().skipBytes(12).readFloat64Array(4);
    },
    hasBounds: getTrue
  };

  var partsProto = {
    hasParts: getTrue,

    getPartSizes: function() {
      var partLen,
          startId = 0,
          sizes = [];

      var bin = this._data().skipBytes(56); // skip to second entry in part index
      for (var i=0, n=this.partCount; i<n; i++) {
        if (i < n - 1) {
          partLen = bin.readUint32() - startId;
        } else {
          partLen = this.pointCount - startId;
        }
        // TODO: consider just ignoring empty parts
        if (partLen <= 0) error("ShapeRecord#forEachPart() found null part");
        sizes.push(partLen);
        startId += partLen;
      }
      return sizes;
    }
  };

  var mProto = {
    _mpos: function() {
      var pos = this._zdata().position();
      if (hasZ) pos += this.pointCount * 8 + 16;
      return pos;
    },

    _mdata: function() {
      if (!this.hasM()) return null;
      return this._data.position(this._mpos());
    },

    getMBounds: function() {
      return this._mdata().readFloat64Array(2);
    },

    getM: function() {
      return this._mdata().skipBytes(16).readFloat64Array(this.pointCount);
    },

    hasM: function() {
      var bytesWithoutM = this._mpos() - this._data().position(),
          bytesWithM = bytesWithoutM + this.pointCount * 8 + 16;

      if (this.byteLength == bytesWithoutM)
        return false;
      else if (this.byteLength == bytesWithM)
        return true;
      else
        error("#hasM() Counting error");
    }
  };

  var pointProto = {
    getX: function() {
      return this._data().skipBytes(12).readFloat64();
    },

    getY: function() {
      return this._data().skipBytes(20).readFloat64();
    },

    getZ: function() {
      return this._data().skipBytes(28).readFloat64();
    },

    getM: function() {
      return this._data().skipBytes(36).readFloat64();
    },
  };

  var zProto = {
    hasZ: getTrue,

    _zdata: function() {
      return this._xydata().skipBytes(this.pointCount * 16);
    },

    getZBounds: function() {
      return this._zdata().readFloat64Array(2);
    },

    getZ: function() {
      return this._zdata.skipBytes(16).readFloat64Array(this.pointCount);
    }
  };

  if (singlePoint) {
    Opts.copyAllParams(proto, pointProto);
  }
  else {
    if (hasBounds)
      Opts.copyAllParams(proto, boundsProto);

    if (hasZ)
      Opts.copyAllParams(proto, zProto);

    if (hasM)
      Opts.copyAllParams(proto, mProto);

    if (hasParts)
      Opts.copyAllParams(proto, partsProto);
  }

  constructor.prototype = proto;
  return constructor;
};
