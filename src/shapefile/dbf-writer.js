
import { encodeString, decodeString, stringIsAscii } from '../text/mapshaper-encodings';
import { findFieldNames, getUniqFieldNames } from '../datatable/mapshaper-data-utils';
import { error, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { BinArray } from '../utils/mapshaper-binarray';
var Dbf = {};
var MAX_STRING_LEN = 254;
export default Dbf;

Dbf.MAX_STRING_LEN = MAX_STRING_LEN;
Dbf.convertValueToString = convertValueToString;
Dbf.convertFieldNames = convertFieldNames;
Dbf.discoverFieldType = discoverFieldType;
Dbf.getDecimalFormatter = getDecimalFormatter;
Dbf.getNumericFieldInfo = getNumericFieldInfo;
Dbf.truncateEncodedString = truncateEncodedString;
Dbf.getFieldInfo = getFieldInfo;
Dbf.exportRecords = exportRecords;

function BufferPool() {
  var n = 5000,
      pool, i;
  newPool();

  function newPool() {
    pool = new Uint8Array(n);
    i = 0;
  }

  return {
    reserve: function(bytes) {
      if (i + bytes > n) newPool();
      i += bytes;
      return pool.subarray(i - bytes, i);
    },
    putBack: function(bytes) {
      i -= bytes;
    }
  };
}

var bufferPool = new BufferPool();

function exportRecords(records, encoding, fieldOrder) {
  var rows = records.length;
  var fields = findFieldNames(records, fieldOrder);
  var dataEncoding = encoding || 'utf8';
  var headerEncoding = stringIsAscii(fields.join('')) ? 'ascii' : dataEncoding;
  var fieldNames = convertFieldNames(fields, headerEncoding);
  var fieldBuffers = encodeFieldNames(fieldNames, headerEncoding); // array of 11-byte buffers
  var fieldData = fields.map(function(name, i) {
    var info = getFieldInfo(records, name, dataEncoding);
    if (info.warning) {
      message('[' + name + '] ' + info.warning);
    }
    return info;
  });

  var headerBytes = getHeaderSize(fieldData.length),
      recordBytes = getRecordSize(utils.pluck(fieldData, 'size')),
      fileBytes = headerBytes + rows * recordBytes + 1;

  var buffer = new ArrayBuffer(fileBytes);
  var bin = new BinArray(buffer).littleEndian();
  var now = new Date();

  // write header
  bin.writeUint8(3);
  bin.writeUint8(now.getFullYear() - 1900);
  bin.writeUint8(now.getMonth() + 1);
  bin.writeUint8(now.getDate());
  bin.writeUint32(rows);
  bin.writeUint16(headerBytes);
  bin.writeUint16(recordBytes);
  bin.skipBytes(17);
  bin.writeUint8(0); // language flag; TODO: improve this
  bin.skipBytes(2);


  // field subrecords
  fieldData.reduce(function(recordOffset, obj, i) {
    // bin.writeCString(obj.name, 11);
    bin.writeBuffer(fieldBuffers[i], 11, 0);
    bin.writeUint8(obj.type.charCodeAt(0));
    bin.writeUint32(recordOffset);
    bin.writeUint8(obj.size);
    bin.writeUint8(obj.decimals);
    bin.skipBytes(14);
    return recordOffset + obj.size;
  }, 1);

  bin.writeUint8(0x0d); // "field descriptor terminator"
  if (bin.position() != headerBytes) {
    error("Dbf#exportRecords() header size mismatch; expected:", headerBytes, "written:", bin.position());
  }

  records.forEach(function(rec, i) {
    var start = bin.position();
    bin.writeUint8(0x20); // delete flag; 0x20 valid 0x2a deleted
    for (var j=0, n=fieldData.length; j<n; j++) {
      fieldData[j].write(i, bin);
    }
    if (bin.position() - start != recordBytes) {
      error("#exportRecords() Error exporting record:", rec);
    }
  });

  bin.writeUint8(0x1a); // end-of-file

  if (bin.position() != fileBytes) {
    error("Dbf#exportRecords() file size mismatch; expected:", fileBytes, "written:", bin.position());
  }
  return buffer;
}

function getHeaderSize(numFields) {
  return 33 + numFields * 32;
}

function getRecordSize(fieldSizes) {
  return utils.sum(fieldSizes) + 1; // delete byte plus data bytes
}

function initNumericField(info, arr, name) {
  var MAX_FIELD_SIZE = 18,
      data, size;

  data = getNumericFieldInfo(arr, name);
  info.decimals = data.decimals;
  size = Math.max(data.max.toFixed(info.decimals).length,
      data.min.toFixed(info.decimals).length);
  if (size > MAX_FIELD_SIZE) {
    size = MAX_FIELD_SIZE;
    info.decimals -= size - MAX_FIELD_SIZE;
    if (info.decimals < 0) {
      error ("Dbf#getFieldInfo() Out-of-range error.");
    }
  }
  info.size = size;

  var formatter = getDecimalFormatter(size, info.decimals);
  info.write = function(i, bin) {
    var rec = arr[i],
        str = formatter(rec[name]);
    if (str.length < size) {
      str = utils.lpad(str, size, ' ');
    }
    bin.writeString(str, size);
  };
}

function initBooleanField(info, arr, name) {
  info.size = 1;
  info.write = function(i, bin) {
    var val = arr[i][name],
        c;
    if (val === true) c = 'T';
    else if (val === false) c = 'F';
    else c = '?';
    bin.writeString(c);
  };
}

function initDateField(info, arr, name) {
  info.size = 8;
  info.write = function(i, bin) {
    var d = arr[i][name],
        str;
    if (d instanceof Date === false) {
      str = '00000000';
    } else {
      str = utils.lpad(d.getUTCFullYear(), 4, '0') +
            utils.lpad(d.getUTCMonth() + 1, 2, '0') +
            utils.lpad(d.getUTCDate(), 2, '0');
    }
    bin.writeString(str);
  };
}

function convertValueToString(s) {
  return s === undefined || s === null ? '' : String(s);
}

function initStringField(info, arr, name, encoding) {
  var formatter = encoding == 'ascii' ? encodeValueAsAscii : getStringWriterEncoded(encoding);
  // Set minimum field size to 1 byte, for interoperability with PostGIS
  // (see https://github.com/mbloch/mapshaper/issues/541)
  var size = 1;
  var truncated = 0;
  var buffers = arr.map(function(rec) {
    var strval = convertValueToString(rec[name]);
    var buf = formatter(strval);
    if (buf.length > MAX_STRING_LEN) {
      if (encoding == 'ascii') {
        buf = buf.subarray(0, MAX_STRING_LEN);
      } else {
        buf = truncateEncodedString(buf, encoding, MAX_STRING_LEN);
      }
      truncated++;
    }
    size = Math.max(size, buf.length);
    return buf;
  });
  info.size = size;
  info.write = function(i, bin) {
    var buf = buffers[i],
        n = Math.min(size, buf.length),
        dest = bin._bytes,
        pos = bin.position(),
        j;
    for (j=0; j<n; j++) {
      dest[j + pos] = buf[j];
    }
    bin.position(pos + size);
  };
  if (truncated > 0) {
    info.warning = 'Truncated ' + truncated + ' string' + (truncated == 1 ? '' : 's') + ' to fit the 254-byte limit';
  }
}

// Convert string names to 11-byte buffers terminated by 0
function encodeFieldNames(names, encoding) {
  return names.map(function(name) {
    var encoded = encodeString(name, encoding);
    var encLen = encoded.length;
    var buf = utils.createBuffer(11);
    for (var i=0; i < 11; i++) {
      buf[i] = i < 10 && encLen >= i - 1 ? encoded[i] : 0;
    }
    return buf;
  });
}

// Truncate and dedup field names
//
function convertFieldNames(names, encoding) {
  var names2 = getUniqFieldNames(names.map(cleanFieldName), 10, encoding);
  names2.forEach(function(name2, i) {
    if (names[i] != name2) {
      message('Changed field name from "' + names[i] + '" to "' + name2 + '"');
    }
  });
  return names2;
}

// Replace non-alphanumeric characters with _ and merge adjacent _
// See: https://desktop.arcgis.com/en/arcmap/latest/manage-data/tables/fundamentals-of-adding-and-deleting-fields.htm#GUID-8E190093-8F8F-4132-AF4F-B0C9220F76B3
// TODO: decide whether or not to avoid initial numerals
function cleanFieldName_v1(name) {
  return name.replace(/[^A-Za-z0-9]+/g, '_');
}

// Support non-ascii field names
function cleanFieldName(name) {
  return name.replace(/[-\s]+/g, '_');
}

function getFieldInfo(arr, name, encoding) {
  var type = discoverFieldType(arr, name),
      info = {
        type: type,
        decimals: 0
      };
  if (type == 'N') {
    initNumericField(info, arr, name);
  } else if (type == 'C') {
    initStringField(info, arr, name, encoding);
  } else if (type == 'L') {
    initBooleanField(info, arr, name);
  } else if (type == 'D') {
    initDateField(info, arr, name);
  } else {
    // Treat null fields as empty numeric fields; this way, they will be imported
    // again as nulls.
    info.size = 0;
    info.type = 'N';
    if (type) {
      info.warning = 'Unable to export ' + type + '-type data, writing null values';
    }
    info.write = function() {};
  }
  return info;
}

function discoverFieldType(arr, name) {
  var val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (utils.isString(val)) return "C";
    if (utils.isNumber(val)) return "N";
    if (utils.isBoolean(val)) return "L";
    if (val instanceof Date) return "D";
    if (val) return (typeof val);
  }
  return null;
}

function getDecimalFormatter(size, decimals) {
  // TODO: find better way to handle nulls
  var nullValue = ' '; // ArcGIS may use 0
  return function(val) {
    // TODO: handle invalid values better
    var valid = utils.isFiniteNumber(val),
        strval = valid ? val.toFixed(decimals) : String(nullValue);
    return utils.lpad(strval, size, ' ');
  };
}

function getNumericFieldInfo(arr, name) {
  var min = 0,
      max = 0,
      k = 1,
      power = 1,
      decimals = 0,
      eps = 1e-15,
      val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (!utils.isFiniteNumber(val)) {
      continue;
    }
    if (val < min || val > max) {
      if (val < min) min = val;
      if (val > max) max = val;
      while (Math.abs(val) >= power) {
        power *= 10;
        eps *= 10;
      }
    }
    while (Math.abs(Math.round(val * k) - val * k) > eps) {
      if (decimals == 15) { // dbf limit
        // TODO: round overflowing values ?
        break;
      }
      decimals++;
      eps *= 10;
      k *= 10;
    }
  }
  return {
    decimals: decimals,
    min: min,
    max: max
  };
}

// return an array buffer or null if value contains non-ascii chars
function encodeValueAsAscii(val, strict) {
  var str = String(val),
      n = str.length,
      view = bufferPool.reserve(n),
      i, c;
  for (i=0; i<n; i++) {
    c = str.charCodeAt(i);
    if (c > 127) {
      if (strict) {
        view = null;
        i = 0; // return all bytes to pool
        break;
      }
      c = '?'.charCodeAt(0);
    }
    view[i] = c;
  }
  bufferPool.putBack(n-i);
  return view ? view.subarray(0, i) : null;
}

function getStringWriterEncoded(encoding) {
  return function(val) {
    // optimization -- large majority of strings in real-world datasets are
    // ascii. Try (faster) ascii encoding first, fall back to text encoder.
    var buf = encodeValueAsAscii(val, true);
    if (buf === null) {
      buf = encodeString(String(val), encoding);
    }
    return buf;
  };
}

// try to remove partial multi-byte characters from the end of an encoded string.
function truncateEncodedString(buf, encoding, maxLen) {
  var truncated = buf.slice(0, maxLen);
  var len = maxLen;
  var tmp, str;
  while (len > 0 && len >= maxLen - 3) {
    tmp = len == maxLen ? truncated : buf.slice(0, len);
    str = decodeString(tmp, encoding);
    if (str.charAt(str.length-1) != '\ufffd') {
      truncated = tmp;
      break;
    }
    len--;
  }
  return truncated;
}
