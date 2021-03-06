import { bufferToString } from '../text/mapshaper-encodings';
import { stop } from '../utils/mapshaper-logging';
import { parseObjects } from '../geojson/json-parser';

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
    // console.time('read GeoJSON');
    parseObjects(reader, offset, onObject);
    // console.timeEnd('read GeoJSON');
  };
}
