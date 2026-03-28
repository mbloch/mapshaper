import { GeoJSONParser } from '../geojson/geojson-import';
import { getHeaderMeta, getFeatureReader } from '../flatgeobuf/mapshaper-flatgeobuf-lib';

export function importFlatgeobuf(content, opts) {
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
  dataset.info.flatgeobuf_crs = headerMeta.crs || null;
  return dataset;
}
