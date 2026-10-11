
import { bufferToString, getStreamingDecoder } from '../text/mapshaper-encodings';
import { getStashedVar } from '../mapshaper-stash';
import { BinArray } from '../utils/mapshaper-binarray';
import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cli from '../cli/mapshaper-cli-utils';
import require from '../mapshaper-require';

export function readFirstChars(reader, n) {
  return bufferToString(reader.readSync(0, Math.min(n || 1000, reader.size())));
}

// Wraps a FileReader or BufferReader containing text in an encoding that can't be
// parsed byte-by-byte as ascii (e.g. UTF-16), and returns the text as UTF-8 bytes.
// Like FileReader#readSync(), readSync() returns a view that is only valid until
// the next read. Reads can only move forward: bytes before @start are discarded.
// The size of the UTF-8 output is unknown until the end; readSync() returns
// fewer than @length bytes at the end of the text.
export function TranscodingReader(reader, encoding, opts) {
  var chunkSize = opts && opts.chunkSize || 0x1000000,
      decoder = getStreamingDecoder(encoding),
      encoder = new TextEncoder(),
      inputSize = reader.size(),
      inputPos = 0,
      finished = false,
      heldChar = '', // first half of a surrogate pair, if decoded text ended with one
      buf = utils.createBuffer(0),
      bufStart = 0, // offset of buf[0] in the UTF-8 output
      bufLen = 0;   // number of decoded bytes in buf

  this.readSync = function(start, length) {
    if (start < bufStart || start > bufStart + bufLen) {
      error('TranscodingReader: unsupported read position');
    }
    discardBytes(start - bufStart);
    while (bufLen < length && !finished) {
      decodeMore();
    }
    return buf.subarray(0, Math.min(length, bufLen));
  };

  function discardBytes(n) {
    if (n > 0) {
      buf.copyWithin(0, n, bufLen);
      bufLen -= n;
      bufStart += n;
    }
  }

  function decodeMore() {
    var str, bytes;
    if (inputPos < inputSize) {
      bytes = reader.readSync(inputPos, Math.min(chunkSize, inputSize - inputPos));
      inputPos += bytes.length;
      str = decoder.write(bytes);
    } else {
      str = decoder.end() || '';
      finished = true;
    }
    str = heldChar + str;
    heldChar = '';
    // TextEncoder would encode half of a surrogate pair as U+FFFD
    if (!finished && isHighSurrogate(str.charCodeAt(str.length - 1))) {
      heldChar = str[str.length - 1];
      str = str.slice(0, -1);
    }
    // a UTF-16 code unit becomes at most 3 bytes of UTF-8
    reserveBytes(bufLen + str.length * 3);
    bufLen += encoder.encodeInto(str, buf.subarray(bufLen)).written;
  }

  function isHighSurrogate(c) {
    return c >= 0xD800 && c <= 0xDBFF;
  }

  // The buffer is reused, so large files don't allocate a new buffer for each chunk
  function reserveBytes(n) {
    if (n <= buf.length) return;
    var buf2 = utils.createBuffer(Math.max(n, buf.length * 2));
    buf.copy(buf2, 0, 0, bufLen);
    buf = buf2;
  }
}

// Same interface as FileReader, for reading from a Buffer or ArrayBuffer instead of a file.
export function BufferReader(src) {
  var bufSize = src.byteLength || src.length,
      binArr, buf;

  this.readToBinArray = function(start, length) {
    if (bufSize < start + length) {
      error("Out-of-range error");
    }
    if (!binArr) binArr = new BinArray(src);
    binArr.position(start);
    return binArr;
  };

  this.toString = function(enc) {
    return bufferToString(buffer(), enc);
  };

  this.readSync = function(start, length) {
    // TODO: consider using a default length like FileReader
    return buffer().slice(start, length ? start + length : bufSize);
  };

  function buffer() {
    if (!buf) {
      // buf = (src instanceof ArrayBuffer) ? utils.createBuffer(src) : src;
      buf = utils.toBuffer(src);
    }
    return buf;
  }

  this.findString = FileReader.prototype.findString;
  this.expandBuffer = function() {return this;};
  this.size = function() {return bufSize;};
  this.close = function() {};
}

export function FileReader(path, opts) {
  var fs = require('fs'),
      fileLen = fs.statSync(path).size,
      DEFAULT_CACHE_LEN = opts && opts.cacheSize || 0x1000000, // 16MB
      DEFAULT_BUFFER_LEN = opts && opts.bufferSize || 0x40000, // 256K
      fd, cacheOffs, cache, binArr;
  // kludge to let us check if input files are being overwritten
  (getStashedVar('input_files') || []).push(path);

  // Double the default size of the Buffer returned by readSync()
  this.expandBuffer = function() {
    DEFAULT_BUFFER_LEN *= 2;
    if (DEFAULT_BUFFER_LEN * 2 > DEFAULT_CACHE_LEN) {
      // Keep the file cache larger than the default buffer size.
      // This fixes a performance bug caused when the size of the buffer returned by
      // readSync() grows as large as the file cache, causing each subsequent
      // call to readSync() to trigger a call to fs.readFileSync()
      DEFAULT_CACHE_LEN = DEFAULT_BUFFER_LEN * 2;
    }
    return this;
  };

  // Read to BinArray (for compatibility with ShpReader)
  this.readToBinArray = function(start, length) {
    if (updateCache(start, length)) {
      binArr = new BinArray(cache);
    }
    binArr.position(start - cacheOffs);
    return binArr;
  };

  // Returns a Buffer containing a string of bytes read from the file
  // start: file offset of the first byte
  // length: (optional) length of the returned Buffer
  this.readSync = function(start, length) {
    if (length > 0 === false) {
      // use default size if length is not specified
      length = DEFAULT_BUFFER_LEN;
    }

    if (start + length > fileLen) {
      length = fileLen - start; // truncate at eof
    }
    if (length === 0) {
      return utils.createBuffer(0); // kludge to allow reading up to eof
    }
    updateCache(start, length);
    return cache.slice(start - cacheOffs, start - cacheOffs + length);
  };

  this.size = function() {
    return fileLen;
  };

  this.toString = function(enc) {
    // TODO: use fd
    return cli.readFile(path, enc || 'utf8');
  };

  this.close = function() {
    if (fd) {
      fs.closeSync(fd);
      fd = null;
      cache = null;
    }
  };

  // Update the file cache (if necessary) so that a given range of bytes is available.
  // Receive: offset and length of byte string that must be read
  // Returns: true if cache was updated, or false
  function updateCache(fileOffs, bytesNeeded) {
    var headroom = fileLen - fileOffs,
        bytesRead, bytesToRead;
    if (headroom < bytesNeeded || headroom < 0) {
      error("Tried to read past end-of-file");
    }
    if (cache && fileOffs >= cacheOffs && cacheOffs + cache.length >= fileOffs + bytesNeeded) {
      // cache contains enough data to satisfy the request (no need to read from disk)
      return false;
    }
    bytesToRead = Math.max(DEFAULT_CACHE_LEN, bytesNeeded);
    if (headroom < bytesToRead) {
      bytesToRead = headroom;
    }
    if (!cache || bytesToRead != cache.length) {
      cache = utils.createBuffer(bytesToRead);
    }
    if (!fd) {
      fd = fs.openSync(path, 'r');
    }
    bytesRead = fs.readSync(fd, cache, 0, bytesToRead, fileOffs);
    cacheOffs = fileOffs;
    if (bytesRead != bytesToRead) error("Error reading file");
    return true;
  }
}

FileReader.prototype.findString = function (str, maxLen) {
  var len = Math.min(this.size(), maxLen || this.size());
  var buf = this.readSync(0, len);
  var strLen = str.length;
  var n = buf.length - strLen;
  var firstByte = str.charCodeAt(0);
  var i;
  for (i=0; i < n; i++) {
    if (buf[i] == firstByte && buf.toString('utf8', i, i + strLen) == str) {
      return {
        offset: i + strLen,
        text: buf.toString('utf8', 0, i)
      };
    }
  }
  return null;
};
