import GeoJSON, { getIdField } from '../geojson/geojson-export';
import { stop } from '../utils/mapshaper-logging';
import require from '../mapshaper-require';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { runningInBrowser } from '../mapshaper-env';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { crsToPrj } from '../crs/mapshaper-projections';

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
  var fields, columns, tableName, targetSrs, state;
  if (!lyr.geometry_type) return;
  fields = inferFieldTypesFromLayer(lyr, dataset, opts);
  if (!fields) return;
  tableName = getTableName(lyr.name);
  columns = fields.map(function(field) {
    return {
      name: field.name,
      dataType: field.type
    };
  });
  targetSrs = getExportSrs(dataset);
  await ensureSrsExists(gpkg, targetSrs);
  // createFeatureTableFromProperties() hardcodes EPSG:4326
  await gpkg.createFeatureTable(tableName, null, columns, undefined, targetSrs.srs_id);
  var featureDao = gpkg.getFeatureDao(tableName);
  // addGeoJSONFeatureToGeoPackageWithFeatureDaoAndSrs() assumes source
  // GeoJSON is EPSG:4326 and reprojects unless given EPSG:4326 metadata.
  // Mapshaper output coords are already in target CRS, so suppress reprojection.
  var srs = getSourceSrsWithoutReprojection(featureDao && featureDao.srs, targetSrs);
  state = initLayerFeatureExportState(lyr, dataset, opts);
  var featureIndex = 0;
  for (var i = 0; i < state.count; i++) {
    var feat = exportFeatureAtIndex(state, i);
    if (!feat || !feat.geometry) continue;
    var normalized = normalizeFeature(feat, fields);
    try {
      await gpkg.addGeoJSONFeatureToGeoPackageWithFeatureDaoAndSrs(
        normalized,
        featureDao,
        srs
      );
    } catch (e) {
      throw Error('GeoPackage insert failed at layer "' + tableName +
        '", feature ' + featureIndex + ': ' + e.message);
    }
    featureIndex++;
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

function inferFieldTypesFromLayer(lyr, dataset, opts) {
  var sawFeature = false;
  var index = {};
  forEachLayerExportFeature(lyr, dataset, opts, function(feat) {
    sawFeature = true;
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
  if (!sawFeature) return null;
  return Object.keys(index).map(function(name) {
    return {name: name, type: index[name]};
  });
}

function forEachLayerExportFeature(lyr, dataset, opts, cb) {
  var state = initLayerFeatureExportState(lyr, dataset, opts);
  var featureIndex = 0;
  for (var i = 0; i < state.count; i++) {
    var feature = exportFeatureAtIndex(state, i);
    if (!feature || !feature.geometry) continue;
    cb(feature, featureIndex++, i);
  }
}

function initLayerFeatureExportState(lyr, dataset, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null;
  var fields = lyr.data ? lyr.data.getFields() : [];
  var shapes = lyr.shapes || null;
  if (records && shapes && records.length !== shapes.length) {
    stop('Mismatch between number of properties and number of shapes');
  }
  return {
    lyr: lyr,
    dataset: dataset,
    opts: opts || {},
    fields: fields,
    records: records,
    shapes: shapes,
    count: Math.max(records ? records.length : 0, shapes ? shapes.length : 0),
    idField: getIdField(fields, opts || {}),
    useProps: useFeatureProperties(fields, opts || {})
  };
}

function exportFeatureAtIndex(state, i) {
  var shape = state.shapes ? state.shapes[i] : null;
  var geom = shape ? GeoJSON.exporters[state.lyr.geometry_type](shape, state.dataset.arcs, state.opts) : null;
  var rec = state.records ? state.records[i] : null;
  var props = null;
  if (state.useProps && rec) {
    if (state.idField == GeoJSON.ID_FIELD) {
      props = Object.assign({}, rec);
      delete props[state.idField];
    } else {
      props = rec;
    }
  }
  var feat = GeoJSON.toFeature(geom, props);
  if (state.idField && rec) {
    feat.id = state.idField in rec ? rec[state.idField] : null;
  }
  if (state.opts.no_null_props && !feat.properties) {
    feat.properties = {};
  }
  if (Array.isArray(state.opts.hoist) && feat.properties) {
    feat.properties = Object.assign({}, feat.properties);
    state.opts.hoist.forEach(function(field) {
      if (Object.prototype.hasOwnProperty.call(feat.properties, field)) {
        feat[field] = feat.properties[field];
        delete feat.properties[field];
      }
    });
  }
  return feat;
}

function useFeatureProperties(fields, opts) {
  return !(opts.drop_table || opts.cut_table || fields.length === 0 ||
      fields.length == 1 && fields[0] == GeoJSON.ID_FIELD);
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

function getExportSrs(dataset) {
  var info = dataset.info || {};
  var gpkgCrs = resolveExportSrs(normalizeSrsForInsert(info.geopackage_crs), info.wkt1);
  if (gpkgCrs) {
    return gpkgCrs;
  }
  var parsed = parseCrsString(info.crs_string);
  if (parsed) {
    if (info.wkt1) parsed.definition = info.wkt1;
    return parsed;
  }
  var fromWkt = parseWktAuthority(info.wkt1);
  if (fromWkt) {
    fromWkt.definition = info.wkt1;
    return fromWkt;
  }
  if (info.wkt1) {
    return buildCustomSrsFromWkt(info.wkt1);
  }
  // If the dataset has an in-memory CRS object (e.g. set by -proj) but no
  // metadata source, derive a WKT1 definition from it so a projected CRS
  // isn't lost on round-trip.
  var derivedWkt = getWktFromDatasetCrs(dataset);
  if (derivedWkt) {
    return buildCustomSrsFromWkt(derivedWkt);
  }
  // Unknown CRS fallback:
  // - probable decimal-degree coordinates => allow WGS84 assumption
  // - otherwise use undefined cartesian CRS (null/unknown projection)
  if (probablyDecimalDegreeBounds(getDatasetBounds(dataset))) {
    return {
      srs_id: 4326,
      organization: 'EPSG',
      organization_coordsys_id: 4326
    };
  }
  return {
    srs_id: -1,
    srs_name: 'Undefined Cartesian SRS',
    organization: 'NONE',
    organization_coordsys_id: -1
  };
}

function getWktFromDatasetCrs(dataset) {
  // Only derive from an explicitly-set CRS object (e.g. from -proj).
  // This avoids building a custom SRS for lat/lon datasets that were
  // auto-defaulted to WGS84 by getDatasetCRS().
  var info = dataset && dataset.info;
  if (!info || !info.crs) return null;
  try {
    return crsToPrj(info.crs) || null;
  } catch (e) {
    return null;
  }
}

function resolveExportSrs(srs, fallbackWkt) {
  if (!srs) return null;
  var out = Object.assign({}, srs);
  if (!out.definition && fallbackWkt) {
    out.definition = fallbackWkt;
  }
  if (out.srs_id == null && out.organization_coordsys_id != null) {
    out.srs_id = out.organization_coordsys_id;
  }
  if (out.srs_id == null) {
    var fromWkt = parseWktAuthority(out.definition);
    if (fromWkt) {
      out.srs_id = fromWkt.srs_id;
      if (!out.organization) out.organization = fromWkt.organization;
      if (out.organization_coordsys_id == null) {
        out.organization_coordsys_id = fromWkt.organization_coordsys_id;
      }
    }
  }
  if (out.srs_id == null && out.definition) {
    var custom = buildCustomSrsFromWkt(out.definition);
    out.srs_id = custom.srs_id;
    if (!out.srs_name) out.srs_name = custom.srs_name;
    if (!out.organization) out.organization = custom.organization;
    if (out.organization_coordsys_id == null) {
      out.organization_coordsys_id = custom.organization_coordsys_id;
    }
    if (!out.description) out.description = custom.description;
  }
  if (out.srs_id == null) return null;
  if (out.organization_coordsys_id == null) {
    out.organization_coordsys_id = out.srs_id;
  }
  if (!out.organization) {
    out.organization = 'NONE';
  }
  return out;
}

function parseCrsString(str) {
  if (!str || typeof str != 'string') return null;
  var match = str.match(/^([a-z]+):(\d+)$/i);
  if (!match) return null;
  var org = match[1].toUpperCase();
  var code = +match[2];
  if (!code) return null;
  return {
    srs_id: code,
    organization: org,
    organization_coordsys_id: code
  };
}

function parseWktAuthority(wkt) {
  if (!wkt || typeof wkt != 'string') return null;
  var rootAuthority = findTopLevelWktAuthority(wkt);
  if (!rootAuthority) return null;
  var org = String(rootAuthority[1]).toUpperCase();
  var code = +rootAuthority[2];
  if (!code) return null;
  return {
    srs_id: code,
    organization: org,
    organization_coordsys_id: code
  };
}

function findTopLevelWktAuthority(wkt) {
  var depth = 0;
  var inQuote = false;
  for (var i = 0; i < wkt.length; i++) {
    var c = wkt.charAt(i);
    if (c == '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (c == '[') {
      depth++;
      continue;
    }
    if (c == ']') {
      depth--;
      continue;
    }
    if (depth != 1) continue;
    if (wkt.slice(i, i + 10).toUpperCase() == 'AUTHORITY[') {
      return wkt.slice(i).match(/^AUTHORITY\["([^"]+)","(\d+)"\]/i);
    }
  }
  return null;
}

function buildCustomSrsFromWkt(wkt) {
  var srsId = getCustomSrsId(wkt);
  return {
    srs_id: srsId,
    srs_name: getWktName(wkt) || 'CUSTOM_CRS',
    organization: 'NONE',
    organization_coordsys_id: srsId,
    definition: wkt,
    description: 'Custom projection'
  };
}

function getWktName(wkt) {
  var match = wkt && String(wkt).match(/^(?:PROJCS|GEOGCS)\["([^"]+)"/i);
  return match ? match[1] : null;
}

function getCustomSrsId(wkt) {
  var str = String(wkt || '');
  var hash = 2166136261; // FNV-1a
  for (var i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return 100000 + (hash % 900000);
}

async function ensureSrsExists(gpkg, srs) {
  if (!srs || !srs.srs_id) return;
  var existing = gpkg.getSrs(srs.srs_id);
  if (existing) return;
  if (!srs.definition) {
    stop('Unable to export GeoPackage with missing CRS definition for SRS ' + srs.srs_id);
  }
  var geopackage = require('@ngageoint/geopackage');
  var spatialReferenceSystem = new geopackage.SpatialReferenceSystem();
  spatialReferenceSystem.srs_id = srs.srs_id;
  spatialReferenceSystem.srs_name = srs.srs_name || (String(srs.organization || 'NONE') + ':' + srs.organization_coordsys_id);
  spatialReferenceSystem.organization = srs.organization || 'NONE';
  spatialReferenceSystem.organization_coordsys_id = srs.organization_coordsys_id != null ?
    srs.organization_coordsys_id : srs.srs_id;
  spatialReferenceSystem.definition = srs.definition;
  spatialReferenceSystem.description = srs.description || null;
  gpkg.createSpatialReferenceSystem(spatialReferenceSystem);
}

function getSourceSrsWithoutReprojection(tableSrs, fallbackSrs) {
  var target = normalizeSrsForInsert(tableSrs) || normalizeSrsForInsert(fallbackSrs);
  return {
    // geopackage writer rejects negative srs_id for source metadata;
    // use 0 (undefined geographic) when target is undefined cartesian (-1).
    srs_id: target.srs_id < 0 ? 0 : target.srs_id,
    organization: 'EPSG',
    organization_coordsys_id: 4326
  };
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
  if (!srs) return null;
  var normalized = Object.assign({}, srs);
  if (normalized.srs_id == null && normalized.id != null) {
    normalized.srs_id = normalized.id;
  }
  if (normalized.organization_coordsys_id == null && normalized.code != null) {
    normalized.organization_coordsys_id = normalized.code;
  }
  if (normalized.srs_id == null && normalized.srsId != null) {
    normalized.srs_id = normalized.srsId;
  }
  if (normalized.organization_coordsys_id == null && normalized.organizationCoordsysId != null) {
    normalized.organization_coordsys_id = normalized.organizationCoordsysId;
  }
  if (normalized.srs_id != null) {
    normalized.srs_id = +normalized.srs_id;
    if (!Number.isFinite(normalized.srs_id)) {
      normalized.srs_id = null;
    }
  }
  if (normalized.organization) {
    normalized.organization = String(normalized.organization).toUpperCase();
  }
  if (normalized.organization_coordsys_id != null) {
    normalized.organization_coordsys_id = +normalized.organization_coordsys_id;
    if (!Number.isFinite(normalized.organization_coordsys_id)) {
      normalized.organization_coordsys_id = null;
    }
  }
  return normalized;
}
