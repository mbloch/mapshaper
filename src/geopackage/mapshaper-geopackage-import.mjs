import { GeoJSONParser } from '../geojson/geojson-import';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { stop, warnOnce } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
import { initProjLibrary } from '../crs/mapshaper-projections';

export async function importGeoPackage(content, optsArg) {
  var opts = optsArg || {};
  var geopackage = require('@ngageoint/geopackage');
  var gpkg;
  var datasets;
  var source;

  if (!geopackage || !geopackage.GeoPackageAPI) {
    stop('GeoPackage library is not loaded');
  }

  source = utils.isString(content) ? content : new Uint8Array(content);
  gpkg = await geopackage.GeoPackageAPI.open(source);
  try {
    datasets = readFeatureTableDatasets(gpkg, opts);
  } finally {
    gpkg.close();
  }

  if (datasets.length === 0) {
    return {
      layers: [{name: '', data: null}],
      info: {}
    };
  }

  await initProjLib(datasets);

  return mergeDatasets(datasets);
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

function convertOrgToProj4(crs) {
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
  if (crs?.definition && crs.definition !== 'undefined') {
    dataset.info.wkt1 = crs.definition;
  } else if (crs?.organization && crs.organization !== 'undefined') {
    dataset.info.crs_string = convertOrgToProj4(crs);
  }
  return dataset;
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
  if (!feature.geometry) return null;
  var geomColName = featureRow.geometryColumn.name;
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
