
// Use a proxy for Buffer if running in browser and using browserify shim
// (Mostly to improve performance of string conversion)
var Buffer = (function() {
  var Buffer = require('buffer').Buffer;
  var ProxyBuffer;
  if (typeof TextDecoder == 'undefined' || typeof TextEncoder == 'undefined') {
    return Buffer;
  }

  ProxyBuffer = function(arg, encodingOrOffset, length) {
    var buf;
    if (typeof arg == "string" && encodingIsUtf8(encodingOrOffset)) {
      arg = fromUtf8(arg);
      encodingOrOffset = null;
    }
    return init(new Buffer(arg, encodingOrOffset, length));
  };

  ProxyBuffer.concat = Buffer.concat;
  ProxyBuffer.from = Buffer.from;

  function encodingIsUtf8(enc) {
    return !enc || /^utf-?8$/i.test(String(enc));
  }

  function fromUtf8(str) {
    // returns ArrayBuffer
    return new TextEncoder('utf8').encode(str).buffer;
  }

  function init(buf) {
    buf.toString = toString;
    buf.slice = slice;
    return buf;
  }

  function slice(start, end) {
    return init(Buffer.prototype.slice.call(this, start, end));
  }

  function toString(enc, start, end) {
    if (encodingIsUtf8(enc)) {
      return new TextDecoder('utf8').decode(start || end ? this.slice(start || 0, end) : this);
    }
    return Buffer.prototype.toString.call(enc, start, end);
  }

  return ProxyBuffer;
}());
