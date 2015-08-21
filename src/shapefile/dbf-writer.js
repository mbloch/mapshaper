/* @requires dbf-reader */

Dbf.MAX_STRING_LEN = 254;

Dbf.exportRecords = function(arr, encoding) {
  encoding = encoding || 'ascii';
  var fields = Dbf.getFieldNames(arr);
  var uniqFields = MapShaper.getUniqFieldNames(fields, 10);
  var rows = arr.length;
  var fieldData = fields.map(function(name) {
    return Dbf.getFieldInfo(arr, name, encoding);
  });

  var headerBytes = Dbf.getHeaderSize(fieldData.length),
      recordBytes = Dbf.getRecordSize(utils.pluck(fieldData, 'size')),
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
    var fieldName = uniqFields[i];
    bin.writeCString(fieldName, 11);
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

  arr.forEach(function(rec, i) {
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
};


Dbf.getFieldNames = function(records) {
  if (!records || !records.length) {
    return [];
  }
  var names = Object.keys(records[0]);
  names.sort(); // kludge: sorting gives correct order when truncating fields
  return names;
};


Dbf.getHeaderSize = function(numFields) {
  return 33 + numFields * 32;
};

Dbf.getRecordSize = function(fieldSizes) {
  return utils.sum(fieldSizes) + 1; // delete byte plus data bytes
};

/*
Dbf.getValidFieldName = function(name) {
  // TODO: handle non-ascii chars in name
  return name.substr(0, 10); // max 10 chars
};
*/

Dbf.initNumericField = function(info, arr, name) {
  var MAX_FIELD_SIZE = 18,
      size;

  data = this.getNumericFieldInfo(arr, name);
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

  var formatter = Dbf.getDecimalFormatter(size, info.decimals);
  info.write = function(i, bin) {
    var rec = arr[i],
        str = formatter(rec[name]);
    if (str.length < size) {
      str = utils.lpad(str, size, ' ');
    }
    bin.writeString(str, size);
  };
};

Dbf.initBooleanField = function(info, arr, name) {
  info.size = 1;
  info.write = function(i, bin) {
    var val = arr[i][name],
        c;
    if (val === true) c = 'T';
    else if (val === false) c = 'F';
    else c = '?';
    bin.writeString(c);
  };
};

Dbf.initDateField = function(info, arr, name) {
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
};

Dbf.initStringField = function(info, arr, name, encoding) {
  var formatter = Dbf.getStringWriter(encoding);
  var size = 0;
  var values = arr.map(function(rec) {
    var buf = formatter(rec[name]);
    size = Math.max(size, buf.byteLength);
    return buf;
  });
  info.size = size;
  info.write = function(i, bin) {
    var buf = values[i],
        bytes = Math.min(size, buf.byteLength),
        idx = bin.position();
    bin.writeBuffer(buf, bytes, 0);
    bin.position(idx + size);
  };
};

Dbf.getFieldInfo = function(arr, name, encoding) {
  var type = this.discoverFieldType(arr, name),
      info = {
        name: name,
        type: type,
        decimals: 0
      };
  if (type == 'N') {
    Dbf.initNumericField(info, arr, name);
  } else if (type == 'C') {
    Dbf.initStringField(info, arr, name, encoding);
  } else if (type == 'L') {
    Dbf.initBooleanField(info, arr, name);
  } else if (type == 'D') {
    Dbf.initDateField(info, arr, name);
  } else {
    // Treat null fields as empty numeric fields; this way, they will be imported
    // again as nulls.
    info.size = 0;
    info.type = 'N';
    info.write = function() {};
  }
  return info;
};

Dbf.discoverFieldType = function(arr, name) {
  var val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (utils.isString(val)) return "C";
    if (utils.isNumber(val)) return "N";
    if (utils.isBoolean(val)) return "L";
    if (val instanceof Date) return "D";
  }
  return null;
};

Dbf.getDecimalFormatter = function(size, decimals) {
  // TODO: find better way to handle nulls
  var nullValue = ' '; // ArcGIS may use 0
  return function(val) {
    // TODO: handle invalid values better
    var valid = utils.isFiniteNumber(val),
        strval = valid ? val.toFixed(decimals) : String(nullValue);
    return utils.lpad(strval, size, ' ');
  };
};

Dbf.getNumericFieldInfo = function(arr, name) {
  var maxDecimals = 0,
      limit = 15,
      min = Infinity,
      max = -Infinity,
      k = 1,
      val, decimals;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (!utils.isFiniteNumber(val)) {
      continue;
    }
    decimals = 0;
    if (val < min) min = val;
    if (val > max) max = val;
    while (val * k % 1 !== 0) {
      if (decimals == limit) {
        // TODO: verify limit, remove oflo message, round overflowing values
        // trace ("#getNumericFieldInfo() Number field overflow; value:", val);
        break;
      }
      decimals++;
      k *= 10;
    }
    if (decimals > maxDecimals) maxDecimals = decimals;
  }
  return {
    decimals: maxDecimals,
    min: min,
    max: max
  };
};

// Return function to convert a JS str to an ArrayBuffer containing encoded str.
Dbf.getStringWriter = function(encoding) {
  if (encoding === 'ascii') {
    return Dbf.getStringWriterAscii();
  } else {
    return Dbf.getStringWriterEncoded(encoding);
  }
};

// TODO: handle non-ascii chars. Option: switch to
// utf8 encoding if non-ascii chars are found.
Dbf.getStringWriterAscii = function() {
  return function(val) {
    var str = String(val),
        n = Math.min(str.length, Dbf.MAX_STRING_LEN),
        dest = new ArrayBuffer(n),
        view = new Uint8ClampedArray(dest);
    for (var i=0; i<n; i++) {
      view[i] = str.charCodeAt(i);
    }
    return dest;
  };
};

Dbf.getStringWriterEncoded = function(encoding) {
  var iconv = require('iconv-lite');
  return function(val) {
    var buf = iconv.encode(val, encoding);
    if (buf.length >= Dbf.MAX_STRING_LEN) {
      buf = Dbf.truncateEncodedString(buf, encoding, Dbf.MAX_STRING_LEN);
    }
    return BinArray.toArrayBuffer(buf);
  };
};

// try to remove partial multi-byte characters from the end of an encoded string.
Dbf.truncateEncodedString = function(buf, encoding, maxLen) {
  var truncated = buf.slice(0, maxLen);
  var len = maxLen;
  var tmp, str;
  while (len > 0 && len >= maxLen - 3) {
    tmp = len == maxLen ? truncated : buf.slice(0, len);
    str = MapShaper.decodeString(tmp, encoding);
    if (str.charAt(str.length-1) != '\ufffd') {
      truncated = tmp;
      break;
    }
    len--;
  }
  return truncated;
};
