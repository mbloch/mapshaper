import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { parseCrsString, parsePrj } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { stop, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';

var writerPromise = null;
var zstdPromise = null;
var dynamicImportModule = Function('id', 'return import(id)');

export async function exportGeoParquet(dataset, opts, filenameOverride) {
  var writer = await loadGeoParquetWriter();
  var compression = await getGeoParquetCompression(opts);
  var extension = opts.extension || 'parquet';
  var files = [];
  if (opts.file) {
    extension = getFileExtension(opts.file) || extension;
  }
  dataset.layers.forEach(function(lyr) {
    var features = exportLayerAsGeoJSON(lyr, dataset, opts, true, null);
    var hasGeometry = features.some(function(feat) {
      return !!feat.geometry;
    });
    var output = buildGeoParquetColumns(features, hasGeometry);
    var writeOptions = {
      columnData: output.columnData,
      codec: compression.codec,
      compressors: compression.compressors,
      pageSize: compression.pageSize
    };
    if (hasGeometry) {
      writeOptions.kvMetadata = [{
        key: 'geo',
        value: JSON.stringify(buildGeoMetadata(features, dataset))
      }];
    } else {
      warn('GeoParquet export: layer has no geometry; writing attribute data only.');
    }
    var content = writer.parquetWriteBuffer(writeOptions);
    files.push({
      filename: filenameOverride || (lyr.name + '.' + extension),
      content: content
    });
  });
  return files;
}

function buildGeoParquetColumns(features, includeGeometry) {
  var geometryName = 'geometry';
  var names = getPropertyNames(features);
  var columnData = [];
  if (features.length === 0) {
    stop('GeoParquet export requires at least one record');
  }
  if (includeGeometry) {
    columnData.push({
      name: geometryName,
      data: features.map(function(feat) {
        return feat.geometry || null;
      }),
      type: 'GEOMETRY'
    });
  }
  names.forEach(function(name) {
    var values = features.map(function(feat) {
      return feat.properties ? feat.properties[name] : null;
    });
    columnData.push(buildAttributeColumn(name, values));
  });
  if (columnData.length === 0) {
    stop('GeoParquet export requires geometry or attribute data');
  }
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

async function getGeoParquetCompression(opts) {
  var codec = normalizeGeoParquetCompression(opts.compression);
  var level = validateGeoParquetCompressionLevel(opts.level, codec);
  if (codec != 'ZSTD') {
    return {codec: codec, compressors: null};
  }
  var zstd = await loadZstdLib();
  if (!zstd || typeof zstd.compress != 'function') {
    stop('GeoParquet ZSTD compressor is not loaded');
  }
  return {
    codec: codec,
    pageSize: getGeoParquetPageSize(level),
    compressors: {
      ZSTD: function(bytes) {
        return compressZstdPage(zstd, bytes, level);
      }
    }
  };
}

function compressZstdPage(zstd, bytes, level) {
  var compressed;
  try {
    compressed = zstd.compress(bytes, level);
  } catch (e) {
    stop('Unable to apply GeoParquet ZSTD compression. Try a lower level= value.');
  }
  if (!compressed) {
    stop('Unable to apply GeoParquet ZSTD compression. Try a lower level= value.');
  }
  return compressed;
}

function getGeoParquetPageSize(level) {
  return level >= 10 ? 64 * 1024 : undefined;
}

function normalizeGeoParquetCompression(compression) {
  var str = compression === undefined || compression === null ? 'snappy' : String(compression).toLowerCase();
  if (str == 'snappy') return 'SNAPPY';
  if (str == 'zstd') return 'ZSTD';
  if (str == 'none' || str == 'uncompressed') return null;
  stop('Unsupported GeoParquet compression:', compression);
}

function validateGeoParquetCompressionLevel(level, codec) {
  if (level === undefined) return undefined;
  if (codec != 'ZSTD') {
    stop('The level= option only applies with compression=zstd');
  }
  if (level >= 1 && level <= 22 && Math.floor(level) === level) {
    return level;
  }
  stop('GeoParquet ZSTD level= option must be an integer from 1 to 22');
}

async function loadZstdLib() {
  var mod;
  if (runningInBrowser()) {
    mod = require('zstd-codec');
  } else {
    if (!zstdPromise) {
      zstdPromise = dynamicImportModule('zstd-codec');
    }
    mod = await zstdPromise;
  }
  if (mod && mod.default && !mod.ZstdCodec) {
    mod = mod.default;
  }
  if (!mod || !mod.ZstdCodec || typeof mod.ZstdCodec.run != 'function') {
    stop('GeoParquet ZSTD compressor is not loaded');
  }
  return initZstdCodec(mod.ZstdCodec);
}

function initZstdCodec(codec) {
  return new Promise(function(resolve, reject) {
    try {
      codec.run(function(zstd) {
        var simple = new zstd.Simple();
        resolve({
          compress: function(bytes, level) {
            return simple.compress(bytes, level);
          }
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}
