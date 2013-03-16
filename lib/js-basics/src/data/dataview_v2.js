/* @requires core, nodejs */

// BinArray gives a consistent interface for
// reading and writing from ArrayBuffers and node Buffers.
//
function BinArray(buf, le) {
  var inst;
  if (Node.inNode && buf instanceof Buffer) {
    //inst = new BufferReader(buf);
    buf = BinArray.toArrayBuffer(buf);
    inst = new ArrayBufferReader(buf);
  } else if (buf instanceof ArrayBuffer) {
    inst = new ArrayBufferReader(buf);
  } else {
    error("[BinArray] requires a Buffer or ArrayBuffer")
  }
  inst._buffer = buf;
  inst._idx = 0;
  inst._le = le !== false;
  return inst;
}

BinArray.toArrayBuffer = function(src) {
  if (src instanceof ArrayBuffer) return src;
  var ab = new ArrayBuffer(src.length);
  var dest = new Uint8Array(ab);
  for (var i = 0; i < src.length; i++) {
    dest[i] = src[i];
  }
  return ab;
};

BinArray.toNodeBuffer = function(buf) {
  if (buf instanceof Buffer) return buf;
  var src = BinArray.toByteArray(buf);
  var dest = new Buffer(src.length);
  for (var i = 0, n=src.length; i < n; i++) {
    dest[i] = src[i];
  }
  return dest;
};

BinArray.toByteArray = function(buf) {
  if (buf instanceof ArrayBuffer)
    return new Uint8Array(buf);
  if (buf instanceof Buffer || buf instanceof Uint8Array)
    return buf;
  if (buf.buffer)
    return new Uint8Array(buf.buffer);
  error("[toByteArray()] unable to convert:", buf);
};

BinArray.bufferSize = function(buf) {
  return (buf instanceof Buffer ? buf.length : buf.byteLength)
};

BinArray.prototype = {
  littleEndian: function() {
    this._le = true;
    return this;
  },

  bigEndian: function() {
    this._le = false;
    return this;
  },

  getByteArray: function() {
    return this._bytes;
  },

  toNodeBuffer: function() {
    return BinArray.toNodeBuffer(this._buffer);
  },

  bytesLeft: function() {
    return this._bytes.length - this._idx;
  },

  readUint8: function() {
    return this._bytes[this._idx++];
  },

  readInt8: function() {
    return this._bytes[this._idx++];
  },

  writeUint8: function(val) {
    this._bytes[this._idx++] = val;
    return this;
  },

  writeInt8: function(val) {
    this._bytes[this._idx++] = val;
    return this;
  },

  readUInt32Array: function(len) {
    var arr = [];
    while (len--) {
      arr.push(this.readUInt32());
    }
    return arr;
  },

  skipBytes: function(bytes) {
    this._idx += bytes | 0;
    return this;
  },

  // When backed by a node Buffer, buffer will initally contain random bytes
  // from memory --
  //
  clearBytes: function(bytes) {
    bytes = bytes > 0 ? bytes | 0 : 0;
    while (bytes--) {
      this._bytes[this._idx++] = 0;
    }
    return this;
  },

  peek: function() {
    return this._bytes[this._idx];
  },

  // TODO: validate i properly
  //
  position: function(i) {
    if (i != null) {
      this._idx = i | 0;
      return this;
    }
    return this._idx;
  },

  readCString: function(fixedLen) {
    var str = "";
    var count = 0;
    while(!fixedLen || count < fixedLen) {
      var byteVal = this.readUint8();
      count ++;
      if (byteVal == 0) {
        break;
      }
      str += String.fromCharCode(byteVal);
    }
    if (fixedLen && count < fixedLen) {
      this.skipBytes(fixedLen - count);
    }
    return str;
  },

  identical: function(buf) {
    var buf = BinArray.toByteArray(buf);
    var src = this._bytes,
        len = src.length;

    if (buf.length != len) {
      trace("[identical()] Buffers are different sizes.");
      return false;
    }

    for (var i=0; i<len; i++) {
      if (src[i] !== buf[i]) {
        return false;
      }
    }
    return true;
  },

  writeBuffer: function(buf, count, readIdx) {
    var src = BinArray.toByteArray(buf);
        srcIdx = readIdx | 0,
        dest = this.getByteArray(),
        destIdx = this._idx,
        bytes = count || src.length;

    if (this.bytesLeft() < bytes) error("[writeBuffer()] Buffer overflow; bytesLeft:", this.bytesLeft(), "bytes to write:", bytes);
    while (bytes--) {
      dest[destIdx++] = src[srcIdx++];
    }
    this._idx = destIdx;
  }
};

function BufferReader(buf) {
   this._bytes = buf;
}

BufferReader.prototype = {
  readFloat64Array: function(len) {
    var bytes = len * 8,
        ab = new ArrayBuffer(bytes),
        dest = BinArray.toByteArray(ab),
        src = this._buffer;
    for (var i=0; i<bytes; i++) {
      dest[i] = src[this._idx++];
    }
    return new Float64Array(ab);
  }
};

function ArrayBufferReader(buf) {
  this._view = new DataView(buf);
  this._bytes = new Uint8Array(buf);
}

ArrayBufferReader.prototype = {
  // TODO: optimize by skipping the slice() if bytes are aligned
  readFloat64Array: function(len) {
    var bytes = len * 8,
        // arr = new Float64Array(this._buffer.slice(this._idx, this._idx + bytes));
        arr = new Float64Array(this._buffer.slice(this._idx, this._idx + bytes));
   this._idx += bytes;
    return arr;
  }
};

Opts.copyAllParams(BufferReader.prototype, BinArray.prototype);
Opts.copyAllParams(ArrayBufferReader.prototype, BinArray.prototype);


(function() {
  Utils.forEach(
    [ "4,readInt32,readInt32LE,readInt32BE,writeInt32,writeInt32LE,writeInt32BE",
      "4,readUInt32,readUInt32LE,readUInt32BE,writeUInt32,writeUInt32LE,writeUInt32BE",
      "8,readFloat64,readDoubleLE,readDoubleBE,writeFloat64,writeDoubleLE,writeDoubleBE"
    ], function(str) {
    var parts = str.split(','),
        bytes = parseInt(parts[0]),
        readLE = Buffer.prototype[parts[2]],
        readBE = Buffer.prototype[parts[3]],
        writeLE = Buffer.prototype[parts[5]],
        writeBE = Buffer.prototype[parts[6]];

    BufferReader.prototype[parts[1]] = function() {
      var read = this._le ? readLE : readBE,
          val = read.call(this._buffer, this._idx);
      this._idx += bytes;
      return val;
    };

    BufferReader.prototype[parts[4]] = function(val) {
      var write = this._le ? writeLE : writeBE;
      write.call(this._buffer, val, this._idx);
      this._idx += bytes;
      return this;
    };
  });

  // DataView methods are not defined on DataView.prototype; need an instance.
  var _view = new DataView(new ArrayBuffer(1));

  Utils.forEach(
    [ "4,readInt32,getInt32,writeInt32,setInt32",
      "4,readUInt32,getUint32,writeUInt32,setUint32",
      "8,readFloat64,getFloat64,writeFloat64,setFloat64"
    ], function(str) {

    var parts = str.split(','),
        bytes = parseInt(parts[0]),
        read = _view[parts[2]],
        write = _view[parts[4]];

    ArrayBufferReader.prototype[parts[1]] = function() {
      var val = read.call(this._view, this._idx, this._le);
      this._idx += bytes;
      return val;
    };

    ArrayBufferReader.prototype[parts[3]] = function(val) {
      write.call(this._view, this._idx, val, this._le);
      this._idx += bytes;
      return this;
    };
  });

})();


