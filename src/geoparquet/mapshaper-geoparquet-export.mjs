import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { parseCrsString, parsePrj } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';

var writerPromise = null;
var dynamicImportModule = Function('id', 'return import(id)');

export async function exportGeoParquet(dataset, opts, filenameOverride) {
  var writer = await loadGeoParquetWriter();
  var extension = opts.extension || 'parquet';
  if (opts.file) {
    extension = getFileExtension(opts.file) || extension;
  }
  return dataset.layers.map(function(lyr) {
    if (!lyr.geometry_type) {
      stop('GeoParquet export requires a geometry layer');
    }
    var features = exportLayerAsGeoJSON(lyr, dataset, opts, true, null);
    var output = buildGeoParquetColumns(features, writer);
    var geoMetadata = buildGeoMetadata(features, dataset);
    var content = writer.parquetWriteBuffer({
      columnData: output.columnData,
      kvMetadata: [{
        key: 'geo',
        value: JSON.stringify(geoMetadata)
      }]
    });
    return {
      filename: filenameOverride || (lyr.name + '.' + extension),
      content: content
    };
  });
}

function buildGeoParquetColumns(features, writer) {
  var geometryName = 'geometry';
  var names = getPropertyNames(features);
  var columnData = [];
  columnData.push({
    name: geometryName,
    data: features.map(function(feat) {
      return feat.geometry || null;
    }),
    type: 'GEOMETRY'
  });
  names.forEach(function(name) {
    var values = features.map(function(feat) {
      return feat.properties ? feat.properties[name] : null;
    });
    columnData.push(buildAttributeColumn(name, values));
  });
  return {columnData: columnData, geometryColumn: geometryName};
}

function buildAttributeColumn(name, values) {
  var info = inferColumnType(values);
  return {
    name: name,
    data: values.map(function(value) {
      return normalizeFieldValue(value, info.type);
    }),
    type: info.type
  };
}

function inferColumnType(values) {
  var type = null;
  for (var i = 0; i < values.length; i++) {
    var valueType = inferValueType(values[i]);
    if (!valueType) continue;
    if (!type) {
      type = valueType;
    } else if (type != valueType) {
      if ((type == 'INT32' || type == 'DOUBLE') &&
          (valueType == 'INT32' || valueType == 'DOUBLE')) {
        type = 'DOUBLE';
      } else {
        type = 'STRING';
        break;
      }
    }
  }
  return {type: type || 'STRING'};
}

function inferValueType(value) {
  if (value === null || value === undefined) return null;
  if (typeof value == 'boolean') return 'BOOLEAN';
  if (typeof value == 'number') {
    if (!Number.isFinite(value)) return 'STRING';
    if (Math.floor(value) === value && value >= -2147483648 && value <= 2147483647) {
      return 'INT32';
    }
    return 'DOUBLE';
  }
  if (typeof value == 'bigint') return 'STRING';
  if (value instanceof Date) return 'TIMESTAMP';
  if (value instanceof Uint8Array) return 'BYTE_ARRAY';
  if (typeof Buffer == 'function' && Buffer.isBuffer(value)) return 'BYTE_ARRAY';
  if (Array.isArray(value) || utils.isObject(value)) return 'JSON';
  return 'STRING';
}

function normalizeFieldValue(value, type) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (type == 'TIMESTAMP') return value instanceof Date ? value : new Date(value);
  if (type == 'BYTE_ARRAY') {
    if (value instanceof Uint8Array) return value;
    if (typeof Buffer == 'function' && Buffer.isBuffer(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
  }
  if (type == 'JSON') return value;
  if (type == 'BOOLEAN') return !!value;
  if (type == 'INT32' || type == 'DOUBLE') {
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return String(value);
}

function getPropertyNames(features) {
  var index = {};
  features.forEach(function(feat) {
    var props = feat.properties || {};
    Object.keys(props).forEach(function(name) {
      index[name] = true;
    });
  });
  return Object.keys(index);
}

function buildGeoMetadata(features, dataset) {
  var geomTypes = utils.uniq(features.map(function(feat) {
    return feat.geometry && feat.geometry.type || null;
  }).filter(Boolean));
  var crs = getGeoMetadataCrs(dataset);
  var geomMeta = {
    encoding: 'WKB',
    geometry_types: geomTypes
  };
  if (crs) {
    geomMeta.crs = crs;
  }
  return {
    version: '1.1.0',
    primary_column: 'geometry',
    columns: {
      geometry: geomMeta
    }
  };
}

function getGeoMetadataCrs(dataset) {
  var info = dataset && dataset.info || {};
  if (info.geoparquet_crs && utils.isObject(info.geoparquet_crs)) {
    return info.geoparquet_crs;
  }
  return convertCrsToProjjson(info.crs_string, info.wkt1);
}

function convertCrsToProjjson(crsString, wkt1) {
  var mproj = require('mproj');
  var converter = getProjjsonFromProj4Converter(mproj);
  if (!converter) return null;
  try {
    var crsObj = crsString ? parseCrsString(crsString) : (wkt1 ? parsePrj(wkt1) : null);
    if (!crsObj) return null;
    var projjson = converter(crsObj);
    if (utils.isString(projjson)) {
      projjson = JSON.parse(projjson);
    }
    return utils.isObject(projjson) ? projjson : null;
  } catch (e) {
    return null;
  }
}

function getProjjsonFromProj4Converter(mproj) {
  if (mproj && typeof mproj.projjson_from_proj4 == 'function') {
    return mproj.projjson_from_proj4;
  }
  if (mproj && mproj.internal && typeof mproj.internal.projjson_from_proj4 == 'function') {
    return mproj.internal.projjson_from_proj4;
  }
  return null;
}

async function loadGeoParquetWriter() {
  if (runningInBrowser()) {
    var mod = require('hyparquet-writer');
    if (mod && mod.default && !mod.parquetWriteBuffer) {
      mod = mod.default;
    }
    if (!mod || !mod.parquetWriteBuffer) {
      stop('GeoParquet writer library is not loaded');
    }
    return mod;
  }
  if (!writerPromise) {
    writerPromise = dynamicImportModule('hyparquet-writer');
  }
  var nodeMod = await writerPromise;
  return nodeMod.default && !nodeMod.parquetWriteBuffer ? nodeMod.default : nodeMod;
}
