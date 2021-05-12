import { bufferToString } from '../text/mapshaper-encodings';
import { stop, debug } from '../utils/mapshaper-logging';
import { parseObjects } from '../geojson/json-parser';
import { T } from '../utils/mapshaper-timing';

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
    // (this works for ndjson files too)
    var offset = start ? start.offset : 0;
    T.start();
    parseObjects(reader, offset, onObject);
    // parseObjects_native(reader, offset, onObject);
    debug('Parse GeoJSON', T.stop());
  };
}

// Parse the entire file with JSON.parse() (for a performance comparison)
function parseObjects_native(reader, offset, cb) {
  var obj = JSON.parse(reader.toString());
  var arr = obj.features || obj.geometries || [obj];
  arr.forEach(o => cb(o));
}
