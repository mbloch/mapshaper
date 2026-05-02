import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import {
  serializeWithColumns,
  getHeaderMeta,
  buildHeaderWithCRS,
  magicbytes,
  SIZE_PREFIX_LEN
} from '../flatgeobuf/mapshaper-flatgeobuf-lib';
import { getColumnType } from '../datatable/mapshaper-data-utils';
import { stop, message } from '../utils/mapshaper-logging';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import {
  crsToPrj,
  crsToWkt2,
  getDatasetCrsInfo,
  isWGS84,
  isWebMercator,
  parseAuthorityCodeString,
  parseAuthorityCodeFromWkt
} from '../crs/mapshaper-projections';

export function exportFlatGeobuf(dataset, opts) {
  var extension = opts.extension || 'fgb';
  if (opts.file) {
    // Keep behavior consistent with other exporters that honor explicit output filename.
    extension = getFileExtension(opts.file) || extension;
  }
  var crsMeta = resolveOutputCRS(dataset);
  return dataset.layers.map(function(lyr) {
    var geojson = getFeatureCollection(lyr, dataset, opts);
    var columns = getFlatGeobufColumns(lyr);
    var content = serializeWithColumns(geojson, columns);
    var filename = lyr.name + '.' + extension;
    if (crsMeta) {
      content = rewriteHeaderWithCRS(content, crsMeta);
    } else {
      message('Wrote', filename, 'without a CRS in the FlatGeobuf header (mapshaper could not derive CRS metadata for this dataset). Downstream tools may misinterpret the coordinates or refuse to load the file.');
    }
    return {
      content: content,
      filename: filename
    };
  });
}

function getFeatureCollection(lyr, dataset, opts) {
  var features = exportLayerAsGeoJSON(lyr, dataset, opts, true, null);
  if (features.length === 0) {
    stop('FlatGeobuf export does not support empty layers');
  }
  return {
    type: 'FeatureCollection',
    features: features
  };
}

function getFlatGeobufColumns(lyr) {
  var records = lyr.data ? lyr.data.getRecords() : [];
  return lyr.data ? lyr.data.getFields().map(function(name) {
    return {
      name: name,
      type: getFlatGeobufColumnType(name, records),
      title: null,
      description: null,
      width: -1,
      precision: -1,
      scale: -1,
      nullable: true,
      unique: false,
      primary_key: false
    };
  }) : [];
}

function getFlatGeobufColumnType(name, records) {
  var type = getColumnType(name, records);
  if (type == 'boolean') return 2; // ColumnType.Bool
  if (type == 'number') return getFlatGeobufNumberType(name, records);
  if (type == 'object') return 12; // ColumnType.Json
  return 11; // ColumnType.String
}

function getFlatGeobufNumberType(name, records) {
  var min = Infinity;
  var max = -Infinity;
  var hasValue = false;
  var val;
  for (var i = 0; i < records.length; i++) {
    val = records[i] ? records[i][name] : null;
    if (val === null || val === undefined) continue;
    if (!Number.isFinite(val) || Math.floor(val) !== val) {
      return 10; // ColumnType.Double
    }
    hasValue = true;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  if (!hasValue) return 10; // ColumnType.Double
  if (min >= -2147483648 && max <= 2147483647) return 5; // ColumnType.Int
  if (Number.isSafeInteger(min) && Number.isSafeInteger(max)) return 7; // ColumnType.Long
  return 10; // ColumnType.Double
}

// Try several strategies to derive CRS metadata for the dataset. Returns
// a CRS-meta object suitable for buildHeaderWithCRS(), or null if no
// CRS metadata could be found. Prefer authority/code when available, but
// also write WKT so custom CRSes can be read by CRS-aware tools.
function resolveOutputCRS(dataset) {
  var info = (dataset && dataset.info) || {};
  var meta;

  // 1. Round-tripped from another FlatGeobuf
  meta = normalizeCRS(info.flatgeobuf_crs);
  if (meta) return addWktToCRS(meta, dataset);

  // 2. Round-tripped from a GeoPackage with an EPSG-coded SRS
  if (info.geopackage_crs &&
      String(info.geopackage_crs.organization || '').toUpperCase() === 'EPSG') {
    meta = normalizeCRS({
      org: 'EPSG',
      code: info.geopackage_crs.organization_coordsys_id || info.geopackage_crs.srs_id
    });
    if (meta) return addWktToCRS(meta, dataset);
  }

  // 3. Explicit "epsg:NNNN" / "esri:NNNN" string set by -proj or alike
  meta = normalizeCRS(parseAuthorityCodeString(info.crs_string));
  if (meta) return addWktToCRS(meta, dataset);

  // 4. AUTHORITY["EPSG", N] in a .prj/WKT1 string (typically from a Shapefile)
  meta = normalizeCRS(parseAuthorityCodeFromWkt(info.wkt1));
  if (meta) return addWktToCRS(meta, dataset);

  // 5. Recognized CRS object: WGS-84 (any encoding) or Web Mercator.
  // getDatasetCrsInfo() also auto-detects WGS-84 from lat/lng-like bounds,
  // which is how GeoJSON sources end up with a usable CRS object.
  var crsInfo;
  try {
    crsInfo = getDatasetCrsInfo(dataset);
  } catch (e) {
    crsInfo = null;
  }
  if (crsInfo && crsInfo.crs) {
    if (isWGS84(crsInfo.crs)) {
      return addWktToCRS(normalizeCRS({org: 'EPSG', code: 4326}), dataset, crsInfo);
    }
    if (isWebMercator(crsInfo.crs)) {
      return addWktToCRS(normalizeCRS({org: 'EPSG', code: 3857}), dataset, crsInfo);
    }
    meta = addWktToCRS({}, dataset, crsInfo);
    if (meta) return meta;
  }

  return null;
}

function normalizeCRS(crs) {
  if (!crs) return null;
  var code = +crs.code;
  var hasCode = Number.isFinite(code) && code > 0;
  if (hasCode) code = Math.round(code);
  var org = crs.org ? String(crs.org).toUpperCase() : null;
  if (!org && hasCode && looksLikeEPSGCode(code)) {
    org = 'EPSG';
  }
  if (hasCode && org != 'EPSG') return null;
  if (!hasCode && !crs.wkt) return null;
  return {
    org: hasCode ? 'EPSG' : null,
    code: hasCode ? code : null,
    name: crs.name || null,
    description: crs.description || null,
    wkt: crs.wkt || null,
    code_string: hasCode ? (crs.code_string || ('EPSG:' + code)) : null
  };
}

function addWktToCRS(meta, dataset, crsInfoArg) {
  if (!meta) return null;
  var info = dataset && dataset.info || {};
  if (meta.wkt && isWkt2(meta.wkt)) return meta;
  var crsInfo = crsInfoArg || getSafeDatasetCrsInfo(dataset);
  var crs = crsInfo && crsInfo.crs;
  var wkt = crs ? crsToWkt2(crs) : null;
  if (!wkt && meta.wkt) wkt = meta.wkt;
  if (!wkt && crs) wkt = crsToPrj(crs);
  if (!wkt && info.wkt1) wkt = info.wkt1;
  if (wkt) meta.wkt = wkt;
  return meta.code || meta.wkt ? meta : null;
}

function getSafeDatasetCrsInfo(dataset) {
  try {
    return getDatasetCrsInfo(dataset);
  } catch (e) {
    return null;
  }
}

function isWkt2(wkt) {
  return /^(GEODCRS|GEOGCRS|PROJCRS|VERTCRS|ENGCRS|BOUNDCRS|COMPOUNDCRS)\s*\[/i.test(String(wkt || '').trim());
}

function looksLikeEPSGCode(code) {
  return code >= 2000 && code <= 1000000;
}

function rewriteHeaderWithCRS(content, crsMeta) {
  var bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var oldHeaderLength = view.getUint32(magicbytes.length, true);
  var oldHeaderOffset = magicbytes.length;
  var oldFeaturesOffset = oldHeaderOffset + SIZE_PREFIX_LEN + oldHeaderLength;
  var headerMeta = getHeaderMeta(bytes);
  var newHeader = buildHeaderWithCRS(headerMeta, crsMeta);
  var oldFeatures = bytes.subarray(oldFeaturesOffset);
  var output = new Uint8Array(magicbytes.length + newHeader.length + oldFeatures.length);
  output.set(bytes.subarray(0, magicbytes.length), 0);
  output.set(newHeader, magicbytes.length);
  output.set(oldFeatures, magicbytes.length + newHeader.length);
  return output;
}
