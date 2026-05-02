import { GeoJSONParser } from '../geojson/geojson-import';
import { getHeaderMeta, getFeatureReader } from '../flatgeobuf/mapshaper-flatgeobuf-lib';
import { warnOnce } from '../utils/mapshaper-logging';
import { initProjLibrary, parseWkt, wktToProj } from '../crs/mapshaper-projections';

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
  var crs = normalizeCRSMeta(headerMeta.crs || null);
  dataset.info.flatgeobuf_crs = crs;
  if (crs) {
    await importFlatGeobufCRS(dataset, crs);
  }
  return dataset;
}

async function importFlatGeobufCRS(dataset, crs) {
  var crsString = crs.org && crs.code ? crs.org.toLowerCase() + ':' + crs.code : null;
  if (crsString) {
    try {
      await initProjLibrary({crs: crsString});
      dataset.info.crs_string = crsString;
      return;
    } catch (e) {
      // Fall through and try WKT metadata if an authority lookup is unavailable.
    }
  }
  if (crs.wkt) {
    try {
      // Validate that mproj can parse the WKT, then keep the equivalent Proj4
      // string in crs_string so downstream projection handling works normally.
      parseWkt(crs.wkt);
      dataset.info.crs_string = wktToProj(crs.wkt);
      return;
    } catch (e) {
      warnOnce('Unable to import WKT CRS from FlatGeobuf');
    }
  }
}

function normalizeCRSMeta(crs) {
  if (!crs) return null;
  var code = +crs.code;
  if (!Number.isFinite(code) || code <= 0) {
    return Object.assign({}, crs, {code: null});
  }
  if (crs.org) return crs;
  code = Math.round(code);
  if (code >= 2000 && code <= 1000000) {
    // Some encoders write code but omit authority org; default to EPSG.
    return Object.assign({}, crs, {
      org: 'EPSG',
      code_string: crs.code_string || ('EPSG:' + code)
    });
  }
  return crs;
}
