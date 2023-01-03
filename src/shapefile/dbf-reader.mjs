import { detectEncoding, decodeSamples } from '../text/mapshaper-encoding-detection';
import utils from '../utils/mapshaper-utils';
import { bufferToString, standardizeEncodingName, decodeString } from '../text/mapshaper-encodings';
import { formatStringsAsGrid, stop, message, error, verbose } from '../utils/mapshaper-logging';
import { getUniqFieldNames } from '../datatable/mapshaper-data-utils';
import { FileReader, BufferReader } from '../io/mapshaper-file-reader';

// DBF format references:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.clicketyclick.dk/databases/xbase/format/index.html
// http://www.clicketyclick.dk/databases/xbase/format/data_types.html
// esri docs:
// https://support.esri.com/en/technical-article/000007920
// https://desktop.arcgis.com/en/arcmap/latest/manage-data/shapefiles/geoprocessing-considerations-for-shapefile-output.htm

// source: http://webhelp.esri.com/arcpad/8.0/referenceguide/index.htm#locales/task_code.htm
var languageIds = [0x01,'437',0x02,'850',0x03,'1252',0x08,'865',0x09,'437',0x0A,'850',0x0B,'437',0x0D,'437',0x0E,'850',0x0F,'437',0x10,'850',0x11,'437',0x12,'850',0x13,'932',0x14,'850',0x15,'437',0x16,'850',0x17,'865',0x18,'437',0x19,'437',0x1A,'850',0x1B,'437',0x1C,'863',0x1D,'850',0x1F,'852',0x22,'852',0x23,'852',0x24,'860',0x25,'850',0x26,'866',0x37,'850',0x40,'852',0x4D,'936',0x4E,'949',0x4F,'950',0x50,'874',0x57,'1252',0x58,'1252',0x59,'1252',0x64,'852',0x65,'866',0x66,'865',0x67,'861',0x6A,'737',0x6B,'857',0x6C,'863',0x78,'950',0x79,'949',0x7A,'936',0x7B,'932',0x7C,'874',0x86,'737',0x87,'852',0x88,'857',0xC8,'1250',0xC9,'1251',0xCA,'1254',0xCB,'1253',0xCC,'1257'];

// Language & Language family names for some code pages
var encodingNames = {
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

var ENCODING_PROMPT =
  "To set the text encoding, re-import using the \"encoding=\" option.\n" +
  "To list the supported encodings, run the \"encodings\" command.";

function lookupCodePage(lid) {
  var i = languageIds.indexOf(lid);
  return i == -1 ? null : languageIds[i+1];
}

// function readAsciiString(bin, size) {
//   var require7bit = true;
//   var str = bin.readCString(size, require7bit);
//   if (str === null) {
//     stop("DBF file contains non-ascii text.\n" + ENCODING_PROMPT);
//   }
//   return utils.trim(str);
// }

function readStringBytes(bin, size, buf) {
  var start = bin.position();
  var count = 0, c;
  for (var i=0; i<size; i++) {
    c = bin.readUint8();
    // treating 0 as C-style string terminator (observed in-the-wild)
    // TODO: in some encodings (e.g. utf-16) the 0-byte occurs in other
    //   characters than the NULL character (ascii 0). The following code
    //   should be changed to support non-ascii-compatible encodings
    if (c === 0) break;
    if (count > 0 || c != 32) { // ignore leading spaces (e.g. DBF numbers)
      buf[count++] = c;
    }
  }
  // ignore trailing spaces (DBF string fields are typically r-padded w/ spaces)
  while (count > 0 && buf[count-1] == 32) {
    count--;
  }
  bin.position(start + size);
  return count;
}


function getStringReader(arg) {
  var encoding = arg || 'ascii';
  var slug = standardizeEncodingName(encoding);
  var buf = utils.createBuffer(256);
  var inNode = typeof module == 'object';

  // optimization -- use (fast) native Node conversion if available
  if (inNode && (slug == 'utf8' || slug == 'ascii')) {
    return function(bin, size) {
      var n = readStringBytes(bin, size, buf);
      return buf.toString(slug, 0, n);
    };
  }

  return function readEncodedString(bin, size) {
    var n = readStringBytes(bin, size, buf),
        str = '', i, c;
    // optimization: fall back to text decoder only if string contains non-ascii bytes
    // (data files of any encoding typically contain mostly ascii fields)
    // TODO: verify this assumption - some supported encodings may not be ascii-compatible
    for (i=0; i<n; i++) {
      c = buf[i];
      if (c > 127) {
        return bufferToString(buf, encoding, 0, n);
      }
      str += String.fromCharCode(c);
    }
    return str;
  };
}

function bufferContainsHighBit(buf, n) {
  for (var i=0; i<n; i++) {
    if (buf[i] >= 128) return true;
  }
  return false;
}

function getNumberReader() {
  var read = getStringReader('ascii');
  return function readNumber(bin, size) {
    var str = read(bin, size);
    var val;
    if (str.indexOf(',') >= 0) {
      str = str.replace(',', '.'); // handle comma decimal separator
    }
    val = parseFloat(str);
    return isNaN(val) ? null : val;
  };
}

function readInt(bin, size) {
  return bin.readInt32();
}

function readBool(bin, size) {
  var c = bin.readCString(size),
      val = null;
  if (/[ty]/i.test(c)) val = true;
  else if (/[fn]/i.test(c)) val = false;
  return val;
}

function readDate(bin, size) {
  var str = bin.readCString(size),
      yr = str.substr(0, 4),
      mo = str.substr(4, 2),
      day = str.substr(6, 2);
  return new Date(Date.UTC(+yr, +mo - 1, +day));
}

// cf. http://code.google.com/p/stringencoding/
//
// @src is a Buffer or ArrayBuffer or filename
//
export default function DbfReader(src, encodingArg) {
  var opts = {
    cacheSize: 0x2000000, // 32MB
    bufferSize: 0x400000 // 4MB
  };
  var dbfFile = utils.isString(src) ? new FileReader(src, opts) : new BufferReader(src);
  var header = readHeader(dbfFile);

  // encoding and fields are set on first access
  var fields;
  var encoding;

  this.size = function() {return header.recordCount;};

  this.readRow = function(i) {
    // create record reader on-the-fly
    // (delays encoding detection until we need to read data)
    return getRecordReader()(i);
  };

  this.getFields = getFieldNames;

  // TODO: switch to streaming output under Node.js
  this.getBuffer = function() {
    return dbfFile.readSync(0, dbfFile.size());
  };

  this.deleteField = function(f) {
    prepareToRead();
    fields = fields.filter(function(field) {
      return field.name != f;
    });
  };

  this.readRows = function() {
    var reader = getRecordReader();
    var data = [];
    for (var r=0, n=this.size(); r<n; r++) {
      data.push(reader(r));
    }
    return data;
  };

  // Prepare to read from table:
  // * determine encoding
  // * convert encoded field names to strings
  //   (DBF standard is ascii names, but ArcGIS etc. support encoded names)
  //
  function prepareToRead() {
    if (fields) return; // already initialized
    var headerEncoding = 'ascii';
    initEncoding();
    if (getNonAsciiHeaders().length > 0) {
      headerEncoding = getEncoding();
    }
    fields = header.fields.map(function(f) {
      var copy = utils.extend({}, f);
      copy.name = decodeString(f.namebuf, headerEncoding);
      return copy;
    });
    // Uniqify header names
    getUniqFieldNames(utils.pluck(fields, 'name')).forEach(function(name2, i) {
      fields[i].name = name2;
    });
  }

  function readHeader(reader) {
    // fetch enough bytes to accomodate any header
    var maxHeaderLen = 32 * 256 + 1; // 255 fields * fieldRecSize + headerRecSize + terminator
    var bin = reader.readToBinArray(0, Math.min(maxHeaderLen, reader.size()));
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
      message('Found a non-standard DBF header terminator (' + bin.peek() + '). DBF file may be corrupted.');
    }

    return header;
  }

  function readFieldHeader(bin) {
    var buf = utils.createBuffer(11);
    var chars = readStringBytes(bin, 11, buf);
    return {
      // name: bin.readCString(11),
      namebuf: utils.createBuffer(buf.slice(0, chars)),
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
    prepareToRead();
    return utils.pluck(fields, 'name');
  }

  function getRowOffset(r) {
    return header.dataOffset + header.recordSize * r;
  }

  function initEncoding() {
    if (encoding) return;
    encoding = encodingArg || findStringEncoding();
  }

  function getEncoding() {
    initEncoding();
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

  // function findEofPos(bin) {
  //   var pos = bin.size() - 1;
  //   if (bin.peek(pos) != 0x1A) { // last byte may or may not be EOF
  //     pos++;
  //   }
  //   return pos;
  // }

  function getRecordReader() {
    prepareToRead();
    var readers = fields.map(getFieldReader),
        create = getRecordConstructor(),
        values = [];

    return function readRow(r) {
      var bin = dbfFile.readToBinArray(getRowOffset(r), header.recordSize),
          rowOffs = bin.position(),
          fieldOffs, field;
      if (bin.bytesLeft() < header.recordSize ||
          bin.bytesLeft() == header.recordSize && bin.peek(bin.size() - 1) == 0x1A) {
        // check for observed data error: last data byte contains EOF
        stop('Invalid DBF file: encountered end-of-file while reading data');
      }
      for (var c=0, cols=fields.length; c<cols; c++) {
        field = fields[c];
        fieldOffs = rowOffs + field.columnOffset;
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
      r = readInt;
    } else if (type == 'F' || type == 'N') {
      r = getNumberReader();
    } else if (type == 'L') {
      r = readBool;
    } else if (type == 'D') {
      r = readDate;
    } else if (type == 'C') {
      r = getStringReader(getEncoding());
    } else {
      message("Field \"" + f.name + "\" has an unsupported type (" + f.type + ") -- converting to null values");
      r = function() {return null;};
    }
    return r;
  }

  function findStringEncoding() {
    var ldid = header.ldid,
        codepage = lookupCodePage(ldid),
        samples = getNonAsciiSamples(),
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
      var info = detectEncoding(samples);
      encoding = info.encoding;
      if (info.confidence < 2) {
        msg = 'Warning: Unable to auto-detect the text encoding of a DBF file with high confidence.';
        msg += '\n\nDefaulting to: ' + encoding + (encoding in encodingNames ? ' (' + encodingNames[encoding] + ')' : '');
        msg += '\n\nSample of how non-ascii text was imported:';
        msg += '\n' + formatStringsAsGrid(decodeSamples(encoding, samples).split('\n'));
        msg += decodeSamples(encoding, samples);
        msg += '\n\n' + ENCODING_PROMPT + '\n';
        message(msg);
      }
    }

    // Show a sample of decoded text if non-ascii-range text has been found
    // if (encoding && samples.length > 0) {
    //   msg = "Detected DBF text encoding: " + encoding + (encoding in encodingNames ? " (" + encodingNames[encoding] + ")" : "");
    //   message(msg);
    //   msg = decodeSamples(encoding, samples);
    //   msg = formatStringsAsGrid(msg.split('\n'));
    //   msg = "\nSample text containing non-ascii characters:" + (msg.length > 60 ? '\n' : '') + msg;
    //   verbose(msg);
    // }
    return encoding;
  }

  function getNonAsciiHeaders() {
    var arr = [];
    header.fields.forEach(function(f) {
      if (bufferContainsHighBit(f.namebuf, f.namebuf.length)) {
        arr.push(f.namebuf);
      }
    });
    return arr;
  }

  // Return an array of buffers containing text samples
  // with at least one byte outside the 7-bit ascii range.
  function getNonAsciiSamples() {
    var samples = [];
    var stringFields = header.fields.filter(function(f) {
      return f.type == 'C';
    });
    var cols = stringFields.length;
    // don't scan all the rows in large files (slow)
    var rows = Math.min(header.recordCount, 10000);
    var maxSamples = 50;
    var buf = utils.createBuffer(256);
    var index = {};
    var f, chars, sample, hash, bin, rowOffs;
    // include non-ascii field names, if any
    samples = getNonAsciiHeaders();
    for (var r=0; r<rows; r++) {
      bin = dbfFile.readToBinArray(getRowOffset(r), header.recordSize);
      rowOffs = bin.position();
      for (var c=0; c<cols; c++) {
        if (samples.length >= maxSamples) break;
        f = stringFields[c];
        // bin.position(getRowOffset(r) + f.columnOffset);
        bin.position(rowOffs + f.columnOffset);
        chars = readStringBytes(bin, f.size, buf);
        if (chars > 0 && bufferContainsHighBit(buf, chars)) {
          sample = utils.createBuffer(buf.slice(0, chars)); //
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
