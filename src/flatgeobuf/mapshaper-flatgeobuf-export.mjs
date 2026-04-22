import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import {
  serialize,
  getHeaderMeta,
  buildHeaderWithCRS,
  magicbytes,
  SIZE_PREFIX_LEN
} from '../flatgeobuf/mapshaper-flatgeobuf-lib';
import { stop, message } from '../utils/mapshaper-logging';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import {
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
    var content = serialize(geojson);
    var filename = lyr.name + '.' + extension;
    if (crsMeta) {
      content = rewriteHeaderWithCRS(content, crsMeta);
    } else {
      message('Wrote', filename, 'without a CRS in the FlatGeobuf header (mapshaper could not derive an EPSG code for this dataset). Downstream tools may misinterpret the coordinates or refuse to load the file.');
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

// Try several strategies to derive an EPSG code for the dataset. Returns
// a CRS-meta object suitable for buildHeaderWithCRS(), or null if no
// EPSG code could be found. We don't write WKT-only CRSes -- mapshaper
// can't reliably round-trip them and many readers ignore the WKT field.
function resolveOutputCRS(dataset) {
  var info = (dataset && dataset.info) || {};
  var meta;

  // 1. Round-tripped from another FlatGeobuf
  meta = normalizeCRS(info.flatgeobuf_crs);
  if (meta) return meta;

  // 2. Round-tripped from a GeoPackage with an EPSG-coded SRS
  if (info.geopackage_crs &&
      String(info.geopackage_crs.organization || '').toUpperCase() === 'EPSG') {
    meta = normalizeCRS({
      org: 'EPSG',
      code: info.geopackage_crs.organization_coordsys_id || info.geopackage_crs.srs_id
    });
    if (meta) return meta;
  }

  // 3. Explicit "epsg:NNNN" / "esri:NNNN" string set by -proj or alike
  meta = normalizeCRS(parseAuthorityCodeString(info.crs_string));
  if (meta) return meta;

  // 4. AUTHORITY["EPSG", N] in a .prj/WKT1 string (typically from a Shapefile)
  meta = normalizeCRS(parseAuthorityCodeFromWkt(info.wkt1));
  if (meta) return meta;

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
      return normalizeCRS({org: 'EPSG', code: 4326});
    }
    if (isWebMercator(crsInfo.crs)) {
      return normalizeCRS({org: 'EPSG', code: 3857});
    }
  }

  return null;
}

function normalizeCRS(crs) {
  if (!crs || !crs.code) return null;
  var code = +crs.code;
  if (!Number.isFinite(code) || code <= 0) return null;
  code = Math.round(code);
  var org = crs.org ? String(crs.org).toUpperCase() : null;
  if (!org && looksLikeEPSGCode(code)) {
    org = 'EPSG';
  }
  if (org != 'EPSG') return null;
  return {
    org: 'EPSG',
    code: code,
    name: crs.name || null,
    description: crs.description || null,
    wkt: crs.wkt || null,
    code_string: crs.code_string || ('EPSG:' + code)
  };
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
