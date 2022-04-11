
import { importGeoJSON } from '../geojson/geojson-import';

export function importKML(str, opts) {
  var togeojson = require("@tmcw/togeojson");
  var Parser = typeof DOMParser == 'undefined' ? require("@xmldom/xmldom").DOMParser : DOMParser;
  var geojson = togeojson.kml(new Parser().parseFromString(str, "text/xml"));
  return importGeoJSON(geojson, opts || {});
}
