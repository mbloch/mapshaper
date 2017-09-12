/* @require mapshaper-common */

// List of encodings supported by iconv-lite:
// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings

// Return list of supported encodings
internal.getEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Object.keys(iconv.encodings);
};

internal.validateEncoding = function(enc) {
  if (!internal.encodingIsSupported(enc)) {
    stop("Unknown encoding:", enc, "\nRun the -encodings command see a list of supported encodings");
  }
  return enc;
};

internal.encodingIsUtf8 = function(enc) {
  // treating utf-8 as default
  return !enc || /^utf-?8$/i.test(String(enc));
};

// Identify the most common encodings that are supersets of ascii at the
// single-byte level (meaning that bytes in 0 - 0x7f range must be ascii)
// (this allows identifying line breaks and other ascii patterns in buffers)
internal.encodingIsAsciiCompat = function(enc) {
  enc = internal.standardizeEncodingName(enc);
  // gb.* selects the Guo Biao encodings
  // big5 in not compatible -- second byte starts at 0x40
  return !enc || /^(win|latin|utf8|ascii|iso88|gb)/.test(enc);
};

// Ex. convert UTF-8 to utf8
internal.standardizeEncodingName = function(enc) {
  return (enc || '').toLowerCase().replace(/[_-]/g, '');
};

// Similar to Buffer#toString(); tries to speed up utf8 conversion in
// web browser (when using browserify Buffer shim)
internal.bufferToString = function(buf, enc, start, end) {
  if (start >= 0) {
    buf = buf.slice(start, end);
  }
  return internal.decodeString(buf, enc);
};

internal.getNativeEncoder = function(enc) {
  var encoder = null;
  enc = internal.standardizeEncodingName(enc);
  if (enc != 'utf8') {
    // TODO: support more encodings if TextEncoder is available
    return null;
  }
  if (typeof TextEncoder != 'undefined') {
    encoder = new TextEncoder(enc);
  }
  return function(str) {
    // Convert Uint8Array from encoder to Buffer (fix for issue #216)
    return encoder ? Buffer.from(encoder.encode(str).buffer) : new Buffer(str, enc);
  };
};

internal.encodeString = (function() {
  var iconv = require('iconv-lite');
  var toUtf8 = internal.getNativeEncoder('utf8');
  return function(str, enc) {
    // TODO: faster ascii encoding?
    var buf;
    if (internal.encodingIsUtf8(enc)) {
      buf = toUtf8(str);
    } else {
      buf = iconv.encode(str, enc);
    }
    return buf;
  };
}());

internal.getNativeDecoder = function(enc) {
  var decoder = null;
  enc = internal.standardizeEncodingName(enc);
  if (enc != 'utf8') {
    // TODO: support more encodings if TextDecoder is available
    return null;
  }
  if (typeof TextDecoder != 'undefined') {
    decoder = new TextDecoder(enc);
  }
  return function(buf) {
    return decoder ? decoder.decode(buf) : buf.toString(enc);
  };
};

internal.decodeString = (function() {
  var iconv = require('iconv-lite');
  var fromUtf8 = internal.getNativeDecoder('utf8');
  // @buf a Node Buffer
  return function(buf, enc) {
    var str;
    if (internal.encodingIsUtf8(enc)) {
      str = fromUtf8(buf);
    } else {
      str = iconv.decode(buf, enc);
    }
    return str;
  };
}());

internal.encodingIsSupported = function(raw) {
  var enc = internal.standardizeEncodingName(raw);
  return utils.contains(internal.getEncodings(), enc);
};

internal.trimBOM = function(str) {
  // remove BOM if present
  if (str.charCodeAt(0) == 0xfeff) {
    str = str.substr(1);
  }
  return str;
};

internal.printEncodings = function() {
  var encodings = internal.getEncodings().filter(function(name) {
    // filter out some aliases and non-applicable encodings
    return !/^(_|cs|internal|ibm|isoir|singlebyte|table|[0-9]|l[0-9]|windows)/.test(name);
  });
  encodings.sort();
  message("Supported encodings:\n" + internal.formatStringsAsGrid(encodings));
};
