import { bufferToString } from '../text/mapshaper-encodings';
import { stop } from '../utils/mapshaper-logging';

// Read GeoJSON Features or geometry objects from a file
// @reader: a FileReader
export function GeoJSONReader(reader) {

  // Read objects synchronously, with callback
  this.readObjects = function(onObject) {
    // Search first x bytes of file for features|geometries key
    // 300 bytes not enough... GeoJSON files can have additional non-standard properties, e.g. 'metadata'
    // var bytesToSearch = 300;
    var bytesToSearch = 5000;
    var start = reader.findString('"features"', bytesToSearch) ||
        reader.findString('"geometries"', bytesToSearch);
    // Assume single Feature or geometry if collection not found
    var offset = start ? start.offset : 0;
    readObjects(offset, onObject);
  };

  this.readObject = readObject;

  function readObjects(offset, cb) {
    var obj = readObject(offset);
    var json;
    while (obj) {
      try {
        json = JSON.parse(obj.text);
      } catch(e) {
        stop('JSON parsing error --', adjustPositionMessage(e.message, offset + obj.start));
      }
      cb(json);
      offset = obj.end;
      obj = readObject(obj.end);
    }
  }

  // msg: JSON.parse() error message, e.g. "Unexpected token . in JSON at position 579"
  // offset: start position of the parsed text in the JSON file
  function adjustPositionMessage(msg, offset) {
    var rxp = /position (\d+)/; // assumes no thousands separator in error message
    var match = rxp.exec(msg);
    if (match) {
      msg = msg.replace(rxp, 'position ' + (offset + parseInt(match[1])));
    }
    return msg;
  }

  // Search for a JSON object starting at position @offs
  // Returns {text: "<object>", offset: <offset>} or null
  //   <offset> is the file position directly after the object's closing brace
  // Skips characters in front of first left curly brace
  function readObject(offs) {
    var LBRACE = 123,
        RBRACE = 125,
        RBRACK = 93,
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
            text: bufferToString(buf, 'utf8', startPos, i + 1),
            start: startPos,
            end: offs + i + 1
          };
          break;
        } else if (level == -1) {
          break; // error -- "}" encountered before "{"
        }
      } else if (c == RBRACK && level === 0) {
        break; // end of collection
      }
      if (i == n-1) {
        buf = reader.expandBuffer().readSync(offs);
        n = buf.length;
      }
    }
    return retn;
  }
}
