// An LZW decoder for GeoTIFF strips and tiles, registered with geotiff.js in
// place of its own. geotiff.js's decoder builds each strip in a plain array, a
// byte at a time, which made decoding a large LZW GeoTIFF about eight times
// slower than this.

var CLEAR_CODE = 256;
var EOI_CODE = 257;
var FIRST_CODE = 258;
var MAX_CODES = 4096;
var registered = new WeakSet();

// Replaces the LZW decoder of the geotiff.js module @geotiff
export function registerGeoTIFFLZWDecoder(geotiff) {
  var Decoder;
  if (!geotiff || !geotiff.addDecoder || !geotiff.BaseDecoder || registered.has(geotiff)) return;
  Decoder = class extends geotiff.BaseDecoder {
    decodeBlock(buffer) {
      var out = decodeLZW(new Uint8Array(buffer), getDecodedBlockLength(this.parameters));
      return out.byteLength == out.buffer.byteLength ? out.buffer : out.slice().buffer;
    }
  };
  geotiff.addDecoder(5, function() { return Promise.resolve(Decoder); });
  registered.add(geotiff);
}

// The size of a decoded strip or tile, for preallocating the output; the last
// strip of an image can be shorter.
function getDecodedBlockLength(params) {
  var bits = params && params.bitsPerSample;
  var bitsPerPixel;
  if (!params || !params.tileWidth || !params.tileHeight || !bits) return 0;
  bits = typeof bits == 'number' ? [bits] : Array.from(bits);
  bitsPerPixel = params.planarConfiguration == 2 ? bits[0] : bits.reduce(function(a, b) { return a + b; }, 0);
  return Math.ceil(params.tileWidth * bitsPerPixel / 8) * params.tileHeight;
}

// TIFF LZW: codes of 9 to 12 bits, most significant bit first, with the code
// width growing one code early ("early change").
// @input: Uint8Array; @expectedLength: the likely decoded size, or 0
// Returns a Uint8Array of the decoded bytes
export function decodeLZW(input, expectedLength) {
  var prefix = new Uint16Array(MAX_CODES);
  var suffix = new Uint8Array(MAX_CODES);
  var first = new Uint8Array(MAX_CODES);
  var length = new Uint16Array(MAX_CODES);
  var out = new Uint8Array(expectedLength > 0 ? expectedLength : Math.max(1024, input.length * 4));
  var n = input.length;
  var next = FIRST_CODE, width = 9, prev = -1;
  var pos = 0, p = 0, bitBuf = 0, bitCount = 0;
  var code, len, k, j, c;
  for (k = 0; k < 256; k++) {
    suffix[k] = first[k] = k;
    length[k] = 1;
  }
  while (true) {
    while (bitCount < width) {
      // Running out of input without an end code ends the data, as it does in
      // geotiff.js's decoder
      if (p >= n) return out.subarray(0, pos);
      bitBuf = (bitBuf << 8 | input[p++]) >>> 0;
      bitCount += 8;
    }
    bitCount -= width;
    code = (bitBuf >>> bitCount) & ((1 << width) - 1);
    if (code == EOI_CODE) break;
    if (code == CLEAR_CODE) {
      next = FIRST_CODE;
      width = 9;
      prev = -1;
      continue;
    }
    if (prev == -1) {
      if (code > 255) throw new Error('Invalid LZW code: ' + code);
      if (pos >= out.length) out = growBuffer(out, pos + 1);
      out[pos++] = code;
      prev = code;
      continue;
    }
    if (code < next) {
      k = code;
      c = first[code];
    } else if (code == next) {
      // The code being defined: the previous string plus its own first byte
      k = prev;
      c = first[prev];
    } else {
      throw new Error('Invalid LZW code: ' + code);
    }
    len = length[k];
    if (pos + len + (code == next ? 1 : 0) > out.length) out = growBuffer(out, pos + len + 1);
    for (j = pos + len - 1; j >= pos; j--) {
      out[j] = suffix[k];
      k = prefix[k];
    }
    pos += len;
    if (code == next) out[pos++] = c;
    if (next < MAX_CODES) {
      prefix[next] = prev;
      suffix[next] = c;
      first[next] = first[prev];
      length[next] = length[prev] + 1;
      next++;
      if (next + 1 >= 1 << width && width < 12) width++;
    }
    prev = code;
  }
  return out.subarray(0, pos);
}

function growBuffer(buf, minLength) {
  var grown = new Uint8Array(Math.max(minLength, buf.length * 2));
  grown.set(buf);
  return grown;
}
