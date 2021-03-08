import { BufferReader } from "../io/mapshaper-file-reader";
import { stop } from "../utils/mapshaper-logging";

// A JSON parser for parsing arrays of objects like GeoJSON Features.
// Handles large files, limited by available memory
// Able to parse GeoJSON about twice as fast as JSON.parse() when coordinate
// precision is less than the maximum for double-precision f.p. numbers.
//
// JSON parsing reference: https://www.json.org/json-en.html

var MAX_STRLEN = 0X100000, // 256k
  LBRACE = 123, // {
  RBRACE = 125,
  LBRACK = 91, // [
  RBRACK = 93,
  DQUOTE = 34,
  COMMA = 44,
  EOF = -1;

// Similar to JSON.parse()
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
    readChar(src, COMMA);
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

function seekObjectStart(src) {
  var c = src.peek();
  var found = false;
  src.update();
  var i = 0;
  while (c != EOF && i < MAX_STRLEN) {
    i++;
    if (c == LBRACE) {
      found = true;
      break;
    }
    src.advance();
    c = src.peek();
  }
  return found;
}

function isWS(c) {
  return c == 32 || c == 10 || c == 13 || c == 9;
}

function skipWS(src) {
  while (isWS(src.peek())) src.advance();
}

function readArray(src, read) {
  var arr = [];
  src.advance(); // eat LBRACK
  var c = readChar(src, RBRACK);
  while (c != RBRACK) {
    src.update();
    arr.push(read(src));
    c = readAorB(src, COMMA, RBRACK);
  }
  return arr;
}

// Using this function instead of readValue() to read array elements
// gives up to a 25% reduction in processing time.
// (It is optimized for reading coordinates)
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
    arr.push(readValue(src));
  } while(readAorB(src, COMMA, RBRACK) == COMMA);
  return arr;
}

function eatChars(src, str) {
  var c;
  for (var i = 0; i < str.length; i++) {
    c = src.getChar();
    if (c != str.charCodeAt(i)) unexpectedCharAt(c, src.index() - 1);
  }
  return true;
}

// Read and return tok if tok is the next non-whitespace byte,
// else return null
function readChar(src, tok) {
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
  else if (c == LBRACK) val = readArray(src, readArrayElement);
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
  src.advance(); // eat {
  var c = readChar(src, RBRACE);
  var key;
  while (c != RBRACE) {
    key = readString(src, true); // use caching for faster key parsing
    if (readChar(src, 58) != 58) { // colon
      unexpectedCharAt(src.peek(), src.index());
    }
    // use caching with GeoJSON "type" params
    o[key] = key == 'type' && src.peek() == DQUOTE ?
      readString(src, true) : readValue(src);
    c = readAorB(src, COMMA, RBRACE);
  }
  return o;
}

function readString(src, caching) {
  src.update(); // refresh buffer to make sure we don't run off the end
  var i = src.index();
  var n = 0;
  var cache = src.cache;
  var escapeNext = false;
  var fallback = false;
  var c = src.getChar();
  var str;
  if (c != DQUOTE) {
    unexpectedCharAt(c, src.index() - 1);
  }
  c = src.getChar();
  while (c != DQUOTE || escapeNext === true) {
    n++;
    if (c == EOF || n > MAX_STRLEN) {
      parseError('Unterminated string in JSON', i);
    }
    if (escapeNext) {
      escapeNext = false;
    } else if (c == 92) { // "\"
      escapeNext = true;
      fallback = true;
    } else if (c == 9 || c == 10 || c == 13 || c === 0) {
      // toString() escapes these (why?)
      // TODO: there may be other whitespace or non-printing chars like these
      // that aren't covered in the test suite
      fallback = true;
    }
    if (caching) {
      if (!cache[c]) {
        cache[c] = [];
      }
      cache = cache[c];
    }
    c = src.getChar();
  }
  src.update(); // refresh buffer again to prevent oflo, in case string was long
  if (caching && cache[0]) {
    return cache[0];
  }
  if (fallback) {
    str = JSON.parse(src.toString(i, n + 2));
  } else {
    str = src.toString(i + 1, n);
  }
  if (caching) {
    cache[0] = str;
  }
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

// Number parsing for any valid number
// This gives the correctly rounded result for numbers with >15 digits.
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
    // not have the same result as JSON.parse() & the IEEE standard)
    // See: https://www.exploringbinary.com/fast-path-decimal-to-floating-point-conversion/
    if (num >= 0x40000000000000 || (d & 1) === 1) {
      // We don't need to fall back to the slow routine
      // for even numbers with 53 bits
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
function ByteReader(reader, start, reserveBytes) {
  // allow overriding the large default reserve limit for testing
  var RESERVE = reserveBytes || (MAX_STRLEN + 2);
  var BUFLEN = RESERVE * 100; // buffer chunk size
  var buf = reader.readSync(start, BUFLEN);
  var bufOffs = start;
  var fileLen = reader.size();
  var i = 0;
  var obj = { peek, getChar, advance, back, toString, index, update };
  obj.cache = []; // kludgy place to put the key cache
  update();
  return obj;

  // This function should be called to make sure that the buffer has enough
  // bytes remaining to read the maximum-sized string or any other reasonable
  // content.
  function update() {
    // if RESERVE bytes are still available in the buffer, no update is required
    var bufSpace = buf.length - i;
    if (bufSpace >= RESERVE) return;

    // if we're close to the end of the file, start checking for overflow
    // (we don't do this all the time because the bounds check on every read
    // causes a significant slowdown, as much as 20%)
    if (fileLen - (bufOffs + i) < RESERVE) {
      obj.peek = safePeek;
      obj.getChar = safeGetChar;
    }

    // if buffer reaches the end of the file, no update is required
    if (bufOffs + buf.length >= fileLen) return;

    // less than RESERVE bytes are unread in buffer -- update the buffer
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
  function safePeek() {
    if (i + bufOffs >= fileLen) return EOF;
    return peek();
  }
  function safeGetChar() {
    var c = safePeek();
    i++;
    return c;
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
