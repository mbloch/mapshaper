/* @requires mapshaper-encodings, mapshaper-file-reader */

internal.GeoJSONReader = GeoJSONReader;

// Read GeoJSON Features or geometry objects from a file
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
      cb(JSON.parse(obj.text)); // Use JSON.parse to parse object
      obj = readObject(obj.offset);
    }
  }

  // Search for a JSON object starting at position @offs
  // Returns {text: "<object>", offset: <offset>} or null
  //   <offset> is the file position directly after the object's closing brace
  // Skips characters in front of first left curly brace
  function readObject(offs) {
    var LBRACE = 123,
        RBRACE = 125,
        BSLASH = 92,
        DQUOTE = 34,
        level = 0,
        inString = false,
        escapeNext = false,
        buf = reader.readSync(offs),
        retn = null,
        startPos, i, n, c;
    for (i=0, n=buf.length; i<n; i++) {
      c = buf[i];
      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (c == DQUOTE) {
          inString = false;
        } else if (c == BSLASH) {
          escapeNext = true;
        }
      } else if (c == DQUOTE) {
        inString = true;
      } else if (c == LBRACE) {
        if (level === 0) {
          startPos = i;
        }
        level++;
      } else if (c == RBRACE) {
        level--;
        if (level === 0) {
          retn = {
            text: internal.bufferToString(buf, 'utf8', startPos, i + 1),
            offset: offs + i + 1
          };
          break;
        } else if (level == -1) {
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
