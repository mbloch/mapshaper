/* @requires dataview, data, textutils */

// DBF file format:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.dbase.com/Knowledgebase/INT/db7_file_fmt.htm
//
// TODO: handle non-ascii characters, e.g. multibyte encodings
// cf. http://code.google.com/p/stringencoding/


// @src is a Buffer or ArrayBuffer or filename
//
function DbfReader(src) {
  if (Utils.isString(src)) {
    src = Node.readFile(src);
  }
  var bin = new BinArray(src);
  this.header = this.readHeader(bin);
  this.records = new Uint8Array(bin.buffer(), this.header.headerSize);
}


DbfReader.prototype.read = function(format) {
  format = format || "rows";
  if (format == "rows") {
    read = this.readRows;
  } else if ( format == "cols") {
    read = this.readCols;
  } else if (format == "table") {
    read = this.readAsDataTable;
  } else {
    error("[DbfReader.read()] Unknown format:", format);
  }
  return read.call(this);
};

DbfReader.prototype.readCol = function(c) {
  var rows = this.header.recordCount,
      col = [];
  for (var r=0; r<rows; r++) {
    col[r] = this.getItemAtRowCol(r, c);
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
      rec[names[c]] = this.getItemAtRowCol(r, c);
    }
  }
  return data;
};

DbfReader.prototype.readAsDataTable = function() {
  var data = this.readCols();
  var schema = Utils.reduce(this.header.fields, {}, function(f, obj) {
    obj[f.name] = f.parseType;
    return obj;
  })
  return new DataTable({schema: schema, data: data});
};

DbfReader.prototype.getItemAtRowCol = function(r, c) {
  var field = this.header.fields[c],
      offs = this.header.recordSize * r + field.columnOffset,
      str = "";
  for (var i=0, n=field.length; i < n; i++) {
    str += String.fromCharCode(this.records[i + offs]);
  }

  var val = field.parser(str);
  return val;
};

DbfReader.prototype.readHeader = function(bin) {
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
    var field = this.readFieldHeader(bin);
    field.columnOffset = colOffs;
    colOffs += field.length;
    header.fields.push(field);
  }

  if (colOffs != header.recordSize)
    error("Record length mismatch; header:", header.recordSize, "detected:", rowSize);
  return header;
};

DbfReader.prototype.readFieldHeader = function(bin) {
  var field = {
    name: bin.readCString(11),
    type: String.fromCharCode(bin.readUint8()),
    address: bin.readUint32(),
    length: bin.readUint8(),
    decimals: bin.readUint8(),
    id: bin.skipBytes(2).readUint8(),
    position: bin.skipBytes(2).readUint8(),
    indexFlag: bin.skipBytes(7).readUint8()
  };

  if (field.type == 'C') {
    field.parseType = C.STRING;
    field.parser = Utils.trim;
  } else if (field.type == 'F' || field.type == 'N' && field.decimals > 0) {
    field.parseType = C.DOUBLE;
    field.parser = parseFloat;
  } else if (field.type == 'I' || field.type == 'N') {
    field.parseType = C.INTEGER;
    field.parser = parseInt;
  } else {
    error("Unsupported DBF field type:", field.type);
  }
  return field;
};
