/* @requires dbf-reader, mapshaper-encodings */

Dbf.MAX_STRING_LEN = 254;

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

Dbf.bufferPool = new BufferPool();

Dbf.exportRecords = function(records, encoding, fieldOrder) {
  var rows = records.length;
  var fields = internal.findFieldNames(records, fieldOrder);
  var uniqFields = internal.getUniqFieldNames(fields, 10);
  var fieldData = fields.map(function(name, i) {
    var info = Dbf.getFieldInfo(records, name, encoding || 'utf8');
    var uniqName = uniqFields[i];
    info.name = uniqName;
    if (name != uniqName) {
      message('[' + name + '] Truncated field name to "' + uniqName + '"');
    }
    if (info.warning) {
      message('[' + name + '] ' + info.warning);
    }
    return info;
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
  fieldData.reduce(function(recordOffset, obj) {
    bin.writeCString(obj.name, 11);
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
};

Dbf.getHeaderSize = function(numFields) {
  return 33 + numFields * 32;
};

Dbf.getRecordSize = function(fieldSizes) {
  return utils.sum(fieldSizes) + 1; // delete byte plus data bytes
};

Dbf.initNumericField = function(info, arr, name) {
  var MAX_FIELD_SIZE = 18,
      data, size;

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
  var formatter = encoding == 'ascii' ? Dbf.encodeValueAsAscii : Dbf.getStringWriterEncoded(encoding);
  var size = 0;
  var truncated = 0;
  var buffers = arr.map(function(rec) {
    var buf = formatter(rec[name]);
    if (buf.length > Dbf.MAX_STRING_LEN) {
      if (encoding == 'ascii') {
        buf = buf.subarray(0, Dbf.MAX_STRING_LEN);
      } else {
        buf = Dbf.truncateEncodedString(buf, encoding, Dbf.MAX_STRING_LEN);
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
};

Dbf.getFieldInfo = function(arr, name, encoding) {
  var type = this.discoverFieldType(arr, name),
      info = {
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
    if (type) {
      info.warning = 'Unable to export ' + type + '-type data, writing null values';
    }
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
    if (val) return (typeof val);
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
};

// return an array buffer or null if value contains non-ascii chars
Dbf.encodeValueAsAscii = function(val, strict) {
  var str = String(val),
      n = str.length,
      view = Dbf.bufferPool.reserve(n),
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
  Dbf.bufferPool.putBack(n-i);
  return view ? view.subarray(0, i) : null;
};

Dbf.getStringWriterEncoded = function(encoding) {
  return function(val) {
    // optimization -- large majority of strings in real-world datasets are
    // ascii. Try (faster) ascii encoding first, fall back to text encoder.
    var buf = Dbf.encodeValueAsAscii(val, true);
    if (buf === null) {
      buf = internal.encodeString(String(val), encoding);
    }
    return buf;
  };
};

// try to remove partial multi-byte characters from the end of an encoded string.
Dbf.truncateEncodedString = function(buf, encoding, maxLen) {
  var truncated = buf.slice(0, maxLen);
  var len = maxLen;
  var tmp, str;
  while (len > 0 && len >= maxLen - 3) {
    tmp = len == maxLen ? truncated : buf.slice(0, len);
    str = internal.decodeString(tmp, encoding);
    if (str.charAt(str.length-1) != '\ufffd') {
      truncated = tmp;
      break;
    }
    len--;
  }
  return truncated;
};
