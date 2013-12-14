/* @requires mshp-common-lib, dbf-reader */

Dbf.exportRecords = function(arr) {
  var fields = Utils.keys(arr[0]);
  var rows = arr.length;
  var fieldData = Utils.map(fields, function(name) {
    return Dbf.getFieldInfo(arr, name);
  });

  var headerBytes = Dbf.getHeaderSize(fieldData.length),
      recordBytes = Dbf.getRecordSize(Utils.pluck(fieldData, 'size')),
      fileBytes = headerBytes + rows * recordBytes + 1;

  var buffer = new ArrayBuffer(fileBytes);
  var bin = new BinArray(buffer).littleEndian();
  var now = new Date();
  var writers = Utils.map(fieldData, function(obj) {
    return Dbf.getFieldWriter(obj, bin);
  });

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
  Utils.reduce(fieldData, function(recordOffset, obj) {
    var fieldName = Dbf.getValidFieldName(obj.name);
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

  Utils.forEach(arr, function(rec, i) {
    var start = bin.position(),
        info, writer;
    bin.writeUint8(0x20); // delete flag; 0x20 valid 0x2a deleted
    for (var i=0, n=fieldData.length; i<n; i++) {
      info = fieldData[i];
      writer = writers[i];
      writer(rec[info.name]);
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
  return Utils.sum(fieldSizes) + 1; // delete byte plus data bytes
};

Dbf.getValidFieldName = function(name) {
  // TODO: handle non-ascii chars in name
  return name.substr(0, 10); // max 10 chars
};

Dbf.getFieldInfo = function(arr, name) {
  var type = this.discoverFieldType(arr, name),
      data,
      info = {
        name: name,
        decimals: 0
      };

  if (type == 'number') {
    var INTEGER_SUPPORT = false; // Arc doesn't support type I data!
    var MAX_INT = Math.pow(2, 31) -1,
        MIN_INT = ~MAX_INT,
        MAX_NUM = 99999999999999999,
        MAX_FIELD_SIZE = 19;
    data = this.getNumericFieldInfo(arr, name);
    info.decimals = data.decimals;
    if (!INTEGER_SUPPORT || info.decimals > 0 || data.min < MIN_INT || data.max > MAX_INT) {
      info.type = 'N';
      var maxSize = data.max.toFixed(info.decimals).length,
          minSize = data.min.toFixed(info.decimals).length;
      info.size = Math.max(maxSize, minSize);
      if (info.size > MAX_FIELD_SIZE) {
        info.size = MAX_FIELD_SIZE;
        info.decimals -= info.size - MAX_FIELD_SIZE;
        if (info.decimals < 0) {
          error ("Dbf#getFieldInfo() Out-of-range error.");
        }
      }
    } else {
      info.type = 'I';
      info.size = 4;
    }
  } else if (type == 'string') {
    info.type = 'C';
    info.size = this.discoverStringFieldLength(arr, name);
  } else {
    error("[dbf] Type error exporting field:", name);
  }
  return info;
};

Dbf.discoverFieldType = function(arr, name) {
  var val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (Utils.isString(val)) return "string";
    if (Utils.isNumber(val)) return "number";
    if (Utils.isBoolean(val)) return "boolean";
  }
  return "null" ;
};

Dbf.getFieldWriter = function(obj, bin) {
  var formatter,
      writer;
  if (obj.type == 'C') {
    writer = function(val) {
      var str = String(val);
      bin.writeCString(str, obj.size);
    };
  } else if (obj.type == 'N') {
    formatter = Dbf.getDecimalFormatter(obj.size, obj.decimals);
    writer = function(val) {
      var str = formatter(val);
      bin.writeString(str, obj.size);
    };
  } else if (obj.type == 'I') {
    writer = function(val) {
      bin.writeInt32(val | 0);
    };
  } else {
    error("Dbf#getFieldWriter() Unsupported DBF type:", obj.type);
  }
  return writer;
}

Dbf.getDecimalFormatter = function(size, decimals) {
  return function(val) {
    // TODO: handle invalid values better
    var val = isFinite(val) ? val.toFixed(decimals) : '';
    return Utils.lpad(val, size, ' ');
  };
};

Dbf.getNumericFieldInfo = function(arr, name) {
  var maxDecimals = 0,
      limit = 15,
      min = Infinity,
      max = -Infinity,
      validCount = 0,
      k = 1,
      val, decimals;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (!Number.isFinite(val)) {
      continue;
    }
    decimals = 0;
    validCount++;
    if (val < min) min = val;
    if (val > max) max = val;
    while (val * k % 1 !== 0) {
      if (decimals == limit) {
        // TODO: verify limit, remove oflo message, round overflowing values
        trace ("#getNumericFieldInfo() Number field overflow; value:", val)
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

Dbf.discoverStringFieldLength = function(arr, name) {
  var maxlen = 0,
      len;
  for (var i=0, n=arr.length; i<n; i++) {
    len = String(arr[i][name]).length;
    if (len > maxlen) {
      maxlen = len;
    }
  }
  if (maxlen > 254) maxlen = 254;
  return maxlen + 1;
};
