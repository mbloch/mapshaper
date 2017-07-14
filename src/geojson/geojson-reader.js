/* @requires mapshaper-common, mapshaper-file-reader */

internal.GeoJSONReader = GeoJSONReader;

// @reader: a FileReader
function GeoJSONReader(reader) {

  // Read objects synchronously, with callback
  this.readObjects = function(onObject) {
    // Search first x bytes of file for features|geometries key
    var bytesToSearch = 300;
    var start = reader.findString('"features"', bytesToSearch) ||
        reader.findString('"geometries"', bytesToSearch);
    // Assume single Feature or geometry if collection not found
    var offset = start ? start.offset : 0;
    readObjects(offset, onObject);
  };

  this.readObject = readObject;

  function readObjects(start, cb) {
    var obj = readObject(start);
    while (obj) {
      cb(JSON.parse(obj.text));
      obj = readObject(obj.offset);
    }
  }

  // Returns {text: "{...}", offset} or null
  // Skips characters in front of first left curly brace
  function readObject(offs) {
    var LCB = 123,
        RCB = 125,
        BSL = 92,
        QUO = 34,
        buf = reader.readSync(offs),
        n = buf.length,
        indent = 0,
        inString = false,
        escape = false,
        retn = null,
        i, c, iStart;
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
          retn = {text: buf.toString('utf8', iStart, i + 1), offset: offs + i + 1};
          break;
        } else if (indent == -1) {
          break; // error -- "}" encountered before "{"
        }
      }
      if (i == n-1) {
        buf = reader.expandBuffer().readSync(offs);
        n = buf.length;
      }
    }
    return retn;
  }
}
