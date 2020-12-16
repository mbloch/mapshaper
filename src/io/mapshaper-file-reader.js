
import { bufferToString } from '../text/mapshaper-encodings';
import { getStateVar } from '../mapshaper-state';
import { BinArray } from '../utils/mapshaper-binarray';
import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cli from '../cli/mapshaper-cli-utils';

export function readFirstChars(reader, n) {
  return bufferToString(reader.readSync(0, Math.min(n || 1000, reader.size())));
}

// Wraps a BufferReader or FileReader with an API that keeps track of position in the file
export function Reader2(reader) {
  var offs = 0; // read-head position in bytes

  this.position = function() {return offs;};

  this.remaining = function() {
    return Math.max(reader.size() - offs, 0);
  };

  this.advance = function(i) {
    offs += i;
  };

  this.readSync = function() {
    return reader.readSync(offs);
  };

  this.expandBuffer = function() {
    reader.expandBuffer();
  };
}

// Same interface as FileReader, for reading from a Buffer or ArrayBuffer instead of a file.
export function BufferReader(src) {
  var bufSize = src.byteLength || src.length,
      binArr, buf;

  this.readToBinArray = function(start, length) {
    if (bufSize < start + length) error("Out-of-range error");
    if (!binArr) binArr = new BinArray(src);
    binArr.position(start);
    return binArr;
  };

  this.toString = function(enc) {
    return bufferToString(buffer(), enc);
  };

  this.readSync = function(start, length) {
    // TODO: consider using a default length like FileReader
    return buffer().slice(start, length || bufSize);
  };

  function buffer() {
    if (!buf) {
      buf = (src instanceof ArrayBuffer) ? utils.createBuffer(src) : src;
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

  getStateVar('input_files').push(path); // bit of a kludge

  this.expandBuffer = function() {
    DEFAULT_BUFFER_LEN *= 2;
    return this;
  };

  this.resetBuffer = function() {
    DEFAULT_BUFFER_LEN = opts && opts.bufferSize || 0x40000;
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

  // Read to Buffer
  this.readSync = function(start, length) {
    if (length > 0 === false) {
      // use default (but variable) size if length is not specified
      length = DEFAULT_BUFFER_LEN;
      if (start + length > fileLen) {
        length = fileLen - start; // truncate at eof
      }
      if (length === 0) {
        return utils.createBuffer(0); // kludge to allow reading up to eof
      }
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

  // Receive offset and length of byte string that must be read
  // Return true if cache was updated, or false
  function updateCache(fileOffs, bufLen) {
    var headroom = fileLen - fileOffs,
        bytesRead, bytesToRead;
    if (headroom < bufLen || headroom < 0) {
      error("Tried to read past end-of-file");
    }
    if (cache && fileOffs >= cacheOffs && cacheOffs + cache.length >= fileOffs + bufLen) {
      return false;
    }
    bytesToRead = Math.max(DEFAULT_CACHE_LEN, bufLen);
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
