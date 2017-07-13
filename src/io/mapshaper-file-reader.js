/* @requires mapshaper-common */

internal.FileReader = FileReader;

function FileReader(path, opts) {
  var fs = require('fs');
  var DEFAULT_CACHE_LEN = opts && opts.cacheSize || 0x2000000, // 32 MB
      DEFAULT_BUFFER_LEN = opts && opts.bufferSize || 0x4000, // 32K
      cacheOffs, cache, fd, fileLen;

  //try {
    fileLen = fs.statSync(path).size;
    fd = fs.openSync(path, 'r');
    updateCache(0);
  //} catch(e) {}

  this.expandBuffer = function() {
    DEFAULT_BUFFER_LEN *= 2;
    return this;
  };

  this.getBuffer = function(readOffs, len) {
    var cacheLen = cache.length,
        bufLen = len || DEFAULT_BUFFER_LEN,
        cacheHeadroom;

    if (!(readOffs >= 0 && readOffs <= fileLen)) {
      // out-of-range request: return empty buffer
      throw new Error("Out-of-range read request:", readOffs);
    }

    // reduce buffer size if current size exceeds file length
    if (readOffs + bufLen > fileLen) {
      bufLen = fileLen - readOffs;
    }

    // update file cache if requested segment extends beyond the current cache range
    cacheHeadroom = cacheLen + cacheOffs - readOffs;
    if (readOffs < cacheOffs || cacheHeadroom < bufLen) {
      updateCache(readOffs);
    }

    // return a slice of the file cache
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
      cacheOffs = 0;
    }
  };

  function updateCache(fileOffs) {
    var headroom = fileLen - fileOffs,
        cacheLen = DEFAULT_CACHE_LEN,
        bytesRead;
    if (DEFAULT_BUFFER_LEN > cacheLen) {
      cacheLen = DEFAULT_BUFFER_LEN;
    }
    if (headroom < cacheLen) {
      cacheLen = headroom;
    }
    cache = new Buffer(cacheLen);
    cacheOffs = fileOffs;
    bytesRead = fs.readSync(fd, cache, 0, cacheLen, fileOffs);
    if (bytesRead != cacheLen) throw new Error("Error reading file");
  }
}

FileReader.prototype.findString = function (str, maxLen) {
  var buf = this.getBuffer(0, maxLen || 256);
  var strLen = str.length;
  var n = buf.length - strLen;
  var firstByte = str.charCodeAt(0);
  var i;
  for (i=0; i < n; i++) {
    if (buf[i] == firstByte) {
      if (buf.toString('utf8', i, i + strLen) == str) {
        return {
          offset: i + strLen,
          text: buf.toString('utf8', 0, i)
        };
      }
    }
  }
  return null;
};
