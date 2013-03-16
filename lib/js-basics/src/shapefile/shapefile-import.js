/* @requires nodejs, events, shapefile, shapes, textutils, data, dbf-import, dataview */

//
Shapefile.importShp = function(src) {
  var buf;
  if (Utils.isString(src)) {
    buf = Node.readFile(src);
  } else {
    buf = src; // TODO: validate src type
  }
  var data = new ShapefileReader(buf).read();
  return data;
};

Shapefile.importShpFromUrl = function(url, callback) {
  Utils.loadArrayBuffer(url, function(buf) {
    var data = Shapefile.importShp(buf);
    callback(data);
  })
};

Shapefile.importDbfFromUrl = function(url, callback, opts) {
  Utils.loadArrayBuffer(url, function(buf) {
    var data = Shapefile.importDbf(buf, opts);
    callback(data);
  })
};

Shapefile.importDbf = function(src, opts) {
  T.start();
  var data = new DbfReader(src, opts).read();
  T.stop("[importDbf()]");
  return data;
};

/**
/ use js File api to read and parse a shapefile

<input type="file" id="files" name="files[]" multiple />
Browser.on("files", ShapefileImport.onLoad(callback));  // TODO: make Browser.on() work with object id

 */
Shapefile.handleFileSelect = function(el, callback) {
  if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    trace("[ShapefielImport.onLoad()] File api not supported.");
    throw "MissingFileAPI";
    return;
  }
  Browser.on('change', el, function(evt) {
    var files = evt.target.files;
  });
};


Utils.loadArrayBuffer = function(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function(e) {
    callback(xhr.response);
  };
  xhr.send();
};


/**
 * Create a ShapefileReader (new ShapefileReader) to start reading a Shapefile
 * @param buf An ArrayBuffer or nodejs Buffer object
 * 
 * Used by Shapefile methods (see below)
 */
function ShapefileReader(src) {
  if (Utils.isString(src)) {
    src = Node.readFile(src)
  }
  this._bin = new BinArray(src);
  this.header = this.readHeader(this._bin);
}


ShapefileReader.prototype.read = function() {
  var bin = this._bin,
    header = this.header,
    shapes = [],
    pointCount = 0

  bin.position(100); // make sure we're reading from shape data section
  while (bin.bytesLeft() > 0) {
    var meta = this.readShapeMetadata(bin, header);
    var shp = this.readShape(bin, meta);
    shapes.push(shp);
    pointCount += meta.pointCount;
  }
  header.pointCount = pointCount;
  return {header:header, shapes:shapes};
}


ShapefileReader.prototype.readShapeMetadata = function(bin, header) {
  bin.bigEndian();
  var partCount = 0,
    pointCount = 0,
    shapeOffset = bin.position(),
    shapeNum = bin.readUint32(),
    contentWords = bin.readUint32();

  bin.littleEndian();
  var type = bin.readUint32();

  if (type == Shapefile.NULL) {
    trace("[ShapefileReader.readNext()] shape no.", shapeNum, "is NULL");
  }
  else if (type != header.type) {
    error("Record/Shapefile type mismatch; recType:", recType, "fileType:", header.type);
  }
  else {
    var bounds = bin.readFloat64Array(4);
    partCount = bin.readUint32();
    pointCount = bin.readUint32();
    var pointOffsets = bin.readUint32Array(partCount);
    var partSizes = [];
    for (var i = 0; i<partCount; i++) {
      var pointsInPart = i < partCount-1 ? pointOffsets[i+1] - pointOffsets[i] : pointCount - pointOffsets[i];

      // Empty parts would be removed here
      if (pointsInPart > 0) { // 
        partSizes.push(pointsInPart); 
      }
    }
  }

  var meta = {
    shapeOffset: shapeOffset,
    coordOffset: bin.position(),
    shapeNum: shapeNum,
    partSizes: partSizes || null,
    bounds: bounds || null,
    partCount: partSizes ? partSizes.length : 0,
    pointCount: pointCount,
    type: type
  };

  return meta;
};

/**
 * Default shape reader; override to change format
 */
ShapefileReader.prototype.readShape = function(bin, meta) {
  var arr = meta.partSizes.map(function(len) {
    var xx = [], yy = [];
    for (var idx=bin.position(), end=idx + 16 * len; idx < end; idx += 16) {
      xx.push(bin.readFloat64());
      yy.push(bin.readFloat64());
    }
    return [xx, yy];
  });
  return arr;
};

ShapefileReader.readShapeAsPointArrays = function(bin, meta) {
  var arr = meta.partSizes.map(function(len) {
    var coords = [];
    for (var i=0; i<len; i++) {
      coords.push(bin.readFloat64Array(2));
    }
    return [xx, yy];
  });
  return arr;
};

ShapefileReader.readShapeAsShapeVector = function(bin, meta) {
  var shp = new ShapeVector(meta.shapeNum - 1);
  shp.setBounds(meta.bounds[0], meta.bounds[3], meta.bounds[2], meta.bounds[1]);
  var parts = ShapefileReader.readShapeAsArray(bin, meta);
  parts.forEach(function(partArr) {
    var vec = new VertexSet(partArr[0], partArr[1]);
    shp.addPartData(vec);
  });
  return shp;
};


ShapefileReader.prototype.readHeader = function(bin) {
  bin.bigEndian();
  var fileCode = bin.readUint32();
  bin.skipBytes(4*5);
  var wordsInFile = bin.readUint32();
  bin.littleEndian();
  var meta = {
    byteCount: wordsInFile * 2,
    version: bin.readUint32(),
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

  if (!(meta.type == Shapefile.POLYGON || meta.type == Shapefile.POLYLINE)) {
    error("Unsupported Shapefile Type:", meta.type);
  }

  return meta;
};

