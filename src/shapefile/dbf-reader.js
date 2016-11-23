/* @requires
mapshaper-encodings
mapshaper-encoding-detection
mapshaper-data-utils
*/

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
  var require7bit = true;
  var str = bin.readCString(size, require7bit);
  if (str === null) {
    stop("DBF file contains non-ascii text.\n" + Dbf.ENCODING_PROMPT);
  }
  return utils.trim(str);
};

Dbf.readStringBytes = function(bin, size, buf) {
  var count = 0, c;
  for (var i=0; i<size; i++) {
    c = bin.readUint8();
    if (c === 0) break; // C string-terminator (observed in-the-wild)
    if (count > 0 || c != 32) { // ignore leading spaces (e.g. DBF numbers)
      buf[count++] = c;
    }
  }
  // ignore trailing spaces (DBF string fields are typically r-padded w/ spaces)
  while (count > 0 && buf[count-1] == 32) {
    count--;
  }
  return count;
};

Dbf.getAsciiStringReader = function() {
  var buf = new Uint8Array(256); // new Buffer(256);
  return function readAsciiString(bin, size) {
    var str = '',
        n = Dbf.readStringBytes(bin, size, buf);
    for (var i=0; i<n; i++) {
      str += String.fromCharCode(buf[i]);
    }
    return str;
  };
};

Dbf.getEncodedStringReader = function(encoding) {
  var buf = new Buffer(256),
      isUtf8 = MapShaper.standardizeEncodingName(encoding) == 'utf8';
  return function readEncodedString(bin, size) {
    var i = Dbf.readStringBytes(bin, size, buf),
        str;
    if (i === 0) {
      str = '';
    } else if (isUtf8) {
      str = buf.toString('utf8', 0, i);
    } else {
      str = MapShaper.decodeString(buf.slice(0, i), encoding); // slice references same memory
    }
    return str;
  };
};

Dbf.getStringReader = function(encoding) {
  if (!encoding || encoding === 'ascii') {
    return Dbf.getAsciiStringReader();
    // return Dbf.readAsciiString;
  } else {
    return Dbf.getEncodedStringReader(encoding);
  }
};

Dbf.bufferContainsHighBit = function(buf, n) {
  for (var i=0; i<n; i++) {
    if (buf[i] >= 128) return true;
  }
  return false;
};

Dbf.getNumberReader = function() {
  var read = Dbf.getAsciiStringReader();
  return function readNumber(bin, size) {
    var str = read(bin, size);
    var val;
    if (str.indexOf(',') >= 0) {
      str = str.replace(',', '.'); // handle comma decimal separator
    }
    val = parseFloat(str);
    return isNaN(val) ? null : val;
  };
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
function DbfReader(src, encodingArg) {
  if (utils.isString(src)) {
    error("[DbfReader] Expected a buffer, not a string");
  }
  var bin = new BinArray(src);
  var header = readHeader(bin);
  var encoding = encodingArg || null;

  this.size = function() {return header.recordCount;};

  this.readRow = function(i) {
    // create record reader on-the-fly
    // (delays encoding detection until we need to read data)
    return getRecordReader(header.fields)(i);
  };

  this.getFields = getFieldNames;

  this.getBuffer = function() {return bin.buffer();};

  this.deleteField = function(f) {
    header.fields = header.fields.filter(function(field) {
      return field.name != f;
    });
  };

  this.readRows = function() {
    var reader = getRecordReader(header.fields);
    var data = [];
    for (var r=0, n=this.size(); r<n; r++) {
      data.push(reader(r));
    }
    return data;
  };

  function readHeader(bin) {
    bin.position(0).littleEndian();
    var header = {
      version: bin.readInt8(),
      updateYear: bin.readUint8(),
      updateMonth: bin.readUint8(),
      updateDay: bin.readUint8(),
      recordCount: bin.readUint32(),
      dataOffset: bin.readUint16(),
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

    // Detect header terminator (LF is standard, CR has been seen in the wild)
    while (bin.peek() != 0x0D && bin.peek() != 0x0A && bin.position() < header.dataOffset - 1) {
      field = readFieldHeader(bin);
      field.columnOffset = colOffs;
      header.fields.push(field);
      colOffs += field.size;
    }
    if (colOffs != header.recordSize) {
      error("Record length mismatch; header:", header.recordSize, "detected:", colOffs);
    }
    if (bin.peek() != 0x0D) {
      message('[dbf] Found a non-standard header terminator (' + bin.peek() + '). DBF file may be corrupted.');
    }

    // Uniqify header names
    MapShaper.getUniqFieldNames(utils.pluck(header.fields, 'name')).forEach(function(name2, i) {
      header.fields[i].name = name2;
    });

    return header;
  }

  function readFieldHeader(bin) {
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
  }

  function getFieldNames() {
    return utils.pluck(header.fields, 'name');
  }

  function getRowOffset(r) {
    return header.dataOffset + header.recordSize * r;
  }

  function getEncoding() {
    if (!encoding) {
      encoding = findStringEncoding();
      if (!encoding) {
        // fall back to utf8 if detection fails (so GUI can continue without further errors)
        encoding = 'utf8';
        stop("Unable to auto-detect the text encoding of the DBF file.\n" + Dbf.ENCODING_PROMPT);
      }
    }
    return encoding;
  }

  // Create new record objects using object literal syntax
  // (Much faster in v8 and other engines than assigning a series of properties
  //  to an object)
  function getRecordConstructor() {
    var args = getFieldNames().map(function(name, i) {
          return JSON.stringify(name) + ': arguments[' + i + ']';
        });
    return new Function('return {' + args.join(',') + '};');
  }

  function findEofPos(bin) {
    var pos = bin.size() - 1;
    if (bin.peek(pos) != 0x1A) { // last byte may or may not be EOF
      pos++;
    }
    return pos;
  }

  function getRecordReader(fields) {
    var readers = fields.map(getFieldReader),
        eofOffs = findEofPos(bin),
        create = getRecordConstructor(),
        values = [];

    return function readRow(r) {
      var offs = getRowOffset(r),
          fieldOffs, field;
      for (var c=0, cols=fields.length; c<cols; c++) {
        field = fields[c];
        fieldOffs = offs + field.columnOffset;
        if (fieldOffs + field.size > eofOffs) {
          stop('[dbf] Invalid DBF file: encountered end-of-file while reading data');
        }
        bin.position(fieldOffs);
        values[c] = readers[c](bin, field.size);
      }
      return create.apply(null, values);
    };
  }

  // @f Field metadata from dbf header
  function getFieldReader(f) {
    var type = f.type,
        r = null;
    if (type == 'I') {
      r = Dbf.readInt;
    } else if (type == 'F' || type == 'N') {
      r = Dbf.getNumberReader();
    } else if (type == 'L') {
      r = Dbf.readBool;
    } else if (type == 'D') {
      r = Dbf.readDate;
    } else if (type == 'C') {
      r = Dbf.getStringReader(getEncoding());
    } else {
      message("[dbf] Field \"" + field.name + "\" has an unsupported type (" + field.type + ") -- converting to null values");
      r = function() {return null;};
    }
    return r;
  }

  function findStringEncoding() {
    var ldid = header.ldid,
        codepage = Dbf.lookupCodePage(ldid),
        samples = getNonAsciiSamples(50),
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
      message(msg);
      msg = MapShaper.decodeSamples(encoding, samples);
      msg = MapShaper.formatStringsAsGrid(msg.split('\n'));
      message("Sample text containing non-ascii characters:" + (msg.length > 60 ? '\n' : '') + msg);
    }
    return encoding;
  }

  // Return up to @size buffers containing text samples
  // with at least one byte outside the 7-bit ascii range.
  function getNonAsciiSamples(size) {
    var samples = [];
    var stringFields = header.fields.filter(function(f) {
      return f.type == 'C';
    });
    var buf = new Buffer(256);
    var index = {};
    var f, chars, sample, hash;
    for (var r=0, rows=header.recordCount; r<rows; r++) {
      for (var c=0, cols=stringFields.length; c<cols; c++) {
        if (samples.length >= size) break;
        f = stringFields[c];
        bin.position(getRowOffset(r) + f.columnOffset);
        chars = Dbf.readStringBytes(bin, f.size, buf);
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
  }

}
