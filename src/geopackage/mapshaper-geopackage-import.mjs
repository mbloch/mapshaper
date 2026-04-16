import { GeoJSONParser } from '../geojson/geojson-import';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { stop, warnOnce } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
import { initProjLibrary } from '../crs/mapshaper-projections';
import { runningInBrowser } from '../mapshaper-env';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetBounds, datasetHasPaths, copyDatasetForExport } from '../dataset/mapshaper-dataset-utils';
import { layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { forEachArcId } from '../paths/mapshaper-path-utils';
import { buildTopology } from '../topology/mapshaper-topology';

export async function importGeoPackage(content, optsArg) {
  var opts = optsArg || {};
  var geopackage = require('@ngageoint/geopackage');
  var gpkg;
  var datasets;
  var tmpPath = null;

  if (!geopackage || !geopackage.GeoPackageAPI) {
    stop('GeoPackage library is not loaded');
  }

  ({gpkg, tmpPath} = await openGeoPackage(content, geopackage));
  try {
    try {
      datasets = readFeatureTableDatasets(gpkg, opts);
    } catch (e) {
      if (!runningInBrowser() && isLocalCsProjError(e)) {
        gpkg.close();
        if (tmpPath) {
          sanitizeGeoPackageCrsMetadata(tmpPath);
        } else if (utils.isString(content)) {
          tmpPath = copyGeoPackageTempFile(content);
          sanitizeGeoPackageCrsMetadata(tmpPath);
        } else {
          throw e;
        }
        gpkg = await geopackage.GeoPackageAPI.open(tmpPath);
        datasets = readFeatureTableDatasets(gpkg, opts);
      } else {
        throw e;
      }
    }
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

async function openGeoPackage(content, geopackage) {
  var source;
  var tmpPath = null;
  if (utils.isString(content)) {
    if (!runningInBrowser()) {
      try {
        return {
          gpkg: await geopackage.GeoPackageAPI.open(content),
          tmpPath: null
        };
      } catch (e) {
        if (!isLocalCsProjError(e)) throw e;
        tmpPath = copyGeoPackageTempFile(content);
        sanitizeGeoPackageCrsMetadata(tmpPath);
        return {
          gpkg: await geopackage.GeoPackageAPI.open(tmpPath),
          tmpPath: tmpPath
        };
      }
    }
    source = content;
  } else if (!runningInBrowser()) {
    tmpPath = writeGeoPackageTempFile(content);
    try {
      return {
        gpkg: await geopackage.GeoPackageAPI.open(tmpPath),
        tmpPath: tmpPath
      };
    } catch (e) {
      if (!isLocalCsProjError(e)) throw e;
      sanitizeGeoPackageCrsMetadata(tmpPath);
      return {
        gpkg: await geopackage.GeoPackageAPI.open(tmpPath),
        tmpPath: tmpPath
      };
    }
  } else {
    source = new Uint8Array(content);
  }
  return {
    gpkg: await geopackage.GeoPackageAPI.open(source),
    tmpPath: null
  };
}

function isLocalCsProjError(err) {
  var msg = err && err.message ? String(err.message) : '';
  return msg.includes("havn't handled \"_\" in keyword yet") ||
    msg.includes('LOCAL_CS');
}

function writeGeoPackageTempFile(content) {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var unique = Date.now() + '-' + process.pid + '-' + Math.random().toString(36).slice(2);
  var tmpPath = path.join(os.tmpdir(), 'mapshaper-gpkg-import-' + unique + '.gpkg');
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(tmpPath, content);
  } else if (content instanceof Uint8Array) {
    fs.writeFileSync(tmpPath, Buffer.from(content.buffer, content.byteOffset, content.byteLength));
  } else if (content instanceof ArrayBuffer) {
    fs.writeFileSync(tmpPath, Buffer.from(content));
  } else {
    fs.writeFileSync(tmpPath, Buffer.from(new Uint8Array(content)));
  }
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
  var merged = groups.reduce(function(memo, group) {
    return memo.concat(mergeGeoPackageDatasetGroup(group));
  }, []);
  return merged.length == 1 ? merged[0] : merged;
}

function mergeGeoPackageDatasetGroup(group) {
  var pathDatasets = [];
  var pointDatasets = [];
  var dataDatasets = [];

  group.forEach(function(dataset) {
    var kind = getDatasetGeometryKind(dataset);
    if (kind == 'path') {
      pathDatasets.push(dataset);
    } else if (kind == 'point') {
      pointDatasets.push(dataset);
    } else {
      dataDatasets.push(dataset);
    }
  });

  var output = [];
  if (dataDatasets.length > 0) {
    output.push(dataDatasets.length == 1 ? dataDatasets[0] : mergeDatasets(dataDatasets));
  }
  if (pointDatasets.length > 0) {
    output.push(pointDatasets.length == 1 ? pointDatasets[0] : mergeDatasets(pointDatasets));
  }
  if (pathDatasets.length > 0) {
    var groupedPaths = groupPathDatasetsBySharedArcs(pathDatasets);
    if (groupedPaths.mergedDataset) {
      output.push(groupedPaths.mergedDataset);
    } else {
      groupedPaths.components.forEach(function(component) {
        output.push(component.length == 1 ? component[0] : mergeDatasets(component));
      });
    }
  }
  return output;
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

function getDatasetGeometryKind(dataset) {
  if (isDataOnlyDataset(dataset)) return 'data';
  if (datasetHasPaths(dataset)) return 'path';
  var hasPoints = (dataset.layers || []).some(function(lyr) {
    return layerHasPoints(lyr);
  });
  return hasPoints ? 'point' : 'data';
}

function groupPathDatasetsBySharedArcs(datasets) {
  if (datasets.length < 2) {
    return {
      mergedDataset: datasets[0] || null,
      components: []
    };
  }
  var copy = datasets.map(copyDatasetForExport);
  var merged = mergeDatasets(copy);
  if (!merged.arcs || merged.arcs.size() === 0) {
    return {
      mergedDataset: null,
      components: datasets.map(function(dataset) { return [dataset]; })
    };
  }
  buildTopology(merged);
  var parent = datasets.map(function(_, i) { return i; });
  var arcOwner = new Map();
  merged.layers.forEach(function(layer, layerIdx) {
    var seen = new Set();
    forEachArcId(layer.shapes || [], function(arcId) {
      seen.add(arcId < 0 ? ~arcId : arcId);
    });
    seen.forEach(function(absId) {
      if (!arcOwner.has(absId)) {
        arcOwner.set(absId, layerIdx);
      } else {
        union(parent, layerIdx, arcOwner.get(absId));
      }
    });
  });
  var components = {};
  datasets.forEach(function(dataset, i) {
    var root = find(parent, i);
    if (!components[root]) components[root] = [];
    components[root].push(dataset);
  });
  var grouped = Object.keys(components).map(function(key) {
    return components[key];
  });
  if (grouped.length == 1) {
    return {
      mergedDataset: merged,
      components: []
    };
  }
  return {
    mergedDataset: null,
    components: grouped
  };
}

function find(parent, i) {
  var p = parent[i];
  if (p !== i) {
    parent[i] = find(parent, p);
  }
  return parent[i];
}

function union(parent, a, b) {
  var ra = find(parent, a);
  var rb = find(parent, b);
  if (ra !== rb) {
    parent[rb] = ra;
  }
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
