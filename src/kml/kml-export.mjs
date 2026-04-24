import { exportDatasetAsGeoJSON } from '../geojson/geojson-export';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';
import { isKmzFile } from '../io/mapshaper-file-types';
import { zipSync } from '../io/mapshaper-zip';
import require from '../mapshaper-require';

export function exportKML(dataset, opts) {
  var toKML = require("@placemarkio/tokml").toKML;
  var geojsonOpts = Object.assign({combine_layers: true, geojson_type: 'FeatureCollection'}, opts);
  var geojson = exportDatasetAsGeoJSON(dataset, geojsonOpts);
  var kml = toKML(geojson);
  var useKmz = !!(opts.file && isKmzFile(opts.file));
  var ofile = opts.file || getOutputFileBase(dataset) + (useKmz ? '.kmz' : '.kml');
  var content = useKmz
    ? zipSync([{ filename: 'doc.kml', content: kml }])
    : kml;
  return [{
    content: content,
    filename: ofile
  }];
}
