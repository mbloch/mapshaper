import { exportDatasetAsGeoJSON } from '../geojson/geojson-export';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';
// import { isKmzFile } from '../io/mapshaper-file-types';

export function exportKML(dataset, opts) {
  var toKML = require("@placemarkio/tokml").toKML;
  var geojsonOpts = Object.assign({combine_layers: true, geojson_type: 'FeatureCollection'}, opts);
  var geojson = exportDatasetAsGeoJSON(dataset, geojsonOpts);
  var kml = toKML(geojson);
  // TODO: add KMZ output
  // var useKmz = opts.file && isKmzFile(opts.file);
  var ofile = opts.file || getOutputFileBase(dataset) + '.kml';
  return [{
    content: kml,
    filename: ofile
  }];
}