
import { encodeString, decodeString, stringIsAscii } from '../text/mapshaper-encodings';
import { findFieldNames, getUniqFieldNames } from '../datatable/mapshaper-data-utils';
import { error, message, warn } from '../utils/mapshaper-logging';
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

// Truncate and dedup field names so they fit Shapefile's 10-character DBF
// limit, and surface a one-shot summary so users notice rather than having
// downstream joins/scripts fail silently against the new names.
function convertFieldNames(names, encoding) {
  var cleaned = names.map(cleanFieldName);
  var names2 = getUniqFieldNames(cleaned, 10, encoding);

  // Group renames by category so the message is informative without being
  // noisy. cleanedOnly is just whitespace/dash -> underscore (low signal);
  // truncated and collided both shorten the name to <= 10 bytes, with
  // collided being the highest-signal case (two long names collapsed onto
  // each other and one had to be suffixed to stay unique).
  var cleanedOnly = [];
  var truncated = [];
  var collided = [];

  // Two cleaned names collide if they share their first-10-byte prefix in
  // the target encoding. Cheaper to bucket than to re-derive from names2.
  var prefixCounts = {};
  cleaned.forEach(function(c) {
    var key = encodedFieldNameKey(c, encoding);
    prefixCounts[key] = (prefixCounts[key] || 0) + 1;
  });

  names.forEach(function(orig, i) {
    var cleanedName = cleaned[i];
    var finalName = names2[i];
    if (orig === finalName) return;
    if (cleanedName === finalName) {
      cleanedOnly.push({from: orig, to: finalName});
    } else if (prefixCounts[encodedFieldNameKey(cleanedName, encoding)] > 1) {
      collided.push({from: orig, to: finalName});
    } else {
      truncated.push({from: orig, to: finalName});
    }
  });

  if (collided.length > 0) {
    warn('Field names collided after Shapefile\'s 10-character DBF limit; ' +
      'a numeric suffix was appended to keep the colliding names unique. ' +
      'Use -rename-fields to avoid automatic renaming.\n' +
      formatRenameList(collided));
  }
  if (truncated.length > 0) {
    warn('Field names were truncated to fit Shapefile\'s 10-character DBF limit:\n' +
      formatRenameList(truncated));
  }
  if (cleanedOnly.length > 0) {
    message('Field names cleaned for Shapefile DBF compatibility:\n' +
      formatRenameList(cleanedOnly));
  }
  return names2;
}

function formatRenameList(pairs) {
  return pairs.map(function(p) {
    return '  ' + p.from + ' -> ' + p.to;
  }).join('\n');
}

// Approximate the bucket a field name would occupy in the truncated DBF
// header. For ASCII this is just the first 10 chars; for multi-byte
// encodings we have to count bytes, since the DBF header limit is 10
// *bytes* (one Chinese char in UTF-8 is three bytes, hence the existing
// test cases expecting 3-char and 5-char prefixes).
function encodedFieldNameKey(name, encoding) {
  if (!encoding || encoding == 'ascii' || stringIsAscii(name)) {
    return name.substr(0, 10);
  }
  var encoded = encodeString(name, encoding);
  var truncated = encoded.length > 10 ? encoded.slice(0, 10) : encoded;
  // Decode and re-encode so partial multi-byte sequences at the boundary
  // collapse the same way the writer would handle them.
  return decodeString(truncated, encoding);
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
