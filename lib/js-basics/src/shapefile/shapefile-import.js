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
  var offs = 100,
      i = 0, shape;
  while (this._bin.position(offs).bytesLeft() > 0) {
    shape = new ShapeRecord(this._bin);
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


function ShapeRecord(bin) {
  this.id = bin.bigEndian().readUint32();
  this.byteLength = bin.readUint32() * 2 + 8; // bytes in content section + 8 header bytes
  this.type = bin.littleEndian().readUint32();

  if (this.type == Shapefile.NULL) {
    this.pointCount = 0;
    this.partCount = 0;
  }
  else {
    this._bin = bin;
    this._boundsOffs = bin.position();
    this.partCount = bin.skipBytes(32).readUint32();
    this.pointCount = bin.readUint32();
  }
};

ShapeRecord.prototype = {

  forEachPart: function(callback) {
    // stub
  },

  getBounds: function() {
    if (this.type == Shapefile.NULL) return null;
    return this._bin.position(this._boundsOffs).readFloat64Array(4);
  },

  getCoords: function() {
    if (this.type == Shapefile.NULL) return [];
    var coordOffs = this._boundsOffs + 40 + this.partCount * 4
    return this._bin.position(coordOffs).readFloat64Array(this.pointCount * 2);
  },

  getPartSizes: function() {
    var partLen,
        indexOffs = this._boundsOffs + 40,
        startId = 0,
        sizes = [];

    for (var i=0, n=this.partCount; i<n; i++) {
      if (i < n - 1) {
        partLen = this._bin.position(indexOffs + i * 4 + 4).readUint32() - startId;
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
