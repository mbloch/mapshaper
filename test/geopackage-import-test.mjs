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
      assert.equal(dataset.layers.length, 1);
      assert.equal(dataset.layers[0].name, 'points');
      assert.equal(dataset.layers[0].geometry_type, 'point');
      assert.equal(dataset.layers[0].shapes.length, 1);
      assert.deepEqual(dataset.layers[0].data.getRecords()[0].name, 'alpha');
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
      assert.equal(dataset.layers.length, 1);
      assert.equal(dataset.layers[0].name, 'points');
      assert.equal(dataset.layers[0].geometry_type, 'point');
      assert.equal(dataset.layers[0].shapes.length, 1);
      assert.deepEqual(dataset.layers[0].data.getRecords()[0].name, 'alpha');
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
      var json = JSON.parse(output['points.json']);
      assert.equal(json.length, 1);
      assert.equal(json[0].name, 'alpha');
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  });

  it('imports a projected multi-layer GeoPackage file', async function () {
    var gpkgPath = fixPath('data/geodatabase/Oregon.gpkg');
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
});
