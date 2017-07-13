/* @requires mapshaper-common */

internal.GeoJSONReader = GeoJSONReader;
internal.FileReader = FileReader;

function GeoJSONReader(reader) {
  var LCB = 123, // {
      RCB = 125, // }
      LSB = 91,  // [
      RSB = 93,  // ]
      BSL = 92,  // \
      QUO = 34,  // "
      COM = 39,  // ,
      SPC = 32,  // <sp>
      COL = 58;  // :

  this.parse = function(cbObject, cbDone) {
    var start = findString(0, 'features') || findString(0, 'geometries');
    if (!start) {
      cbObject(JSON.parse(reader.toString()));
    } else {
      readCollection(start.offset, cbObject);
    }
    cbDone();
  };

  this.findString = findString;
  this.readObject = readObject;

  function readCollection(start, cb) {
    var obj = readObject(start);
    while (obj) {
      cb(JSON.parse(obj.text));
      obj = readObject(obj.offset);
    }
  }

  // @offs: offset of location to start looking (assumes first char is not inside a string)
  function findString(offs, key, maxLen) {
    var buf = reader.getBuffer(offs);
    var n = buf.length;
    var inString = false;
    var escape = false;
    var retn = null;
    var strStart;
    var i, c, str;
    maxLen = maxLen || 256;

    for (i=0; i<n && i<maxLen; i++) {
      c = buf[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (c == QUO) {
          inString = false;
          str = extractText(buf, strStart + 1, i);
          if (str == key) {
            retn = {
              offset: offs + i + 1,
              text: extractText(buf, offs, strStart)
            };
            break;
          }
        } else if (c == BSL) {
          escape = true;
        }
      } else if (c == QUO) {
        inString = true;
        strStart = i;
      }
      if (i == n-1) {
        buf = reader.expandBuffer().getBuffer(offs);
        n = buf.length;
      }
    }
    return retn;
  }

  // Returns {text: "{...}", offset} or null
  // Skips characters in from of opening curly bracket
  function readObject(offs) {
    var buf = reader.getBuffer(offs);
    var n = buf.length;
    var indent = 0;
    var inString = false;
    var escape = false;
    var retn = null;
    var i, c, iStart;
    for (i=0; i<n; i++) {
      c = buf[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (c == QUO) {
          inString = false;
        } else if (c == BSL) {
          escape = true;
        }
      } else if (c == QUO) {
        inString = true;
      } else if (c == LCB) {
        if (indent === 0) {
          iStart = i;
        }
        indent++;
      } else if (c == RCB) {
        indent--;
        if (indent === 0) {
          retn = {text: extractText(buf, iStart, i + 1), offset: offs + i + 1};
          break;
        } else if (indent == -1) {
          break; // error -- "}" encountered before "{"
        }
      }
      if (i == n-1) {
        buf = reader.expandBuffer().getBuffer(offs);
        n = buf.length;
      }
    }
    return retn;
  }

  // @buf: contains UTF-8 text
  // Return a string containing text from @start to @end
  function extractText(buf, start, end) {
    return buf.toString('utf8', start, end);
  }
}


function FileReader(path, opts) {
  var fs = require('fs');
  var DEFAULT_CACHE_LEN = opts && opts.cacheSize || 0x2000000, // 32 MB
      DEFAULT_BUFFER_LEN = opts && opts.bufferSize || 0x1000, // 8K
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

  this.getBuffer = function(readOffs) {
    var cacheLen = cache.length,
        bufLen = DEFAULT_BUFFER_LEN,
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
