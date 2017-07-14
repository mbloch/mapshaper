/* @requires mapshaper-common */

internal.FileReader = FileReader;

function FileReader(path, opts) {
  var fs = require('fs'),
      fileLen = fs.statSync(path).size,
      fd = fs.openSync(path, 'r'),
      DEFAULT_CACHE_LEN = opts && opts.cacheSize || 0x800000, // 8MB
      DEFAULT_BUFFER_LEN = opts && opts.bufferSize || 0x4000, // 32K
      cacheOffs, cache;

  this.expandBuffer = function() {
    DEFAULT_BUFFER_LEN *= 2;
    return this;
  };

  this.getBuffer = function(readOffs, len) {
    var bufLen = len || DEFAULT_BUFFER_LEN;
    if (!(readOffs >= 0 && readOffs <= fileLen)) {
      error("Out-of-range byte position:", readOffs);
    }
    if (readOffs + bufLen > fileLen) {
      // reduce buffer size if current size exceeds file length
      bufLen = fileLen - readOffs;
    }
    if (!cache || cacheOffs > readOffs || cacheOffs + cache.length < readOffs + bufLen) {
      // update file cache if requested segment extends beyond the current cache range
      updateCache(readOffs, bufLen);
    }
    return cache.slice(readOffs - cacheOffs, readOffs - cacheOffs + bufLen);
  };

  this.size = function() {
    return fileLen;
  };

  this.close = function() {
    if (fd) {
      fs.closeSync(fd);
      fd = null;
      cache = null;
    }
  };

  // Receive offset and length of buffer that must be read from the cache
  function updateCache(fileOffs, bufLen) {
    var headroom = fileLen - fileOffs,
        bytesToRead = DEFAULT_CACHE_LEN,
        bytesRead;
    if (bufLen > bytesToRead) {
      bytesToRead = bufLen;
    }
    if (headroom < bytesToRead) {
      bytesToRead = headroom;
    }
    if (!cache || bytesToRead != cache.length) {
      cache = new Buffer(bytesToRead);
    }
    cacheOffs = fileOffs;
    bytesRead = fs.readSync(fd, cache, 0, bytesToRead, fileOffs);
    if (bytesRead != bytesToRead) throw new Error("Error reading file");
    // console.log("read from", fileOffs, "to:", fileOffs + bytesToRead);
  }
}

FileReader.prototype.findString = function (str, maxLen) {
  var buf = this.getBuffer(0, maxLen || 256);
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
