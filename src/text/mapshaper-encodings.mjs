import { formatStringsAsGrid } from '../utils/mapshaper-logging';
import { Buffer } from '../utils/mapshaper-node-buffer';
import { print, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

import require from '../mapshaper-require';
// import { createRequire } from "module";

var iconv = require('iconv-lite');

// import iconv from 'iconv-lite';
// import * as iconv from 'iconv-lite';
// import * as iconv from '../../node_modules/iconv-lite/lib/index.js';

// List of encodings supported by iconv-lite:
// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings

var toUtf8 = getNativeEncoder('utf8');
var fromUtf8 = getNativeDecoder('utf8');

// Return list of supported encodings
export function getEncodings() {
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Object.keys(iconv.encodings);
}

export function validateEncoding(enc) {
  if (!encodingIsSupported(enc)) {
    stop("Unknown encoding:", enc, "\nRun the -encodings command see a list of supported encodings");
  }
  return enc;
}

export function stringsAreAscii(arr) {
  return stringIsAscii(arr.join(''));
}

export function stringIsAscii(str) {
  var c;
  for (var i=0, n=str.length; i<n; i++) {
    c = str.charCodeAt(i);
    if (c >= 128) return false;
  }
  return true;
}

export function encodingIsUtf8(enc) {
  // treating utf-8 as default
  return !enc || /^utf-?8$/i.test(String(enc));
}

// Identify the most common encodings that are supersets of ascii at the
// single-byte level (meaning that bytes in 0 - 0x7f range must be ascii)
// (this allows identifying line breaks and other ascii patterns in buffers)
export function encodingIsAsciiCompat(enc) {
  enc = standardizeEncodingName(enc);
  // gb.* selects the Guo Biao encodings
  // big5 in not compatible -- second byte starts at 0x40
  return !enc || /^(win|latin|utf8|ascii|iso88|gb)/.test(enc);
}

// Ex. convert UTF-8 to utf8
export function standardizeEncodingName(enc) {
  return (enc || '').toLowerCase().replace(/[_-]/g, '');
}

// Similar to Buffer#toString(); tries to speed up utf8 conversion in
// web browser (when using browserify Buffer shim)
export function bufferToString(buf, enc, start, end) {
  if (start >= 0) {
    buf = buf.slice(start, end);
  }
  return decodeString(buf, enc);
}

function getNativeEncoder(enc) {
  var encoder = null;
  enc = standardizeEncodingName(enc);
  if (enc != 'utf8') {
    // TODO: support more encodings if TextEncoder is available
    return null;
  }
  if (typeof TextEncoder != 'undefined') {
    encoder = new TextEncoder(enc);
  }
  return function(str) {
    // Convert Uint8Array from encoder to Buffer (fix for issue #216)
    return encoder ? Buffer.from(encoder.encode(str).buffer) : utils.createBuffer(str, enc);
  };
}

export function encodeString(str, enc) {
  // TODO: faster ascii encoding?
  var buf;
  if (encodingIsUtf8(enc)) {
    buf = toUtf8(str);
  } else {
    buf = iconv.encode(str, enc);
  }
  return buf;
}

function getNativeDecoder(enc) {
  var decoder = null;
  enc = standardizeEncodingName(enc);
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
}

// @buf a Node Buffer
export function decodeString(buf, enc) {
  var str;
  if (encodingIsUtf8(enc)) {
    str = fromUtf8(buf);
  } else {
    str = iconv.decode(buf, enc);
  }
  return str;
}

export function encodingIsSupported(raw) {
  var enc = standardizeEncodingName(raw);
  return getEncodings().includes(enc);
}

export function trimBOM(str) {
  // remove BOM if present
  if (str.charCodeAt(0) == 0xfeff) {
    str = str.substr(1);
  }
  return str;
}

export function printEncodings() {
  var encodings = getEncodings().filter(function(name) {
    // filter out some aliases and non-applicable encodings
    return !/^(_|cs|internal|ibm|isoir|singlebyte|table|[0-9]|l[0-9]|windows)/.test(name);
  });
  encodings.sort();
  print("Supported encodings:\n" + formatStringsAsGrid(encodings));
}
