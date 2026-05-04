import { GeoJSONParser } from '../geojson/geojson-import';
import { initProjLibrary, parseCrsString } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { stop, warnOnce } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';

var hyparquetPromise = null;
var compressorsPromise = null;
var dynamicImportModule = Function('id', 'return import(id)');
var mproj = null;

export async function importGeoParquet(input, optsArg) {
  var opts = optsArg || {};
  var hyparquet = await loadHyparquetLib();
  var source = getGeoParquetSource(input);
  var file = await getHyparquetFile(source, hyparquet);
  var metadata = await hyparquet.parquetMetadataAsync(file);
  var geo = parseGeoParquetMetadata(metadata);
  var compressors = await loadHyparquetCompressors();
  var rows = await hyparquet.parquetReadObjects({
    file: file,
    compressors: compressors,
    rowFormat: 'object'
  });
  var geometryColumn = getGeoParquetGeometryColumn(rows, geo);
  if (!geometryColumn && hasUnsupportedGeometryEncoding(geo)) {
    warnOnce('Unable to import GeoParquet geometry: native encodings are not supported (expected WKB). Importing attribute data only.');
  }
  var dataset = convertGeoParquetRows(rows, geo, opts, geometryColumn);
  var crs = getGeoParquetCrs(geo, geometryColumn);
  dataset.info = dataset.info || {};
  dataset.info.geoparquet_geo = geo;
  dataset.info.geoparquet_crs = crs;
  if (crs) {
    var crsString = await resolveGeoParquetCrsString(crs);
    if (!crsString) {
      warnOnce('Unable to import CRS from GeoParquet metadata');
    }
    dataset.info.crs_string = crsString || null;
  }
  return dataset;
}

async function loadHyparquetLib() {
  if (runningInBrowser()) {
    var mod = require('hyparquet');
    if (mod && mod.default && !mod.parquetReadObjects) {
      mod = mod.default;
    }
    if (!mod || !mod.parquetReadObjects || !mod.parquetMetadataAsync) {
      stop('GeoParquet library is not loaded');
    }
    return mod;
  }
  if (!hyparquetPromise) {
    hyparquetPromise = dynamicImportModule('hyparquet');
  }
  var nodeMod = await hyparquetPromise;
  return nodeMod.default && !nodeMod.parquetReadObjects ? nodeMod.default : nodeMod;
}

async function loadHyparquetCompressors() {
  if (runningInBrowser()) {
    return getHyparquetCompressors(require('hyparquet-compressors'));
  }
  if (!compressorsPromise) {
    compressorsPromise = dynamicImportModule('hyparquet-compressors');
  }
  return getHyparquetCompressors(await compressorsPromise);
}

function getHyparquetCompressors(mod) {
  if (mod && mod.default && !mod.compressors) {
    mod = mod.default;
  }
  if (!mod || !mod.compressors) {
    stop('GeoParquet compression library is not loaded');
  }
  return mod.compressors;
}

function getGeoParquetSource(input) {
  if (!input) return null;
  if (Object.prototype.hasOwnProperty.call(input, 'content')) {
    return input.content || input.filename || null;
  }
  return input;
}

async function getHyparquetFile(source, hyparquet) {
  if (!source) {
    stop('Missing GeoParquet data');
  }
  if (utils.isString(source)) {
    if (!hyparquet.asyncBufferFromFile) {
      stop('Unable to read GeoParquet file path');
    }
    return hyparquet.asyncBufferFromFile(source);
  }
  return toArrayBuffer(source);
}

function toArrayBuffer(content) {
  if (content instanceof ArrayBuffer) {
    return content;
  }
  if (content instanceof Uint8Array) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  }
  if (typeof Buffer == 'function' && Buffer.isBuffer(content)) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  }
  if (ArrayBuffer.isView(content)) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  }
  if (utils.isArray(content)) {
    return new Uint8Array(content).buffer;
  }
  stop('Unsupported GeoParquet input type');
}

export function convertGeoParquetRows(rows, geo, opts, geometryColumnArg) {
  var importer = new GeoJSONParser(opts);
  var geometryColumn = geometryColumnArg === undefined ?
    getGeoParquetGeometryColumn(rows, geo) :
    geometryColumnArg;
  var geometryColumns = getGeoParquetGeometryColumns(geo);
  rows.forEach(function(row) {
    if (!utils.isObject(row)) return;
    var feature = convertGeoParquetRow(row, geometryColumn, geometryColumns);
    importer.parseObject(feature);
  });
  return importer.done();
}

function convertGeoParquetRow(row, geometryColumn, geometryColumns) {
  var feature = {
    type: 'Feature',
    properties: {},
    geometry: null
  };
  if (geometryColumn && row[geometryColumn] !== undefined) {
    feature.geometry = row[geometryColumn] || null;
  }
  for (var key in row) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    if (key == geometryColumn || geometryColumns.indexOf(key) > -1) continue;
    feature.properties[key] = normalizeGeoParquetValue(row[key], key);
  }
  return feature;
}

function normalizeGeoParquetValue(val, fieldName) {
  if (typeof val == 'bigint') {
    return normalizeBigIntValue(val, fieldName);
  }
  if (Array.isArray(val)) {
    return val.map(function(item) {
      return normalizeGeoParquetValue(item, fieldName);
    });
  }
  if (val && utils.isObject(val)) {
    var out = {};
    for (var key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        out[key] = normalizeGeoParquetValue(val[key], fieldName);
      }
    }
    return out;
  }
  return val;
}

function normalizeBigIntValue(val, fieldName) {
  var num = Number(val);
  if (!Number.isFinite(num)) {
    warnOnce('GeoParquet field "' + fieldName + '" contains BigInt values outside JavaScript Number range; precision will be lost.');
    return num;
  }
  if (BigInt(Math.trunc(num)) !== val) {
    warnOnce('GeoParquet field "' + fieldName + '" contains BigInt values that exceed Number.MAX_SAFE_INTEGER; precision will be lost.');
  }
  return num;
}

function getGeoParquetGeometryColumns(geo) {
  if (!geo || !utils.isObject(geo.columns)) return [];
  return Object.keys(geo.columns);
}

function getGeoParquetGeometryColumn(rows, geo) {
  var row = rows && rows.length > 0 && utils.isObject(rows[0]) ? rows[0] : null;
  var keys = row ? Object.keys(row) : [];
  var candidate;
  if (geo && utils.isObject(geo.columns)) {
    var wkbColumns = getWkbGeometryColumns(geo);
    candidate = geo.primary_column;
    if (candidate && wkbColumns.indexOf(candidate) > -1 && keys.indexOf(candidate) > -1) {
      return candidate;
    }
    candidate = wkbColumns.find(function(name) {
      return keys.indexOf(name) > -1;
    });
    if (candidate) return candidate;
    return null;
  }
  if (keys.indexOf('geometry') > -1) {
    return 'geometry';
  }
  candidate = keys.find(function(key) {
    return looksLikeGeoJSONGeometry(row[key]);
  });
  return candidate || null;
}

function getWkbGeometryColumns(geo) {
  if (!geo || !utils.isObject(geo.columns)) return [];
  return Object.keys(geo.columns).filter(function(name) {
    var encoding = geo.columns[name] && geo.columns[name].encoding;
    return utils.isString(encoding) && encoding.toUpperCase() == 'WKB';
  });
}

function hasUnsupportedGeometryEncoding(geo) {
  if (!geo || !utils.isObject(geo.columns)) return false;
  var columnNames = Object.keys(geo.columns);
  if (columnNames.length === 0) return false;
  return getWkbGeometryColumns(geo).length === 0;
}

function looksLikeGeoJSONGeometry(obj) {
  return !!(obj && utils.isObject(obj) && utils.isString(obj.type));
}

export function parseGeoParquetMetadata(metadata) {
  var kv = getParquetKeyValueMetadata(metadata);
  var entry = kv.find(function(item) {
    return getMetadataKey(item) == 'geo';
  });
  var value = entry ? getMetadataValue(entry) : null;
  if (!value) return null;
  if (utils.isObject(value)) return value;
  try {
    return JSON.parse(normalizeMetadataString(value));
  } catch (e) {
    warnOnce('Unable to parse GeoParquet metadata');
    return null;
  }
}

function getParquetKeyValueMetadata(metadata) {
  if (!metadata) return [];
  if (Array.isArray(metadata.key_value_metadata)) {
    return metadata.key_value_metadata;
  }
  if (Array.isArray(metadata.keyValueMetadata)) {
    return metadata.keyValueMetadata;
  }
  if (utils.isObject(metadata.metadata)) {
    return Object.keys(metadata.metadata).map(function(key) {
      return {key: key, value: metadata.metadata[key]};
    });
  }
  return [];
}

function getMetadataKey(entry) {
  if (!entry || !utils.isObject(entry)) return null;
  return entry.key || entry.name || null;
}

function getMetadataValue(entry) {
  if (!entry || !utils.isObject(entry)) return null;
  return entry.value ?? entry.val ?? null;
}

function normalizeMetadataString(value) {
  if (utils.isString(value)) return value;
  if (value instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(value);
  }
  if (typeof Buffer == 'function' && Buffer.isBuffer(value)) {
    return value.toString('utf-8');
  }
  return String(value);
}

function getGeoParquetCrs(geo, geometryColumn) {
  if (!geo || !utils.isObject(geo.columns)) return null;
  if (geometryColumn && geo.columns[geometryColumn]) {
    return geo.columns[geometryColumn].crs ?? null;
  }
  var cols = Object.keys(geo.columns);
  for (var i = 0; i < cols.length; i++) {
    var crs = geo.columns[cols[i]].crs;
    if (crs) return crs;
  }
  return null;
}

export function getGeoParquetAuthority(crs) {
  var match = findPrimaryAuthorityId(crs);
  if (!match) return null;
  var org = String(match.authority || '').toUpperCase();
  var code = Number(match.code);
  if (!org || !Number.isFinite(code)) return null;
  if (org != 'EPSG' && org != 'ESRI') return null;
  return {
    org: org,
    code: Math.round(code)
  };
}

async function resolveGeoParquetCrsString(crs) {
  var candidates = getGeoParquetCrsStrings(crs);
  for (var i = 0; i < candidates.length; i++) {
    try {
      parseCrsString(candidates[i]);
      await initProjLibrary({crs: candidates[i]});
      return candidates[i];
    } catch (e) {
      // Keep trying candidates; if none initialize, caller will warn.
    }
  }
  return null;
}

export function getGeoParquetCrsStrings(crs) {
  var strings = [];
  var authority = getGeoParquetAuthority(crs);
  if (authority) {
    strings.push(authority.org.toLowerCase() + ':' + authority.code);
  }
  var proj4 = convertProjjsonToProj4(crs);
  if (proj4 && strings.indexOf(proj4) == -1) {
    strings.push(proj4);
  }
  return strings;
}

function convertProjjsonToProj4(crs) {
  var converter = getProjjsonToProj4Converter();
  if (!converter) return null;
  try {
    return converter(crs);
  } catch (e) {
    return null;
  }
}

function getProjjsonToProj4Converter() {
  if (!mproj) {
    mproj = require('mproj');
  }
  if (mproj && typeof mproj.projjson_to_proj4 == 'function') {
    return mproj.projjson_to_proj4;
  }
  if (mproj && mproj.internal && typeof mproj.internal.projjson_to_proj4 == 'function') {
    return mproj.internal.projjson_to_proj4;
  }
  return null;
}

function findPrimaryAuthorityId(crs) {
  if (!crs || !utils.isObject(crs)) return null;
  if (utils.isString(crs)) {
    return parseAuthorityString(crs);
  }
  var match = parseAuthorityObject(crs.id);
  if (match) return match;
  if (crs.base_crs && utils.isObject(crs.base_crs)) {
    match = parseAuthorityObject(crs.base_crs.id);
    if (match) return match;
  }
  return null;
}

function parseAuthorityObject(id) {
  if (!id || !utils.isObject(id)) return null;
  if (id.authority === undefined || id.code === undefined) return null;
  return {
    authority: id.authority,
    code: id.code
  };
}

function parseAuthorityString(str) {
  var match = /^([A-Za-z]+)\s*:\s*([0-9]+)$/.exec(str);
  if (!match) return null;
  return {
    authority: match[1],
    code: Number(match[2])
  };
}
