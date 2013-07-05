/* @requires core */

// Wrapper for DataView class for more convenient reading and writing of
//   binary data; Remembers endianness and read/write position.
// Has convenience methods for copying from buffers, etc.
//
function BinArray(buf, le) {
  if (Utils.isNumber(buf)) {
    buf = new ArrayBuffer(buf);
  } else if (Env.inNode && buf instanceof Buffer == true) {
    // Since node 0.10, DataView constructor doesn't accept Buffers,
    //   so need to copy Buffer to ArrayBuffer
    buf = BinArray.toArrayBuffer(buf);
  }
  if (buf instanceof ArrayBuffer == false) {
    error("BinArray constructor takes an integer, ArrayBuffer or Buffer argument");
  }
  this._buffer = buf;
  this._view = new DataView(buf);
  this._idx = 0;
  this._le = le !== false;
  this._words = buf.byteLength % 4 == 0 ? new Uint32Array(buf) : null;
}

BinArray.bufferToUintArray = function(buf, wordLen) {
  if (wordLen == 4) return new Uint32Array(buf);
  if (wordLen == 2) return new Uint16Array(buf);
  if (wordLen == 1) return new Uint8Array(buf);
  error("BinArray.bufferToUintArray() invalid word length:", wordLen)
};

BinArray.maxCopySize = function(len, i) {
  return Math.min(len & 1 || len & 2 || 4, i & 1 || i & 2 || 4);
};

BinArray.toArrayBuffer = function(src) {
  var dest = new ArrayBuffer(src.length);
  for (var i = 0, n=src.length; i < n; i++) {
    dest[i] = src[i];
  }
  return dest;
};

// Return length in bytes of an ArrayBuffer or Buffer
//
BinArray.bufferSize = function(buf) {
  return (buf instanceof ArrayBuffer ?  buf.byteLength : buf.length | 0);
};

BinArray.buffersAreIdentical = function(a, b) {
  var alen = BinArray.bufferSize(a);
  var blen = BinArray.bufferSize(b);
  if (alen != blen) {
    return false;
  }
  for (var i=0; i<alen; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

BinArray.prototype = {
  size: function() {
    return this._buffer.byteLength;
  },

  littleEndian: function() {
    this._le = true;
    return this;
  },

  bigEndian: function() {
    this._le = false;
    return this;
  },

  buffer: function() {
    return this._buffer;
  },

  bytesLeft: function() {
    return this._buffer.byteLength - this._idx;
  },

  skipBytes: function(bytes) {
    this._idx += (bytes + 0);
    return this;
  },

  readUint8: function() {
    return this._view.getUint8(this._idx++);
  },

  readInt8: function() {
    return this._view.getInt8(this._idx++);
  },

  readUint16: function() {
    var val = this._view.getUint16(this._idx, this._le);
    this._idx += 2;
    return val;
  },

  writeUint16: function(val) {
    this._view.setUint16(this._idx, val, this._le);
    this._idx += 2;
    return this;
  },

  readUint32: function() {
    var val = this._view.getUint32(this._idx, this._le);
    this._idx += 4;
    return val;
  },

  writeUint32: function(val) {
    this._view.setUint32(this._idx, val, this._le);
    this._idx += 4;
    return this;
  },

  readInt32: function() {
    var val = this._view.getInt32(this._idx, this._le);
    this._idx += 4;
    return val;
  },

  writeInt32: function(val) {
    this._view.setInt32(this._idx, val, this._le);
    this._idx += 4;
    return this;
  },

  readFloat64: function() {
    var val = this._view.getFloat64(this._idx, this._le);
    this._idx += 8;
    return val;
  },

  writeFloat64: function(val) {
    this._view.setFloat64(this._idx, val, this._le);
    this._idx += 8;
    return this;
  },

  // Returns a Float64Array containing @len doubles
  //
  readFloat64Array: function(len) {
    var bytes = len * 8,
        i = this._idx;
    var arr = i % 8 === 0 ?
      // Inconsistent: first is a view, second a copy...
      new Float64Array(this._buffer, i, len) :
      new Float64Array(this._buffer.slice(i, i + bytes));
    this._idx += bytes;
    return arr;
  },

  readUint32Array: function(len) {
    var arr = [];
    for (var i=0; i<len; i++) {
      arr.push(this.readUint32());
    }
    return arr;
  },

  peek: function() {
    return this._buffer[this._idx];
  },

  position: function(i) {
    if (i != null) {
      this._idx = i;
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

  writeBuffer: function(buf, bytes, startIdx) {
    bytes = bytes || BinArray.bufferSize(buf);
    startIdx = startIdx | 0;
    if (this.bytesLeft() < bytes)
      error("Buffer overflow; available bytes:", this.bytesLeft(), "tried to write:", bytes);

    // When possible, copy buffer data in multi-byte chunks... Added this for faster copying of
    // shapefile data, which is aligned to 32 bits.
    var wordSize = Math.min(BinArray.maxCopySize(bytes, startIdx), BinArray.maxCopySize(bytes, this._idx)),
        src = BinArray.bufferToUintArray(buf, wordSize),
        dest = BinArray.bufferToUintArray(this._buffer, wordSize),
        count = bytes / wordSize,
        i = startIdx / wordSize,
        j = this._idx / wordSize;

    while (count--) {
      dest[j++] = src[i++];
    }

    this._idx += bytes;
    return this;
  },

  /*
  // TODO: expand buffer, probably via a public method, not automatically
  //
  _grow: function(k) {
    var fac = k > 1 && k <= 3 ? k : 1.7,
        srcLen = this.bufferSize(),
        destLen = Math.round(srcLen * fac),
        buf = new ArrayBuffer(destLen);

    var src = new Uint8Array(this._buffer),
        dest = new Uint8Array(buf);

    for (var i=0; i<srcLen; i++) {
      dest[i] = src[i];
    }

    this._buffer = buf;
    this._view = new DataView(buf);
  },*/
};

