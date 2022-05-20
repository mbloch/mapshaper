import { BufferReader } from "../io/mapshaper-file-reader";
import { stop } from "../utils/mapshaper-logging";

// This is a JSON parser optimized for GeoJSON files.
//
// The native JSON parser, JSON.parse(), is limited by the maximum string
// size, about ~536.8M chars in Node.
// (See https://github.com/v8/v8/blob/ea56bf5513d0cbd2a35a9035c5c2996272b8b728/src/objects/string.h#L365).
// This parser can parse much larger files -- it is limited by available memory.
//
// Performance:
// In Node, this parser is about twice as fast as JSON.parse() when parsing
// GeoJSON files containing mostly coordinate data and when coordinate precision
// is less than the float64 maximum. Similar files with full-precision
// coordinates see a smaller improvement. Files that contain mostly attribute
// data (e.g. a typical Point feature file) may be parsed a bit slower than
// JSON.parse().
//
// JSON parsing reference: https://www.json.org/json-en.html
//
var
  LBRACE = 123,
  RBRACE = 125,
  LBRACK = 91,
  RBRACK = 93,
  DQUOTE = 34,
  COMMA = 44;

var EOF; // undefined is used as an EOF marker

var RESERVE = 0X1000; // RESERVE is the number of bytes to keep in read buffer
var BUFLEN = 1e7; // buffer chunk size
var MAX_STRLEN = 5e6; // max byte len of a value string (object keys are shorter)

// Parse from a Buffer -- similar to JSON.parse(), used for testing
export function parse(buf) {
  var reader = new BufferReader(buf);
  var src = ByteReader(reader, 0);
  skipWS(src);
  var val = readValue(src);
  skipWS(src);
  if (src.peek() != EOF) {
    unexpectedCharAt(src.peek(), src.index());
  }
  return val;
}

// Read and parse JSON objects from a FileReader
export function parseObjects(reader, offset, cb) {
  var src = ByteReader(reader, offset);
  seekObjectStart(src);
  while (src.peek() == LBRACE) {
    cb(readObject(src));
    readToken(src, COMMA);
  }
}

function parseError(msg, i) {
  if (i >= 0) {
    msg += ' at position ' + i;
  }
  stop(msg);
}

function unexpectedCharAt(tok, i) {
  var msg;
  if (tok == EOF) {
    return parseError('Unexpected end of JSON input');
  }
  if (tok == DQUOTE) {
    msg = 'Unexpected string in JSON';
  } else if (tok < 33 || tok > 126) { // not ascii glyph
    msg = 'Unexpected token in JSON';
  } else {
    msg = 'Unexpected token ' + String.fromCharCode(tok) + ' in JSON';
  }
  parseError(msg, i);
}

function stringOverflow(i, c) {
  if (c == EOF) {
    parseError('Unterminated string in JSON', i);
  }
  parseError('Too-long string in JSON', i);
}

function seekObjectStart(src) {
  var c = src.getChar();
  var i = 0;
  while (c != EOF && i < RESERVE) {
    i++;
    if (c == LBRACE) {
      src.back();
      return true;
    }
    c = src.getChar();
  }
  return false;
}

function isWS(c) {
  return c == 32 || c == 10 || c == 13 || c == 9;
}

function skipWS(src) {
  while (isWS(src.peek())) src.advance();
}

function readArray(src) {
  var arr = [], c;
  eatChar(src, LBRACK);
  c = readToken(src, RBRACK);
  while (c != RBRACK) {
    src.refresh();
    arr.push(readArrayElement(src));
    c = readAorB(src, COMMA, RBRACK);
  }
  return arr;
}

// Using this function instead of readValue() to read array elements
// gives up to a 25% reduction in overall processing time when parsing
// coordinate-heavy GeoJSON files.
function readArrayElement(src) {
  var i = src.index();
  var x, y, a, b;
  if (src.getChar() == LBRACK && isFirstNumChar(src.peek())) {
    x = readNumber(src);
    a = src.getChar();
    skipWS(src);
    if (a == COMMA && isFirstNumChar(src.peek())) {
      y = readNumber(src);
      b = src.getChar();
      if (b == RBRACK) {
        return [x, y];
      } else if (b == COMMA) {
        return extendArray(src, [x, y]);
      }
    }
  }
  // Fall back to general-purpose value reader
  src.index(i);
  return readValue(src);
}

function extendArray(src, arr) {
  skipWS(src);
  do {
    src.refresh(); // make make sure long arrays of numbers don't overflow
    arr.push(readValue(src));
  } while(readAorB(src, COMMA, RBRACK) == COMMA);
  return arr;
}

function eatChars(src, str) {
  for (var i = 0; i < str.length; i++) {
    eatChar(src, str.charCodeAt(i));
  }
  return true;
}

function eatChar(src, char) {
  var c = src.getChar();
  if (c != char) {
    unexpectedCharAt(c, src.index() - 1);
  }
}

// Reads and returns tok if tok is the next non-whitespace byte,
// else returns null.
// Scans past WS chars, both before and after tok
function readToken(src, tok) {
  skipWS(src);
  var c = src.peek();
  if (c === tok) {
    src.advance();
    skipWS(src);
    return tok;
  }
  return null;
}

// assumes no leading WS
function readValue(src) {
  var c = src.peek();
  var val;
  if (isFirstNumChar(c)) val = readNumber(src);
  else if (c == LBRACK) val = readArray(src);
  else if (c == DQUOTE) val = readString(src);
  else if (c == LBRACE) val = readObject(src);
  else if (c == 110) val = eatChars(src, "null") && null;
  else if (c == 116) val = eatChars(src, "true") && true;
  else if (c == 102) val = eatChars(src, "false") && false;
  else unexpectedCharAt(c, src.index());
  return val;
}

function readAorB(src, a, b) {
  skipWS(src);
  var c = src.getChar();
  if (c != a && c != b) unexpectedCharAt(c, src.index() - 1);
  skipWS(src);
  return c;
}

function readObject(src) {
  var o = {};
  var key, c;
  eatChar(src, LBRACE);
  c = readToken(src, RBRACE);
  while (c != RBRACE) {
    src.refresh();
    key = readKey(src); // use caching for faster key parsing
    skipWS(src);
    eatChar(src, 58);
    skipWS(src);
    // use caching with GeoJSON "type" params
    o[key] = key == 'type' && src.peek() == DQUOTE ?
      readKey(src) : readValue(src);
    c = readAorB(src, COMMA, RBRACE);
  }
  return o;
}

function growReserve() {
  RESERVE *= 2;
  return RESERVE <= MAX_STRLEN;
}

// Uses caching to speed up parsing of repeated strings.
// The caching scheme used here can give a 20% overall speed improvement
// when parsing files consisting mostly of attribute data (e.g. typical Point features)
function readKey(src) {
  var MAXLEN = 2000; // must be less than RESERVE
  var i = src.index();
  var cache = src.cache;
  var escapeNext = false;
  var n = 0;
  eatChar(src, DQUOTE);
  var c = src.getChar();
  while (c != DQUOTE || escapeNext === true) {
    n++;
    if (n > MAXLEN) {
      stringOverflow(i, c);
    }
    if (escapeNext) {
      escapeNext = false;
    } else if (c == 92) {
      escapeNext = true;
    }
    if (!cache[c]) {
      cache[c] = [];
    }
    cache = cache[c];
    c = src.getChar();
  }
  if (cache[0]) {
    return cache[0];
  }
  src.index(i);
  cache[0] = readString(src);
  return cache[0];
}

// Fast path for reading strings.
// A slower fallback is used to read strings that are longer, non-ascii or
// contain escaped chars
function readString(src) {
  var i = src.index();
  eatChar(src, DQUOTE);
  var LIMIT = 256;
  var n = 0;
  var str = '';
  var c = src.getChar();
  while (c != DQUOTE) {
    n++;
    if (n > LIMIT || c == 92 || c < 32 || c > 126) {
      src.index(i);
      return readString_slow(src);
    }
    // String concatenation is faster than Buffer#toString()
    // (as tested with typical strings found in GeoJSON)
    str += String.fromCharCode(c);
    c = src.getChar();
  }
  return str;
}

// Fallback for reading long strings, escaped strings, non-ascii strings, etc.
function readString_slow(src) {
  src.refresh();
  var LIMIT = RESERVE - 2;
  var i = src.index();
  var n = 0;
  var escapeNext = false;
  eatChar(src, DQUOTE);
  var c = src.getChar();
  var str;
  while (c != DQUOTE || escapeNext === true) {
    n++;
    if (n > LIMIT) {
      // we've exceeded the number of reserved bytes
      // expand the limit and try reading this string again
      if (c == EOF || !growReserve()) {
        stringOverflow(i, c);
      }
      src.index(i);
      return readString_slow(src);
    }
    if (escapeNext) {
      escapeNext = false;
    } else if (c == 92) {
      escapeNext = true;
    }
    c = src.getChar();
  }
  // skipping JSON.parse() is faster, but doesn't work when strings contain
  // escapes or a handful of ascii control characters.
  // str = src.toString(i + 1, n);
  str = JSON.parse(src.toString(i, n + 2));
  src.refresh();
  return str;
}

function isDigit(c) {
  return c >= 48 && c <= 57;
}

function isFirstNumChar(c) {
  return c >= 48 && c <= 57 || c == 45;
}

function isNumChar(c) {
  return c >= 48 && c <= 57 || c == 45 || c == 46 || c == 43 || c == 69 || c == 101;
}


// Correctly parses any valid JSON number
// This function gives the correctly rounded result for numbers that are
// incorrectly rounded using the fast method (a subset of numbers with >15 digits).
function readNumber_slow(src) {
  var i = src.index();
  var n = 0;
  while (isNumChar(src.getChar())) {
    n++;
  }
  src.back();
  var str = src.toString(i, n);
  var num = Number(str);
  if (isNaN(num)) parseError('Invalid number in JSON', i);
  return num;
}

// Parses numbers quickly, falls back to a slower method when
// correct fp rounding is not assured.
function readNumber(src) {
  var i = src.index();
  var num = 0;
  var den = 1;
  var sign = 1;
  var oflo = false;
  var invalid = false;
  var c = src.getChar();
  var d0, d;
  if (c === 45) {
    sign = -1;
    c = src.getChar();
  }
  d0 = c;
  while (isDigit(c)) {
    d = c - 48;
    num = num * 10 + d;
    c = src.getChar();
  }
  if (num > 0 && d0 === 48) {
    // catch "01" "-01" etc.
    invalid = true;
  }
  if (c == 46) { // "."
    while (isDigit(c = src.getChar())) {
      d = c - 48;
      den *= 10;
      num = num * 10 + d;
    }
    if (den == 1 || d0 == 46) {
      // catch "1." "1.e" "-.1"
      invalid = true;
    }
  }
  if (num === 0 && d0 != 48) {
    invalid = true; // catch "-";
  }
  if (invalid) parseError('Invalid number in JSON', i);
  if (den > 1e22) oflo = true; // denominator gets rounded above this limit
  if (num >= 0x20000000000000) { // 2^53
    // Some numerators get rounded with > 52 bits of mantissa
    // (When numerator or denominator are rounded, dividing them may
    // not have the same result as JSON.parse() and the IEEE standard)
    // See: https://www.exploringbinary.com/fast-path-decimal-to-floating-point-conversion/
    if (num >= 0x40000000000000 || (d & 1) === 1) {
      // We don't need to fall back to the slow routine
      // for even integers with 53 bits
      // This optimization can reduce overall processing time by 15% for
      // GeoJSON files with full-precision coordinates.
      oflo = true;
    }
  }
  if (oflo || c == 69 || c == 101) { // e|E
    // Exponents are uncommon in GeoJSON... simpler to use slow function
    // than to parse manually and check for overflow and rounding errors
    src.index(i);
    return readNumber_slow(src);
  }
  src.back();
  return sign * num / den;
}

// Wrap a FileReader to support reading files one byte at a time.
function ByteReader(reader, start) {
  var fileLen = reader.size();
  var bufOffs = start;
  var buf = reader.readSync(bufOffs, BUFLEN);
  var i = 0;
  var obj = { peek, getChar, advance, back, toString, index, refresh };
  obj.cache = []; // kludgy place to put the key cache
  refresh();
  return obj;

  // This function should be called to make sure that the buffer has enough
  // bytes remaining to read any reasonable JSON content.
  function refresh() {
    // if RESERVE bytes are still available in the buffer, no update is required
    if (buf.length - i >= RESERVE) return;

    // CHANGE: now using undefined as an EOF marker, so a bounds check is unneeded
    // // if we're close to the end of the file, start checking for overflow
    // // (we don't do this all the time because the bounds check on every read
    // // causes a significant slowdown, as much as 20%)
    // if (fileLen - (bufOffs + i) < RESERVE) {
    //   obj.peek = safePeek;
    //   obj.getChar = safeGetChar;
    // }

    // if buffer reaches the end of the file, no update is required
    if (bufOffs + buf.length >= fileLen) return;

    // fewer than RESERVE bytes are unread in buffer -- update the buffer
    bufOffs += i;
    i = 0;
    buf = reader.readSync(bufOffs, BUFLEN);
  }
  function peek() {
    return buf[i];
  }
  function getChar() {
    return buf[i++];
  }
  function advance() {
    i++;
  }
  function back() {
    i--;
  }
  function index(idx) {
    if (idx >= 0 === false) return i + bufOffs;
    i = idx - bufOffs;
  }
  function toString(idx, n) {
    var i = idx - bufOffs;
    return buf.toString("utf8", i, i + n);
  }
}
