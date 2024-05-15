import { bufferToString } from '../text/mapshaper-encodings';
import { stop, debug } from '../utils/mapshaper-logging';
import { parseGeoJSON, parseGeoJSON_native } from '../geojson/json-parser';
import { T } from '../utils/mapshaper-timing';

// Read GeoJSON Features or geometry objects from a file
// @reader: a FileReader
export function GeoJSONReader(reader) {

  this.readObjects = function(onObject) {
    T.start();
    var val = parseGeoJSON(reader, onObject);
    // var val = parseGeoJSON_native(reader, onObject);
    debug('Parse GeoJSON', T.stop());
    return val;
  };
}
