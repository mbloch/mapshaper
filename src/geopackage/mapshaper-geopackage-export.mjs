import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { stop } from '../utils/mapshaper-logging';
import require from '../mapshaper-require';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { runningInBrowser } from '../mapshaper-env';

export async function exportGeoPackage(dataset, opts) {
  var geopackage = require('@ngageoint/geopackage');
  var gpkg;
  var filename = getOutputFilename(opts);
  if (!geopackage || !geopackage.GeoPackageAPI) {
    stop('GeoPackage library is not loaded');
  }
  gpkg = await createGeoPackageQuietly(geopackage.GeoPackageAPI);
  try {
    await gpkg.createRequiredTables();
    for (var lyr of dataset.layers) {
      await exportLayerToGeoPackage(lyr, dataset, gpkg, opts);
    }
    return [{
      filename: filename,
      content: await exportGeoPackageBytes(gpkg)
    }];
  } finally {
    gpkg.close();
  }
}

async function createGeoPackageQuietly(geoPackageAPI) {
  var originalLog = console.log;
  console.log = function(...args) {
    // @ngageoint/geopackage emits "create in memory" in Node.
    if (args.length === 1 && args[0] === 'create in memory') return;
    return originalLog.apply(console, args);
  };
  try {
    return await geoPackageAPI.create();
  } finally {
    console.log = originalLog;
  }
}

async function exportLayerToGeoPackage(lyr, dataset, gpkg, opts) {
  var features, fields, columns;
  if (!lyr.geometry_type) return;
  features = exportLayerAsGeoJSON(lyr, dataset, opts, true, null)
    .filter(feat => !!(feat && feat.geometry));
  if (features.length === 0) return;
  fields = inferFieldTypes(features);
  var tableName = getTableName(lyr.name);
  columns = fields.map(function(field) {
    return {
      name: field.name,
      dataType: field.type
    };
  });
  await gpkg.createFeatureTableFromProperties(tableName, columns);
  var featureDao = gpkg.getFeatureDao(tableName);
  var srs = normalizeSrsForInsert(featureDao && featureDao.srs);
  for (var i = 0; i < features.length; i++) {
    var feat = features[i];
    var normalized = normalizeFeature(feat, fields);
    try {
      await gpkg.addGeoJSONFeatureToGeoPackageWithFeatureDaoAndSrs(
        normalized,
        featureDao,
        srs
      );
    } catch (e) {
      throw Error('GeoPackage insert failed at layer "' + tableName +
        '", feature ' + i + ': ' + e.message);
    }
  }
}

async function exportGeoPackageBytes(gpkg) {
  var db = gpkg.connection && gpkg.connection.getDBConnection && gpkg.connection.getDBConnection();
  // Browser and Node builds use different sqlite backends; prefer the
  // backend-specific export path for better compatibility. In particular,
  // browser/sql.js output from db.serialize() may fail on GeoPackage.open(),
  // while gpkg.export() yields a compatible package.
  if (runningInBrowser() && typeof gpkg.export == 'function') {
    var browserBytes = await gpkg.export();
    if (browserBytes) return browserBytes;
  }
  if (!runningInBrowser() && db && typeof db.serialize == 'function') {
    return db.serialize();
  }
  if (typeof gpkg.export == 'function') {
    var bytes = await gpkg.export();
    if (bytes) return bytes;
  }
  if (db && typeof db.serialize == 'function') {
    return db.serialize();
  }
  stop('Unable to export GeoPackage bytes');
}

function inferFieldTypes(features) {
  var index = {};
  features.forEach(function(feat) {
    var props = feat.properties || {};
    Object.keys(props).forEach(function(name) {
      if (!isSupportedPropertyName(name)) return;
      var value = props[name];
      var next = inferValueType(value);
      if (!next) return;
      if (!(name in index)) {
        index[name] = next;
      } else {
        index[name] = mergeFieldTypes(index[name], next);
      }
    });
  });
  return Object.keys(index).map(function(name) {
    return {name: name, type: index[name]};
  });
}

function inferValueType(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return 'DATETIME';
  if (typeof value == 'boolean') return 'BOOLEAN';
  if (typeof value == 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  if (typeof value == 'string') return 'TEXT';
  return 'TEXT';
}

function mergeFieldTypes(a, b) {
  if (a == b) return a;
  if (a == 'INTEGER' && b == 'REAL' || a == 'REAL' && b == 'INTEGER') {
    return 'REAL';
  }
  return 'TEXT';
}

function normalizeFeature(feature, fields) {
  var fieldIndex = fields.reduce(function(memo, field) {
    memo[field.name] = field.type;
    return memo;
  }, {});
  var props = {};
  fields.forEach(function(field) {
    var value = feature.properties && Object.prototype.hasOwnProperty.call(feature.properties, field.name) ?
      feature.properties[field.name] : null;
    props[field.name] = normalizeValue(value, field.type);
  });
  var output = {
    type: 'Feature',
    geometry: feature.geometry,
    properties: props
  };
  // Explicitly set id to avoid binding undefined in browser/sql.js.
  output.properties.id = feature.id !== undefined && feature.id !== null ? feature.id : null;
  return removeUndefinedValues(output);
}

function normalizeValue(value, type) {
  if (value === null || value === undefined) return null;
  if (type == 'TEXT' && typeof value != 'string') {
    var str = JSON.stringify(value);
    return str === undefined ? String(value) : str;
  }
  if (type == 'INTEGER' || type == 'REAL') {
    var num = +value;
    return Number.isFinite(num) ? num : null;
  }
  if (type == 'BOOLEAN') {
    return value ? 1 : 0;
  }
  if (type == 'DATETIME') {
    var dateStr = value instanceof Date ? value.toISOString() : String(value);
    return dateStr == 'Invalid Date' ? null : dateStr;
  }
  return value;
}

function getOutputFilename(opts) {
  var file = opts.file || 'output.gpkg';
  var ext = getFileExtension(file);
  if (!ext) {
    file += '.gpkg';
  }
  return file;
}

function removeUndefinedValues(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedValues);
  }
  if (value && typeof value == 'object') {
    return Object.keys(value).reduce(function(memo, key) {
      var v = value[key];
      memo[key] = v === undefined ? null : removeUndefinedValues(v);
      return memo;
    }, {});
  }
  return value;
}

function getTableName(name) {
  if (name && String(name).trim()) {
    return String(name);
  }
  return 'layer';
}

function isSupportedPropertyName(name) {
  if (!name || !String(name).trim()) return false;
  var lower = String(name).toLowerCase();
  return lower != 'id' && lower != 'geometry';
}

function normalizeSrsForInsert(srs) {
  if (!srs) {
    return {
      srs_id: 4326,
      organization: 'EPSG',
      organization_coordsys_id: 4326
    };
  }
  var normalized = Object.assign({}, srs);
  if (normalized.srs_id == null && normalized.srsId != null) {
    normalized.srs_id = normalized.srsId;
  }
  if (normalized.organization_coordsys_id == null && normalized.organizationCoordsysId != null) {
    normalized.organization_coordsys_id = normalized.organizationCoordsysId;
  }
  if (normalized.srs_id == null) {
    normalized.srs_id = normalized.organization_coordsys_id || 4326;
  }
  normalized.srs_id = +normalized.srs_id || 4326;
  if (!normalized.organization) {
    normalized.organization = 'EPSG';
  }
  if (normalized.organization_coordsys_id == null) {
    normalized.organization_coordsys_id = normalized.srs_id || 4326;
  }
  normalized.organization_coordsys_id = +normalized.organization_coordsys_id || 4326;
  return normalized;
}
