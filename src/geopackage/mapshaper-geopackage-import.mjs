import { GeoJSONParser } from '../geojson/geojson-import';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { stop, warnOnce } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
import { initProjLibrary } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';

export async function importGeoPackage(content, optsArg) {
  var opts = optsArg || {};
  var geopackage = require('@ngageoint/geopackage');
  var gpkg;
  var datasets;
  var source;
  var tmpPath = null;

  if (!geopackage || !geopackage.GeoPackageAPI) {
    stop('GeoPackage library is not loaded');
  }

  if (utils.isString(content)) {
    if (!runningInBrowser()) {
      tmpPath = copyGeoPackageTempFile(content);
      sanitizeGeoPackageCrsMetadata(tmpPath);
      source = tmpPath;
    } else {
      source = content;
    }
  } else if (!runningInBrowser()) {
    tmpPath = writeGeoPackageTempFile(content);
    sanitizeGeoPackageCrsMetadata(tmpPath);
    source = tmpPath;
  } else {
    source = new Uint8Array(content);
  }
  gpkg = await geopackage.GeoPackageAPI.open(source);
  try {
    datasets = readFeatureTableDatasets(gpkg, opts);
  } finally {
    gpkg.close();
    removeTempGeoPackageFile(tmpPath);
  }

  if (datasets.length === 0) {
    return {
      layers: [{name: '', data: null}],
      info: {}
    };
  }

  await initProjLib(datasets);
  return mergeGeoPackageDatasets(datasets);
}

function writeGeoPackageTempFile(content) {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var unique = Date.now() + '-' + process.pid + '-' + Math.random().toString(36).slice(2);
  var tmpPath = path.join(os.tmpdir(), 'mapshaper-gpkg-import-' + unique + '.gpkg');
  fs.writeFileSync(tmpPath, Buffer.from(new Uint8Array(content)));
  return tmpPath;
}

function copyGeoPackageTempFile(filepath) {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var unique = Date.now() + '-' + process.pid + '-' + Math.random().toString(36).slice(2);
  var tmpPath = path.join(os.tmpdir(), 'mapshaper-gpkg-import-' + unique + '.gpkg');
  fs.copyFileSync(filepath, tmpPath);
  return tmpPath;
}

function sanitizeGeoPackageCrsMetadata(filepath) {
  var Database = require('better-sqlite3');
  var db = new Database(filepath);
  try {
    // GDAL may write LOCAL_CS definitions that proj4 can't parse.
    // Normalize to 'undefined' so GeoPackageAPI.open() won't throw.
    db.prepare("UPDATE gpkg_spatial_ref_sys SET definition = 'undefined' WHERE definition LIKE 'LOCAL_CS[%'").run();
  } finally {
    db.close();
  }
}

function removeTempGeoPackageFile(filepath) {
  if (!filepath) return;
  var fs = require('fs');
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

// load lookup tables for epsg codes if needed (for browser)
async function initProjLib(datasets) {
  for (const dataset of datasets) {
    if (dataset.info?.crs_string) {
      await initProjLibrary({crs: dataset.info.crs_string});
    }
  }
}

function readFeatureTableDatasets(gpkg, opts) {
  var tables = gpkg.getFeatureTables() || [];
  return tables.map(function(table) {
    return readFeatureTable(gpkg, table, opts);
  });
}

function mergeGeoPackageDatasets(datasets) {
  var groups = groupGeoPackageDatasets(datasets);
  var merged = groups.map(function(group) {
    return group.length == 1 ? group[0] : mergeDatasets(group);
  });
  return merged.length == 1 ? merged[0] : merged;
}

function groupGeoPackageDatasets(datasets) {
  var index = {};
  datasets.forEach(function(dataset) {
    var key = getGeoPackageDatasetGroupKey(dataset);
    if (!index[key]) index[key] = [];
    index[key].push(dataset);
  });
  return Object.keys(index).map(function(key) {
    return index[key];
  });
}

function getGeoPackageDatasetGroupKey(dataset) {
  var info = dataset.info || {};
  var crs = info.geopackage_crs || null;
  if (isDataOnlyDataset(dataset)) {
    return 'data-only';
  }
  if (crs) {
    var org = normalizeCrsOrg(crs.organization);
    var code = normalizeNumericCode(crs.organization_coordsys_id);
    if (isTrustedCrsAuthority(org) && code !== null && !(org == 'NONE' && code <= 0)) {
      return 'crs:' + org + ':' + code;
    }
    if (isUsableWkt1Definition(crs.definition)) {
      return 'wkt:' + crs.definition;
    }
  }
  return probablyDecimalDegreeBounds(getDatasetBounds(dataset)) ?
    'unknown:unprojected' :
    'unknown:projected';
}

function isDataOnlyDataset(dataset) {
  return (dataset.layers || []).every(function(lyr) {
    return !lyr.geometry_type;
  });
}

function normalizeNumericCode(val) {
  var n = +val;
  return Number.isFinite(n) ? n : null;
}

function normalizeCrsOrg(org) {
  if (!org || org == 'undefined') return null;
  return String(org).toUpperCase();
}

function isTrustedCrsAuthority(org) {
  return org == 'EPSG' || org == 'ESRI' || org == 'NONE';
}

function convertOrgToProjString(crs) {
  var org = crs.organization.toLowerCase();
  if (org == 'epsg' || org == 'esri') {
    return org + ':' + crs.organization_coordsys_id;
  }
  return null;
}

function readFeatureTable(gpkg, table, opts) {
  var featureDao = gpkg.getFeatureDao(table);
  var iterator = featureDao.queryForEach();
  var importer = new GeoJSONParser(opts);
  var crs = getTableCrs(gpkg, table);

  for (var row of iterator) {
    var featureRow = featureDao.getRow(row);
    var feature = convertFeatureRow(featureRow);
    if (feature) {
      importer.parseObject(feature);
    }
  }

  var dataset = importer.done();
  dataset.layers.forEach(function(lyr) {
    lyr.name = table;
  });
  dataset.info = dataset.info || {};
  dataset.info.geopackage_crs = crs;
  if (isUsableWkt1Definition(crs?.definition)) {
    dataset.info.wkt1 = crs.definition;
  } else if (crs?.organization && crs.organization !== 'undefined') {
    var crsString = convertOrgToProjString(crs);
    if (crsString) {
      dataset.info.crs_string = crsString;
    }
  }
  return dataset;
}

function isUsableWkt1Definition(defn) {
  if (!defn || defn === 'undefined') return false;
  // GDAL may emit LOCAL_CS["Undefined SRS", ...] for null CRS;
  // this is not a usable projected/geographic CRS for mapshaper.
  if (/^\s*LOCAL_CS\[/i.test(defn)) return false;
  return true;
}

function convertFeatureRow(featureRow) {
  var feature = {
    type: 'Feature',
    properties: {},
    geometry: null
  };
  try {
    var geomData = featureRow.geometry;
    if (geomData) {
      feature.geometry = geomData.toGeoJSON();
    }
  } catch (e) {
    // skip feature if geometry can't be parsed
    return null;
  }
  var geomColName = featureRow.geometryColumn && featureRow.geometryColumn.name;
  for (var key in featureRow.values) {
    if (Object.prototype.hasOwnProperty.call(featureRow.values, key) &&
        key !== geomColName) {
      feature.properties[key] = featureRow.values[key];
    }
  }
  feature.id = featureRow.id;
  return feature;
}

function getTableCrs(gpkg, table) {
  var contents, srsId, srs;
  try {
    contents = gpkg.getTableContents(table);
    srsId = contents && (contents.srs_id ?? contents.srsId);
    if (srsId > -1) {
      srs = gpkg.getSrs(srsId);
    }
  } catch (e) {
    srs = null;
  }
  return srs ? normalizeSrs(srs) : null;
}

function normalizeSrs(srs) {
  var obj = {
    id: srs.srs_id ?? srs.srsId ?? null,
    organization: srs.organization ?? null,
    organization_coordsys_id: srs.organization_coordsys_id ?? srs.organizationCoordsysId ?? null,
    definition: srs.definition ?? null,
    description: srs.description ?? null
  };
  var wkt2 = srs.definition_12_063 ?? srs.definition12063 ?? null;
  if (wkt2 && wkt2 !== 'undefined') {
    obj.definition_12_063 = wkt2;
    if (!obj.definition) {
      warnOnce('Unable to import WKT2 CRS from GeoPackage');
    }
  }
  return obj;
}
