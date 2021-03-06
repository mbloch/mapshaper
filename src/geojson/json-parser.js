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
    cb(readObject(src)); // assumes parse errors will be caught and thrown
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
    msg = 'Unexpected end of JSON input';
  } else if (tok > 0 == false) {
    msg = 'Unexpected token in JSON';
  } else if (tok == DQUOTE) {
    msg = 'Unexpected string in JSON';
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

// Read an array element
// Optimized for reading pairs of coordinates (by far the most common
// element in a typical GeoJSON file)
function readArrayItem(src) {
  var i = src.index();
  var a, b, c, d, e;
  a = src.getChar();
  if (a == LBRACK && isFirstNumChar(src.peek())) {
    b = readNumber(src, true);
    c = src.getChar();
    skipWS(src);
    d = readNumber(src, true);
    e = src.getChar();
    if (c == COMMA && e == RBRACK) {
      return [b, d];
    }
  }
  // Fall back to general-purpose value reader
  src.index(i);
  return readValue(src);
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
  if (isFirstNumChar(c)) return readNumber(src);
  if (c == DQUOTE) return readString(src);
  if (c == 110) return eatChars(src, "null") && null;
  if (c == 116) return eatChars(src, "true") && true;
  if (c == 102) return eatChars(src, "false") && false;
  if (c == LBRACE) return readObject(src);
  // if (c == LBRACK) return readArray(src, readValue);
  if (c == LBRACK) return readArray(src, readArrayItem);
  unexpectedCharAt(c, src.index());
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
    key = readString(src);
    c = readChar(src, 58); // colon
    if (c != 58) unexpectedCharAt(src.peek(), src.index());
    o[key] = readValue(src);
    c = readAorB(src, COMMA, RBRACE);
  }
  return o;
}

function readString(src) {
  src.update(); // refresh buffer, if needed
  var i = src.index();
  var n = 0;
  var escapeNext = false;
  var path2 = false;
  var c = src.getChar();
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
      path2 = true;
    } else if (c == 9 || c == 10 || c == 13 || c === 0) {
      // toString() escapes these (why?)
      // TODO: there may be other whitespace or non-printing chars like these
      // that aren't covered in the test suite
      path2 = true;
    }
    c = src.getChar();
  }
  src.update(); // refresh buffer again to prevent oflo, in case string was long
  if (path2) return JSON.parse(src.toString(i, n + 2));
  return src.toString(i + 1, n);
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
function readNumber_slow(src, noThrow) {
  var i = src.index();
  var n = 0;
  while (isNumChar(src.getChar())) {
    n++;
  }
  src.back();
  var str = src.toString(i, n);
  var num = Number(str);
  if (isNaN(num) && noThrow !== true) parseError('Invalid number in JSON', i);
  return num;
}

// Parses numbers quickly, falls back to a slower method when
// correct fp rounding is not assured.
function readNumber(src, noThrow) {
  var i = src.index();
  var num = 0;
  var den = 1;
  var sign = 1;
  var oflo = false;
  var invalid = false;
  var c = src.getChar();
  var d0;
  if (c === 45) {
    sign = -1;
    c = src.getChar();
  }
  d0 = c;
  while (isDigit(c)) {
    num = num * 10 + c - 48;
    c = src.getChar();
  }
  if (num > 0 && d0 === 48) {
    // catch "01" "-01" etc.
    invalid = true;
  }
  if (c == 46) { // "."
    // c = src.getChar();
    // if (!isDigit(c) || num === 0 && d0 != 48) {
    //   invalid = true;
    // }
    while (isDigit(c = src.getChar())) {
      den *= 10;
      num = num * 10 + c - 48;
    }
    if (den == 1 || d0 == 46) {
      // catch "1." "1.e" "-.1"
      invalid = true;
    }
  }
  if (num === 0 && d0 != 48) {
    invalid = true; // catch "-";
  }
  if (invalid && noThrow !== true) parseError('Invalid number in JSON', i);
  if (num >= 0x20000000000000 || den > 1e22) { // 2 ^ 53
    // May not have the same result as IEEE standard
    // see: https://www.exploringbinary.com/fast-path-decimal-to-floating-point-conversion/
    oflo = true;
  }
  if (oflo || c == 69 || c == 101) { // e|E
    // Exponents are uncommon in GeoJSON... simpler to use slow function
    // than to parse manually and check for overflow and rounding errors
    src.index(i);
    return readNumber_slow(src, noThrow);
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
      obj.next = safeGetChar;
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
    if (i + bufOffs >= fileLen) return EOF;
    return getChar();
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
