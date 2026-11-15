import { stop } from '../utils/mapshaper-logging';

// Decoder for lossless WebP images (the VP8L format, RFC 9649), for terrain
// tiles in Node, which has no built-in WebP support. Lossy WebP can't carry
// encoded elevations without corrupting them, so it is not supported.

var NUM_LENGTH_CODES = 24;
var NUM_DISTANCE_CODES = 40;
var CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
var TABLE_BITS = 8;

// (dx, dy) pairs for distance codes 1-120
var DISTANCE_MAP = [
  0, 1, 1, 0, 1, 1, -1, 1, 0, 2, 2, 0, 1, 2,
  -1, 2, 2, 1, -2, 1, 2, 2, -2, 2, 0, 3, 3, 0,
  1, 3, -1, 3, 3, 1, -3, 1, 2, 3, -2, 3, 3, 2,
  -3, 2, 0, 4, 4, 0, 1, 4, -1, 4, 4, 1, -4, 1,
  3, 3, -3, 3, 2, 4, -2, 4, 4, 2, -4, 2, 0, 5,
  3, 4, -3, 4, 4, 3, -4, 3, 5, 0, 1, 5, -1, 5,
  5, 1, -5, 1, 2, 5, -2, 5, 5, 2, -5, 2, 4, 4,
  -4, 4, 3, 5, -3, 5, 5, 3, -5, 3, 0, 6, 6, 0,
  1, 6, -1, 6, 6, 1, -6, 1, 2, 6, -2, 6, 6, 2,
  -6, 2, 4, 5, -4, 5, 5, 4, -5, 4, 3, 6, -3, 6,
  6, 3, -6, 3, 0, 7, 7, 0, 1, 7, -1, 7, 5, 5,
  -5, 5, 7, 1, -7, 1, 4, 6, -4, 6, 6, 4, -6, 4,
  2, 7, -2, 7, 7, 2, -7, 2, 3, 7, -3, 7, 7, 3,
  -7, 3, 5, 6, -5, 6, 6, 5, -6, 5, 8, 0, 4, 7,
  -4, 7, 7, 4, -7, 4, 8, 1, 8, 2, 6, 6, -6, 6,
  8, 3, 5, 7, -5, 7, 7, 5, -7, 5, 8, 4, 6, 7,
  -6, 7, 7, 6, -7, 6, 8, 5, 7, 7, -7, 7, 8, 6,
  8, 7
];

export function isWebP(bytes) {
  return bytes.length > 12 && readTag(bytes, 0) == 'RIFF' && readTag(bytes, 8) == 'WEBP';
}

// @buf ArrayBuffer or Uint8Array containing a WebP file
// Returns {rgba: Uint8Array, width, height}
export function decodeWebP(buf) {
  var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  var chunk = findChunk(bytes);
  var br = new BitReader(bytes, chunk.start, chunk.end);
  var width, height, argb;
  if (br.readBits(8) != 0x2f) stop('Invalid lossless WebP header');
  width = br.readBits(14) + 1;
  height = br.readBits(14) + 1;
  br.readBits(1); // alpha hint
  if (br.readBits(3) !== 0) stop('Unsupported WebP version');
  argb = decodeImageStream(br, width, height, true);
  return {rgba: argbToRgba(argb), width: width, height: height};
}

function readTag(bytes, i) {
  return String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
}

function findChunk(bytes) {
  var pos = 12, tag, size;
  if (!isWebP(bytes)) stop('Not a WebP file');
  while (pos + 8 <= bytes.length) {
    tag = readTag(bytes, pos);
    size = (bytes[pos + 4] | bytes[pos + 5] << 8 | bytes[pos + 6] << 16 | bytes[pos + 7] << 24) >>> 0;
    if (tag == 'VP8L') return {start: pos + 8, end: Math.min(pos + 8 + size, bytes.length)};
    if (tag == 'VP8 ') stop('Lossy WebP images are not supported');
    pos += 8 + size + (size & 1);
  }
  stop('WebP file contains no image data');
}

function BitReader(bytes, start, end) {
  var pos = start * 8;
  var limit = end * 8;

  // Returns the next 24 or more bits without consuming them
  this.peek = function() {
    var p = pos >> 3;
    return ((p < end ? bytes[p] : 0) |
      (p + 1 < end ? bytes[p + 1] : 0) << 8 |
      (p + 2 < end ? bytes[p + 2] : 0) << 16 |
      (p + 3 < end ? bytes[p + 3] : 0) << 24) >>> (pos & 7);
  };

  this.skip = function(n) {
    pos += n;
    if (pos > limit) stop('Truncated WebP image');
  };

  // n <= 24
  this.readBits = function(n) {
    var val = n > 0 ? this.peek() & ((1 << n) - 1) : 0;
    this.skip(n);
    return val;
  };
}

function decodeImageStream(br, xsize, ysize, isMainImage) {
  var transforms = [];
  var width = xsize;
  var cacheBits = 0;
  var groups, meta = null, metaBits = 0, metaWidth = 0, transform, data, i;
  if (isMainImage) {
    while (br.readBits(1)) {
      transform = readTransform(br, width, ysize);
      transforms.push(transform);
      width = transform.packedWidth || width;
    }
  }
  if (br.readBits(1)) {
    cacheBits = br.readBits(4);
    if (cacheBits < 1 || cacheBits > 11) stop('Invalid WebP color cache size');
  }
  if (isMainImage && br.readBits(1)) {
    metaBits = br.readBits(3) + 2;
    metaWidth = subsampleSize(width, metaBits);
    meta = decodeImageStream(br, metaWidth, subsampleSize(ysize, metaBits), false);
    groups = 0;
    for (i = 0; i < meta.length; i++) {
      meta[i] = (meta[i] >> 8) & 0xffff;
      groups = Math.max(groups, meta[i] + 1);
    }
  } else {
    groups = 1;
  }
  groups = readPrefixCodeGroups(br, groups, cacheBits);
  data = decodePixels(br, width, ysize, cacheBits, groups, meta, metaBits, metaWidth);
  for (i = transforms.length - 1; i >= 0; i--) {
    data = applyInverseTransform(transforms[i], data, ysize);
  }
  return data;
}

function subsampleSize(size, bits) {
  return (size + (1 << bits) - 1) >> bits;
}

function readTransform(br, xsize, ysize) {
  var type = br.readBits(2);
  var t = {type: type, xsize: xsize};
  var size, table, i;
  if (type === 0 || type == 1) {
    t.bits = br.readBits(3) + 2;
    t.blocksWide = subsampleSize(xsize, t.bits);
    t.data = decodeImageStream(br, t.blocksWide, subsampleSize(ysize, t.bits), false);
  } else if (type == 3) {
    size = br.readBits(8) + 1;
    table = decodeImageStream(br, size, 1, false);
    for (i = 1; i < size; i++) table[i] = addPixels(table[i], table[i - 1]);
    t.table = table;
    t.bits = size <= 2 ? 3 : size <= 4 ? 2 : size <= 16 ? 1 : 0;
    t.packedWidth = subsampleSize(xsize, t.bits);
  }
  return t;
}

function readPrefixCodeGroups(br, count, cacheBits) {
  var greenSize = 256 + NUM_LENGTH_CODES + (cacheBits > 0 ? 1 << cacheBits : 0);
  var groups = [];
  for (var i = 0; i < count; i++) {
    groups.push([
      readPrefixCode(br, greenSize),
      readPrefixCode(br, 256),
      readPrefixCode(br, 256),
      readPrefixCode(br, 256),
      readPrefixCode(br, NUM_DISTANCE_CODES)
    ]);
  }
  return groups;
}

function readPrefixCode(br, alphabetSize) {
  var lengths = new Uint8Array(alphabetSize);
  var numSymbols, s0, s1;
  if (br.readBits(1)) {
    numSymbols = br.readBits(1) + 1;
    s0 = br.readBits(br.readBits(1) ? 8 : 1);
    lengths[s0] = 1;
    if (numSymbols == 2) {
      s1 = br.readBits(8);
      lengths[s1] = 1;
    }
  } else {
    readCodeLengths(br, lengths);
  }
  return buildPrefixCode(lengths);
}

function readCodeLengths(br, lengths) {
  var clLengths = new Uint8Array(CODE_LENGTH_ORDER.length);
  var n = br.readBits(4) + 4;
  var clCode, maxSymbol, symbol, prevLen, len, repeat, fill, i;
  for (i = 0; i < n; i++) clLengths[CODE_LENGTH_ORDER[i]] = br.readBits(3);
  clCode = buildPrefixCode(clLengths);
  maxSymbol = br.readBits(1) ? 2 + br.readBits(2 + 2 * br.readBits(3)) : lengths.length;
  if (maxSymbol > lengths.length) stop('Invalid WebP prefix code');
  symbol = 0;
  prevLen = 8;
  while (symbol < lengths.length) {
    if (maxSymbol-- === 0) break;
    len = readSymbol(br, clCode);
    if (len < 16) {
      lengths[symbol++] = len;
      if (len !== 0) prevLen = len;
    } else {
      repeat = len == 16 ? 3 + br.readBits(2) : len == 17 ? 3 + br.readBits(3) : 11 + br.readBits(7);
      fill = len == 16 ? prevLen : 0;
      if (symbol + repeat > lengths.length) stop('Invalid WebP prefix code');
      while (repeat-- > 0) lengths[symbol++] = fill;
    }
  }
}

// Canonical prefix code. Codes up to TABLE_BITS long are decoded with a lookup
// table, longer ones bit by bit.
function buildPrefixCode(lengths) {
  var count = new Uint16Array(16);
  var offsets = new Uint16Array(16);
  var nextCode = new Uint16Array(16);
  var table = new Int32Array(1 << TABLE_BITS);
  var symbols, nonzero = 0, last = 0, code, len, rev, i, k;
  for (i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0) {
      count[lengths[i]]++;
      nonzero++;
      last = i;
    }
  }
  if (nonzero <= 1) return {single: last};
  for (len = 1; len < 16; len++) offsets[len] = offsets[len - 1] + count[len - 1];
  symbols = new Uint16Array(nonzero);
  for (i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0) symbols[offsets[lengths[i]]++] = i;
  }
  code = 0;
  for (len = 1; len < 16; len++) {
    code = (code + count[len - 1]) << 1;
    nextCode[len] = code;
  }
  for (i = 0; i < lengths.length; i++) {
    len = lengths[i];
    if (len === 0 || len > TABLE_BITS) continue;
    rev = reverseBits(nextCode[len]++, len);
    for (k = rev; k < table.length; k += 1 << len) table[k] = len << 16 | i;
  }
  return {single: -1, table: table, count: count, symbols: symbols};
}

function reverseBits(code, len) {
  var rev = 0;
  for (var i = 0; i < len; i++) {
    rev = rev << 1 | (code & 1);
    code >>= 1;
  }
  return rev;
}

function readSymbol(br, h) {
  var bits, entry, code, first, index, len, n;
  if (h.single >= 0) return h.single;
  bits = br.peek();
  entry = h.table[bits & ((1 << TABLE_BITS) - 1)];
  if (entry) {
    br.skip(entry >>> 16);
    return entry & 0xffff;
  }
  code = first = index = 0;
  for (len = 1; len < 16; len++) {
    code |= (bits >>> (len - 1)) & 1;
    n = h.count[len];
    if (code - n < first) {
      br.skip(len);
      return h.symbols[index + code - first];
    }
    index += n;
    first = (first + n) << 1;
    code <<= 1;
  }
  stop('Invalid WebP prefix code');
}

function readLengthOrDistance(br, prefix) {
  var extra;
  if (prefix < 4) return prefix + 1;
  extra = (prefix - 2) >> 1;
  return ((2 + (prefix & 1)) << extra) + br.readBits(extra) + 1;
}

function decodePixels(br, width, height, cacheBits, groups, meta, metaBits, metaWidth) {
  var total = width * height;
  var data = new Uint32Array(total);
  var cache = cacheBits > 0 ? new Uint32Array(1 << cacheBits) : null;
  var cacheShift = 32 - cacheBits;
  var cached = 0;
  var pos = 0, group = groups[0];
  var x, y, s, r, b, a, len, dist, code, end;
  while (pos < total) {
    if (meta) {
      x = pos % width;
      y = (pos - x) / width;
      group = groups[meta[(y >> metaBits) * metaWidth + (x >> metaBits)]];
    }
    s = readSymbol(br, group[0]);
    if (s < 256) {
      r = readSymbol(br, group[1]);
      b = readSymbol(br, group[2]);
      a = readSymbol(br, group[3]);
      data[pos++] = (a << 24 | r << 16 | s << 8 | b) >>> 0;
    } else if (s < 256 + NUM_LENGTH_CODES) {
      len = readLengthOrDistance(br, s - 256);
      code = readLengthOrDistance(br, readSymbol(br, group[4]));
      if (code > 120) {
        dist = code - 120;
      } else {
        dist = DISTANCE_MAP[code * 2 - 2] + DISTANCE_MAP[code * 2 - 1] * width;
        if (dist < 1) dist = 1;
      }
      if (dist > pos || pos + len > total) stop('Invalid WebP backward reference');
      for (end = pos + len; pos < end; pos++) data[pos] = data[pos - dist];
    } else {
      if (!cache) stop('Invalid WebP color cache reference');
      while (cached < pos) addToCache(cache, data[cached++], cacheShift);
      data[pos++] = cache[s - 256 - NUM_LENGTH_CODES];
    }
    if (cache) {
      while (cached < pos) addToCache(cache, data[cached++], cacheShift);
    }
  }
  return data;
}

function addToCache(cache, argb, shift) {
  cache[Math.imul(0x1e35a7bd, argb) >>> shift] = argb;
}

function applyInverseTransform(t, data, height) {
  if (t.type === 0) inversePredictor(t, data, height);
  else if (t.type == 1) inverseColorTransform(t, data, height);
  else if (t.type == 2) addGreen(data);
  else return inverseColorIndexing(t, data, height);
  return data;
}

function addGreen(data) {
  var p, g;
  for (var i = 0; i < data.length; i++) {
    p = data[i];
    g = (p >> 8) & 0xff;
    data[i] = ((p & 0xff00ff00) | (((p >> 16) + g) & 0xff) << 16 | ((p + g) & 0xff)) >>> 0;
  }
}

function inverseColorTransform(t, data, height) {
  var w = t.xsize;
  var x, y, i, m, g2r, g2b, r2b, p, g, r, b;
  for (y = 0; y < height; y++) {
    for (x = 0; x < w; x++) {
      m = t.data[(y >> t.bits) * t.blocksWide + (x >> t.bits)];
      g2r = toInt8(m);
      g2b = toInt8(m >> 8);
      r2b = toInt8(m >> 16);
      i = y * w + x;
      p = data[i];
      g = toInt8(p >> 8);
      r = ((p >> 16) + ((g2r * g) >> 5)) & 0xff;
      b = (p + ((g2b * g) >> 5) + ((r2b * toInt8(r)) >> 5)) & 0xff;
      data[i] = ((p & 0xff00ff00) | r << 16 | b) >>> 0;
    }
  }
}

function toInt8(v) {
  return (v & 0xff) << 24 >> 24;
}

function inverseColorIndexing(t, data, height) {
  var w = t.xsize;
  var out = new Uint32Array(w * height);
  var table = t.table;
  var packedWidth = t.packedWidth;
  var perPixel = 1 << t.bits;
  var bitsPerIndex = 8 >> t.bits;
  var mask = (1 << bitsPerIndex) - 1;
  var x, y, idx;
  for (y = 0; y < height; y++) {
    for (x = 0; x < w; x++) {
      idx = (data[y * packedWidth + (x >> t.bits)] >> 8) & 0xff;
      idx = (idx >> ((x & (perPixel - 1)) * bitsPerIndex)) & mask;
      out[y * w + x] = idx < table.length ? table[idx] : 0;
    }
  }
  return out;
}

function inversePredictor(t, data, height) {
  var w = t.xsize;
  var x, y, i, mode;
  if (w * height === 0) return;
  data[0] = addPixels(data[0], 0xff000000);
  for (x = 1; x < w; x++) data[x] = addPixels(data[x], data[x - 1]);
  for (y = 1; y < height; y++) {
    i = y * w;
    data[i] = addPixels(data[i], data[i - w]);
    for (x = 1; x < w; x++) {
      i = y * w + x;
      mode = (t.data[(y >> t.bits) * t.blocksWide + (x >> t.bits)] >> 8) & 0xf;
      data[i] = addPixels(data[i], predict(mode, data, i, w));
    }
  }
}

// The top-right neighbor of a pixel in the rightmost column is the first
// pixel of the current row, which is where data[i - w + 1] falls.
function predict(mode, data, i, w) {
  var L = data[i - 1], T = data[i - w], TR = data[i - w + 1], TL = data[i - w - 1];
  switch (mode) {
    case 0: return 0xff000000;
    case 1: return L;
    case 2: return T;
    case 3: return TR;
    case 4: return TL;
    case 5: return average2(average2(L, TR), T);
    case 6: return average2(L, TL);
    case 7: return average2(L, T);
    case 8: return average2(TL, T);
    case 9: return average2(T, TR);
    case 10: return average2(average2(L, TL), average2(T, TR));
    case 11: return select(L, T, TL);
    case 12: return clampAddSubtractFull(L, T, TL);
    case 13: return clampAddSubtractHalf(average2(L, T), TL);
  }
  return 0xff000000; // modes 14 and 15 are unused by encoders
}

function addPixels(a, b) {
  return ((((a >>> 24) + (b >>> 24)) & 0xff) << 24 |
    (((a >> 16) + (b >> 16)) & 0xff) << 16 |
    (((a >> 8) + (b >> 8)) & 0xff) << 8 |
    ((a + b) & 0xff)) >>> 0;
}

function average2(a, b) {
  return ((((a >>> 24) + (b >>> 24)) >> 1) << 24 |
    ((((a >> 16) & 0xff) + ((b >> 16) & 0xff)) >> 1) << 16 |
    ((((a >> 8) & 0xff) + ((b >> 8) & 0xff)) >> 1) << 8 |
    (((a & 0xff) + (b & 0xff)) >> 1)) >>> 0;
}

function select(L, T, TL) {
  var pL = 0, pT = 0, s, c, t, l;
  for (s = 0; s < 32; s += 8) {
    c = (TL >>> s) & 0xff;
    t = (T >>> s) & 0xff;
    l = (L >>> s) & 0xff;
    pL += Math.abs(t - c);
    pT += Math.abs(l - c);
  }
  return pL < pT ? L : T;
}

function clampAddSubtractFull(a, b, c) {
  var out = 0, s;
  for (s = 0; s < 32; s += 8) {
    out |= clamp255(((a >>> s) & 0xff) + ((b >>> s) & 0xff) - ((c >>> s) & 0xff)) << s;
  }
  return out >>> 0;
}

function clampAddSubtractHalf(a, b) {
  var out = 0, s, va;
  for (s = 0; s < 32; s += 8) {
    va = (a >>> s) & 0xff;
    out |= clamp255(va + (((va - ((b >>> s) & 0xff)) / 2) | 0)) << s;
  }
  return out >>> 0;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function argbToRgba(argb) {
  var out = new Uint8Array(argb.length * 4);
  var p, j;
  for (var i = 0; i < argb.length; i++) {
    p = argb[i];
    j = i * 4;
    out[j] = (p >> 16) & 0xff;
    out[j + 1] = (p >> 8) & 0xff;
    out[j + 2] = p & 0xff;
    out[j + 3] = p >>> 24;
  }
  return out;
}
