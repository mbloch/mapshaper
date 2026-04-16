import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fixPath } from './helpers';
import { GeoPackageAPI } from '@ngageoint/geopackage';

function getTmpGeoPackagePath(name) {
  var unique = Date.now() + '-' + process.pid + '-' + Math.random().toString(36).slice(2);
  return path.join(os.tmpdir(), 'mapshaper-gpkg-' + name + '-' + unique + '.gpkg');
}

async function createTestGeoPackage(filepath) {
  var gpkg = await GeoPackageAPI.create(filepath);
  await gpkg.createRequiredTables();
  await gpkg.createFeatureTableFromProperties('points', [{name: 'name', dataType: 'TEXT'}]);
  await gpkg.addGeoJSONFeatureToGeoPackage({
    type: 'Feature',
    properties: {name: 'alpha'},
    geometry: {type: 'Point', coordinates: [1, 2]}
  }, 'points');
  gpkg.close();
}

describe('mapshaper-geopackage-import.js', function () {
  it('importContentAsync() imports a GeoPackage buffer', async function () {
    var tmpPath = getTmpGeoPackagePath('buffer');
    await createTestGeoPackage(tmpPath);
    try {
      var content = fs.readFileSync(tmpPath);
      var dataset = await api.internal.importContentAsync({
        gpkg: {
          filename: tmpPath,
          content: content
        }
      }, {});
      var points = dataset.layers.find(lyr => lyr.name == 'points');
      assert(points, 'points layer exists');
      assert.equal(points.geometry_type, 'point');
      assert.equal(points.shapes.length, 1);
      assert.deepEqual(points.data.getRecords()[0].name, 'alpha');
      assert.equal(dataset.info.input_formats[0], 'geopackage');
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  });

  it('importFileAsync() imports a GeoPackage file path', async function () {
    var tmpPath = getTmpGeoPackagePath('file');
    await createTestGeoPackage(tmpPath);
    try {
      var dataset = await api.internal.importFileAsync(tmpPath, {});
      var points = dataset.layers.find(lyr => lyr.name == 'points');
      assert(points, 'points layer exists');
      assert.equal(points.geometry_type, 'point');
      assert.equal(points.shapes.length, 1);
      assert.deepEqual(points.data.getRecords()[0].name, 'alpha');
      assert.equal(dataset.info.input_formats[0], 'geopackage');
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  });

  it('applyCommands() imports GeoPackage from CLI path', async function () {
    var tmpPath = getTmpGeoPackagePath('cmd');
    await createTestGeoPackage(tmpPath);
    try {
      var output = await new Promise(function(resolve, reject) {
        var cmd = '-i "' + tmpPath + '" -o format=json';
        api.applyCommands(cmd, {}, function(err, out) {
          if (err) reject(err);
          else resolve(out);
        });
      });
      var names = Object.keys(output);
      assert.equal(names.length, 1);
      var json = JSON.parse(output[names[0]]);
      assert.equal(json.length, 1);
      assert.equal(json[0].name, 'alpha');
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  });

  it('imports a projected multi-layer GeoPackage file', async function () {
    var gpkgPath = fixPath('data/geopackage/Oregon.gpkg');
    var dataset = await api.internal.importFileAsync(gpkgPath, {});
    assert.equal(dataset.layers.length, 2);

    var land = dataset.layers.find(lyr => lyr.name === 'land');
    var roads = dataset.layers.find(lyr => lyr.name === 'roads');
    assert(land, 'land layer exists');
    assert(roads, 'roads layer exists');

    assert.equal(land.geometry_type, 'polygon');
    assert.equal(land.shapes.length, 1);
    assert.equal(land.data.getRecords()[0].NAME, 'Oregon');

    assert.equal(roads.geometry_type, 'polyline');
    assert.equal(roads.shapes.length, 121);

    assert(dataset.info.wkt1.includes('NAD83'));
    assert.equal(dataset.info.geopackage_crs.organization, 'EPSG');
    assert.equal(dataset.info.geopackage_crs.organization_coordsys_id, 2269);
  });

  it('imports a GDAL LOCAL_CS GeoPackage without setting wkt1/crs_string', async function () {
    var gpkgPath = fixPath('data/geopackage/null_crs_gdal.gpkg');
    var dataset = await api.internal.importFileAsync(gpkgPath, {});
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].name, 'land');
    assert.equal(dataset.info.wkt1, undefined);
    assert.equal(dataset.info.crs_string, undefined);
  });

  it('imports mixed CRS tables as separate datasets', async function () {
    var gpkgPath = fixPath('data/geopackage/mixed_crs.gpkg');
    var result = await api.internal.importFileAsync(gpkgPath, {});
    assert(Array.isArray(result), 'result is an array of datasets');
    assert.equal(result.length, 2);
    var layerNames = result.reduce(function(memo, dataset) {
      return memo.concat(dataset.layers.map(function(lyr) { return lyr.name; }));
    }, []).sort();
    assert.deepEqual(layerNames, ['oregon_2269', 'oregon_4326']);
  });

  it('groups missing-CRS tables into projected and unprojected datasets', async function () {
    var gpkgPath = fixPath('data/geopackage/missing_crs_mixed_ranges.gpkg');
    var result = await api.internal.importFileAsync(gpkgPath, {});
    assert(Array.isArray(result), 'result is an array of datasets');
    assert.equal(result.length, 2);
    var groupedLayers = result.map(function(dataset) {
      return dataset.layers.map(function(lyr) { return lyr.name; }).sort();
    }).sort(function(a, b) {
      return a.join(',').localeCompare(b.join(','));
    });
    assert.deepEqual(groupedLayers, [['OR_land_2269'], ['OR_land_4326']]);
  });

  it('imports rows from GeoPackage tables with null geometries', async function () {
    var gpkgPath = fixPath('data/geopackage/data_only_tables.gpkg');
    var dataset = await api.internal.importFileAsync(gpkgPath, {});
    var oregon = dataset.layers.find(lyr => lyr.name == 'oregon_cities');
    var washington = dataset.layers.find(lyr => lyr.name == 'washington_cities');
    assert(oregon, 'oregon_cities layer exists');
    assert(washington, 'washington_cities layer exists');
    assert.equal(oregon.geometry_type, null);
    assert.equal(washington.geometry_type, null);
    assert.equal(oregon.data.size(), 5);
    assert.equal(washington.data.size(), 6);
  });
});
