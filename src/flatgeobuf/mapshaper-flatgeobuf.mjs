import { GeoJSONParser } from '../geojson/geojson-import';
import { getHeaderMeta, getFeatureReader } from '../flatgeobuf/mapshaper-flatgeobuf-lib';
import { warnOnce } from '../utils/mapshaper-logging';
import { initProjLibrary } from '../crs/mapshaper-projections';

export async function importFlatgeobuf(content, opts) {
  var bytes = new Uint8Array(content);
  var headerMeta = getHeaderMeta(bytes);
  var readFeature = getFeatureReader(bytes, headerMeta);
  var importer = new GeoJSONParser(opts);
  var feat = readFeature();
  var dataset;
  while (feat) {
    importer.parseObject(feat);
    feat = readFeature();
  }
  dataset = importer.done();
  dataset.info = dataset.info || {};
  dataset.info.flatgeobuf_header = headerMeta;
  var crs = headerMeta.crs || null;
  dataset.info.flatgeobuf_crs = crs;
  if (crs && crs.org && crs.code) {
    dataset.info.crs_string = crs.org.toLowerCase() + ':' + crs.code;
    await initProjLibrary({crs: dataset.info.crs_string});
  } else if (crs && crs.wkt) {
    warnOnce('Unable to import WKT2 CRS from FlatGeobuf');
  }
  return dataset;
}
