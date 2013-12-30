/* @requires mshp-common-lib, mapshaper-encodings */
//
// DBF format references:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.clicketyclick.dk/databases/xbase/format/index.html
// http://www.clicketyclick.dk/databases/xbase/format/data_types.html

var Dbf = {};

var RE_UTF8 = /^utf-?8$/i;

Dbf.importRecords = function(src, encoding) {
  return new DbfReader(src, encoding).readRows();
};

Dbf.getStringReaderAscii = function(size) {
  return function(bin) {
    var require7bit = Env.inNode;
    var str = bin.readCString(size, require7bit);
    if (str === null) {
      stop("DBF file contains non-ascii text data.\n" +
          "Use the --encoding option with one of these encodings:\n" +
          MapShaper.getFormattedEncodings());
    }
    return Utils.trim(str);
  };
};

Dbf.getStringReaderEncoded = function(size, encoding) {
  var iconv = MapShaper.requireConversionLib(encoding),
      buf = new Buffer(size),
      isUtf8 = RE_UTF8.test(encoding);
  return function(bin) {
    var i, c, eos = false;
    for (i=0; i<size; i++) {
      c = bin.readUint8();
      if (c === 0) break;
      buf[i] = c;
    }
    if (i === 0) {
      str = '';
    } else if (isUtf8) {
      str = buf.toString('utf8', 0, i);
    } else {
      str = iconv.decode(buf.slice(0, i), encoding);
    }
    str = Utils.trim(str);
    return str;
  };
};

Dbf.getStringReader = function(size, encoding) {
  if (encoding === 'ascii') {
    return Dbf.getStringReaderAscii(size);
  } else if (Env.inNode) {
    // console.log(name)
    return Dbf.getStringReaderEncoded(size, encoding);
  }
  // TODO: user browserify or other means of decoding string data in the browser
  error("[Dbf.getStringReader()] Non-ascii encodings only supported in Node.");
};


// cf. http://code.google.com/p/stringencoding/
//
// @src is a Buffer or ArrayBuffer or filename
//
function DbfReader(src, encoding) {
  if (Utils.isString(src)) {
    src = Node.readFile(src);
  }
  var bin = new BinArray(src).littleEndian();
  encoding = encoding || 'ascii';
  this.header = this.readHeader(bin, encoding);
  this.bin = bin;
  this.recordCount = this.header.recordCount;
  this.fieldCount = this.header.fields.length;
}


DbfReader.prototype.readCol = function(c) {
  var rows = this.header.recordCount,
      col = [];
  for (var r=0; r<rows; r++) {
    col[r] = this.readRowCol(r, c);
  }
  return col;
};

// TODO: handle cols with the same name
//
DbfReader.prototype.readCols = function() {
  var data = {};
  Utils.forEach(this.header.fields, function(field, col) {
    data[field.name] = this.readCol(col);
  }, this);
  return data;
};

DbfReader.prototype.readRows = function() {
  var fields = this.header.fields,
    rows = this.header.recordCount,
    cols = fields.length,
    names = Utils.map(fields, function(f) {return f.name}),
    data = [];

  for (var r=0; r<rows; r++) {
    var rec = data[r] = {};
    for (var c=0; c < cols; c++) {
      rec[names[c]] = this.readRowCol(r, c);
    }
  }
  return data;
};

DbfReader.prototype.readRowCol = function(r, c) {
  var field = this.header.fields[c],
      offs = this.header.headerSize + this.header.recordSize * r + field.columnOffset;
  return field.reader(this.bin.position(offs));
};

DbfReader.prototype.readHeader = function(bin, encoding) {
  var header = {
    version: bin.readInt8(),
    updateYear: bin.readUint8(),
    updateMonth: bin.readUint8(),
    updateDay: bin.readUint8(),
    recordCount: bin.readUint32(),
    headerSize: bin.readUint16(),
    recordSize: bin.readUint16(),
    incompleteTransaction: bin.skipBytes(2).readUint8(),
    encrypted: bin.readUint8(),
    mdx: bin.skipBytes(12).readUint8(),
    language: bin.readUint8()
  };

  bin.skipBytes(2);
  header.fields = [];
  var colOffs = 1; // first column starts on second byte of record
  while (bin.peek() != 0x0D) {
    var field = this.readFieldHeader(bin, encoding);
    field.columnOffset = colOffs;
    colOffs += field.size;
    header.fields.push(field);
  }

  if (colOffs != header.recordSize)
    error("Record length mismatch; header:", header.recordSize, "detected:", colOffs);
  return header;
};

Dbf.getNumberReader = function(size, decimals) {
  return function(bin) {
    var str = bin.readCString(size);
    return parseFloat(str);
  };
};

Dbf.getIntegerReader = function() {
  return function(bin) {
    return bin.readInt32();
  };
};

DbfReader.prototype.readFieldHeader = function(bin, encoding) {
  var field = {
    name: bin.readCString(11),
    type: String.fromCharCode(bin.readUint8()),
    address: bin.readUint32(),
    size: bin.readUint8(),
    decimals: bin.readUint8(),
    id: bin.skipBytes(2).readUint8(),
    position: bin.skipBytes(2).readUint8(),
    indexFlag: bin.skipBytes(7).readUint8()
  };

  if (field.type == 'C') {
    field.reader = Dbf.getStringReader(field.size, encoding);
  } else if (field.type == 'F' || field.type == 'N') {
    field.reader = Dbf.getNumberReader(field.size, field.decimals);
  } else if (field.type == 'I') {
    field.reader = Dbf.getIntegerReader();
  } else if (field.type == 'L') {
    field.reader = function(bin) {
      var c = bin.readCString(field.size),
          val = null;
      if (/[ty]/i.test(c)) val = true;
      else if (/[fn]/i.test(c)) val = false;
      return val;
    };
  } else if (field.type == 'D') {
    field.reader = function(bin) {
      var str = bin.readCString(field.size),
          yr = str.substr(0, 4),
          mo = str.substr(4, 2),
          day = str.substr(6, 2);
      return new Date(Date.UTC(+yr, +mo - 1, +day));
    };
  } else {
    error("Unsupported DBF field type:", field.type);
  }
  return field;
};

// export for testing
MapShaper.dbf = {
  Dbf: Dbf,
  DbfReader: DbfReader
};
