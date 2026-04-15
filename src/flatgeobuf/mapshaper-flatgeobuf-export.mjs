import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import {
  serialize,
  getHeaderMeta,
  buildHeaderWithCRS,
  magicbytes,
  SIZE_PREFIX_LEN
} from '../flatgeobuf/mapshaper-flatgeobuf-lib';
import { stop } from '../utils/mapshaper-logging';
import { getFileExtension } from '../utils/mapshaper-filename-utils';

export function exportFlatGeobuf(dataset, opts) {
  var extension = opts.extension || 'fgb';
  if (opts.file) {
    // Keep behavior consistent with other exporters that honor explicit output filename.
    extension = getFileExtension(opts.file) || extension;
  }
  return dataset.layers.map(function(lyr) {
    var geojson = getFeatureCollection(lyr, dataset, opts);
    var content = serialize(geojson);
    content = setOutputCRS(content, dataset.info && dataset.info.flatgeobuf_crs);
    return {
      content: content,
      filename: lyr.name + '.' + extension
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

function setOutputCRS(content, crs) {
  var crsMeta = normalizeCRS(crs);
  if (!crsMeta) return content;
  return rewriteHeaderWithCRS(content, crsMeta);
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
