/* @requires mapshaper-encodings, mapshaper-encoding-detection */
//
// DBF format references:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.clicketyclick.dk/databases/xbase/format/index.html
// http://www.clicketyclick.dk/databases/xbase/format/data_types.html

var Dbf = {};

// source: http://webhelp.esri.com/arcpad/8.0/referenceguide/index.htm#locales/task_code.htm
Dbf.languageIds = [0x01,'437',0x02,'850',0x03,'1252',0x08,'865',0x09,'437',0x0A,'850',0x0B,'437',0x0D,'437',0x0E,'850',0x0F,'437',0x10,'850',0x11,'437',0x12,'850',0x13,'932',0x14,'850',0x15,'437',0x16,'850',0x17,'865',0x18,'437',0x19,'437',0x1A,'850',0x1B,'437',0x1C,'863',0x1D,'850',0x1F,'852',0x22,'852',0x23,'852',0x24,'860',0x25,'850',0x26,'866',0x37,'850',0x40,'852',0x4D,'936',0x4E,'949',0x4F,'950',0x50,'874',0x57,'1252',0x58,'1252',0x59,'1252',0x64,'852',0x65,'866',0x66,'865',0x67,'861',0x6A,'737',0x6B,'857',0x6C,'863',0x78,'950',0x79,'949',0x7A,'936',0x7B,'932',0x7C,'874',0x86,'737',0x87,'852',0x88,'857',0xC8,'1250',0xC9,'1251',0xCA,'1254',0xCB,'1253',0xCC,'1257'];

// Language & Language family names for some code pages
Dbf.encodingNames = {
  '932': "Japanese",
  '936': "Simplified Chinese",
  '950': "Traditional Chinese",
  '1252': "Western European",
  '949': "Korean",
  '874': "Thai",
  '1250': "Eastern European",
  '1251': "Russian",
  '1254': "Turkish",
  '1253': "Greek",
  '1257': "Baltic"
};

Dbf.ENCODING_PROMPT =
  "To avoid corrupted text, re-import using the \"encoding=\" option.\n" +
  "To see a list of supported encodings, run the \"encodings\" command.";

Dbf.lookupCodePage = function(lid) {
  var i = Dbf.languageIds.indexOf(lid);
  return i == -1 ? null : Dbf.languageIds[i+1];
};

Dbf.readAsciiString = function(bin, size) {
  var require7bit = Env.inNode;
  var str = bin.readCString(size, require7bit);
  if (str === null) {
    stop("DBF file contains non-ascii text.\n" + Dbf.ENCODING_PROMPT);
  }
  return utils.trim(str);
};

Dbf.readStringBytes = function(bin, size, buf) {
  // TODO: simplify by reading backwards from end of field
  var c;
  for (var i=0; i<size; i++) {
    c = bin.readUint8();
    if (c === 0) break;
    buf[i] = c;
  }
  // ignore trailing spaces (DBF fields are typically padded w/ spaces)
  while (i > 0 && buf[i-1] == 32) {
    i--;
  }
  return i;
};

Dbf.getEncodedStringReader = function(encoding) {
  var buf = new Buffer(256),
      isUtf8 = MapShaper.standardizeEncodingName(encoding) == 'utf8';
  return function(bin, size) {
    var eos = false,
        i = Dbf.readStringBytes(bin, size, buf),
        str;
    if (i === 0) {
      str = '';
    } else if (isUtf8) {
      str = buf.toString('utf8', 0, i);
    } else {
      str = MapShaper.decodeString(buf.slice(0, i), encoding); // slice references same memory
    }
    str = utils.trim(str);
    return str;
  };
};

Dbf.getStringReader = function(encoding) {
  if (!encoding || encoding === 'ascii') {
    return Dbf.readAsciiString;
  } else if (Env.inNode) {
    return Dbf.getEncodedStringReader(encoding);
  } else {
    // TODO: user browserify or other means of decoding string data in the browser
    error("[Dbf.getStringReader()] Non-ascii encodings only supported in Node.");
  }
};

Dbf.bufferContainsHighBit = function(buf, n) {
  for (var i=0; i<n; i++) {
    if (buf[i] >= 128) return true;
  }
  return false;
};

Dbf.readNumber = function(bin, size) {
  var str = bin.readCString(size),
      val;
  str = str.replace(',', '.'); // handle comma decimal separator
  val = parseFloat(str);
  return isNaN(val) ? null : val;
};

Dbf.readInt = function(bin, size) {
  return bin.readInt32();
};

Dbf.readBool = function(bin, size) {
  var c = bin.readCString(size),
      val = null;
  if (/[ty]/i.test(c)) val = true;
  else if (/[fn]/i.test(c)) val = false;
  return val;
};

Dbf.readDate = function(bin, size) {
  var str = bin.readCString(size),
      yr = str.substr(0, 4),
      mo = str.substr(4, 2),
      day = str.substr(6, 2);
  return new Date(Date.UTC(+yr, +mo - 1, +day));
};


// cf. http://code.google.com/p/stringencoding/
//
// @src is a Buffer or ArrayBuffer or filename
//
function DbfReader(src, encoding) {
  if (utils.isString(src)) {
    error("[DbfReader] Expected a buffer, not a string");
  }
  this.bin = new BinArray(src);
  this.header = this.readHeader(this.bin);
  this.encoding = encoding;
}

DbfReader.prototype.getEncoding = function() {
  if (!this.encoding) {
    this.encoding = this.findStringEncoding();
    if (!this.encoding) {
      // fall back to utf8 if detection fails (so GUI can continue without further errors)
      this.encoding = 'utf8';
      stop("Unable to auto-detect the text encoding of the DBF file.\n" + Dbf.ENCODING_PROMPT);
    }
  }
  return this.encoding;
};

DbfReader.prototype.rows = function() {
  return this.header.recordCount;
};

DbfReader.prototype.findStringEncoding = function() {
  var ldid = this.header.ldid,
      codepage = Dbf.lookupCodePage(ldid),
      samples = this.getNonAsciiSamples(50),
      only7bit = samples.length === 0,
      encoding, msg;

  // First, check the ldid (language driver id) (an obsolete way to specify which
  // codepage to use for text encoding.)
  // ArcGIS up to v.10.1 sets ldid and encoding based on the 'locale' of the
  // user's Windows system :P
  //
  if (codepage && ldid != 87) {
    // if 8-bit data is found and codepage is detected, use the codepage,
    // except ldid 87, which some GIS software uses regardless of encoding.
    encoding = codepage;
  } else if (only7bit) {
    // Text with no 8-bit chars should be compatible with 7-bit ascii
    // (Most encodings are supersets of ascii)
    encoding = 'ascii';
  }

  // As a last resort, try to guess the encoding:
  if (!encoding) {
    encoding = MapShaper.detectEncoding(samples);
  }

  // Show a sample of decoded text if non-ascii-range text has been found
  if (encoding && samples.length > 0) {
    msg = "Detected DBF text encoding: " + encoding;
    if (encoding in Dbf.encodingNames) {
      msg += " (" + Dbf.encodingNames[encoding] + ")";
    }
    consoleMessage(msg);
    msg = MapShaper.decodeSamples(encoding, samples);
    msg = MapShaper.formatStringsAsGrid(msg.split('\n'));
    consoleMessage("Sample text containing non-ascii characters:" + (msg.length > 60 ? '\n' : '') + msg);
  }
  return encoding;
};

// Return up to @size buffers containing text samples
// with at least one byte outside the 7-bit ascii range.
// TODO: filter out duplicate samples
DbfReader.prototype.getNonAsciiSamples = function(size) {
  var samples = [];
  var stringFields = this.header.fields.filter(function(f) {
    return f.type == 'C';
  });
  var rowOffs = this.getRowOffset();
  var buf = new Buffer(256);
  var index = {};
  var f, chars, sample, hash;
  for (var r=0, rows=this.rows(); r<rows; r++) {
    for (var c=0, cols=stringFields.length; c<cols; c++) {
      if (samples.length >= size) break;
      f = stringFields[c];
      this.bin.position(rowOffs(r) + f.columnOffset);
      chars = Dbf.readStringBytes(this.bin, f.size, buf);
      if (chars > 0 && Dbf.bufferContainsHighBit(buf, chars)) {
        sample = new Buffer(buf.slice(0, chars)); //
        hash = sample.toString('hex');
        if (hash in index === false) { // avoid duplicate samples
          index[hash] = true;
          samples.push(sample);
        }
      }
    }
  }
  return samples;
};

DbfReader.prototype.getRowOffset = function() {
  var start = this.header.headerSize,
      recLen = this.header.recordSize;
  return function(r) {
    return start + recLen * r;
  };
};

DbfReader.prototype.getRecordReader = function(header) {
  var fields = header.fields,
      readers = fields.map(this.getFieldReader, this),
      uniqNames = MapShaper.getUniqFieldNames(utils.pluck(fields, 'name')),
      rowOffs = this.getRowOffset(),
      bin = this.bin;
  return function(r) {
    var rec = {},
        offs = rowOffs(r),
        field;
    for (var c=0, cols=fields.length; c<cols; c++) {
      field = fields[c];
      bin.position(offs + field.columnOffset);
      rec[uniqNames[c]] = readers[c](bin, field.size);
    }
    return rec;
  };
};

// @f Field metadata from dbf header
DbfReader.prototype.getFieldReader = function(f) {
  var type = f.type,
      r = null;
  if (type == 'I') {
    r = Dbf.readInt;
  } else if (type == 'F' || type == 'N') {
    r = Dbf.readNumber;
  } else if (type == 'L') {
    r = Dbf.readBool;
  } else if (type == 'D') {
    r = Dbf.readDate;
  } else if (type == 'C') {
    r = Dbf.getStringReader(this.getEncoding());
  } else {
    message("[dbf] Field \"" + field.name + "\" has an unsupported type (" + field.type + ") -- converting to null values");
    r = function() {return null;};
  }
  return r;
};

DbfReader.prototype.readRows = function() {
  var data = [],
      reader = this.getRecordReader(this.header);
  for (var r=0, rows=this.rows(); r<rows; r++) {
    data.push(reader(r));
  }
  return data;
};

DbfReader.prototype.readHeader = function(bin, encoding) {
  bin.position(0).littleEndian();
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
    ldid: bin.readUint8()
  };
  var colOffs = 1; // first column starts on second byte of record
  var field;
  bin.skipBytes(2);
  header.fields = [];
  // stop at ascii newline or carriage return (LF is standard, CR has been used)
  while (bin.peek() != 0x0D && bin.peek() != 0x0A) {
    field = this.readFieldHeader(bin, encoding);
    field.columnOffset = colOffs;
    header.fields.push(field);
    colOffs += field.size;
  }
  if (colOffs != header.recordSize)
    error("Record length mismatch; header:", header.recordSize, "detected:", colOffs);
  return header;
};

DbfReader.prototype.readFieldHeader = function(bin, encoding) {
  return {
    name: bin.readCString(11),
    type: String.fromCharCode(bin.readUint8()),
    address: bin.readUint32(),
    size: bin.readUint8(),
    decimals: bin.readUint8(),
    id: bin.skipBytes(2).readUint8(),
    position: bin.skipBytes(2).readUint8(),
    indexFlag: bin.skipBytes(7).readUint8()
  };
};

// export for testing
MapShaper.Dbf = Dbf;
MapShaper.DbfReader = DbfReader;
