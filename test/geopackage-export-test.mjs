import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fixPath } from './helpers';
import { GeoPackageAPI } from '@ngageoint/geopackage';

function getTmpGeoPackagePath(name) {
  var unique = Date.now() + '-' + process.pid + '-' + Math.random().toString(36).slice(2);
  return path.join(os.tmpdir(), 'mapshaper-gpkg-export-' + name + '-' + unique + '.gpkg');
}

async function importGeoPackageOutput(output, filename, name) {
  var tmpPath = getTmpGeoPackagePath(name);
  fs.writeFileSync(tmpPath, Buffer.from(output[filename]));
  try {
    return await api.internal.importFileAsync(tmpPath, {});
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

async function readGeoPackageTableInfo(output, filename, name) {
  var tmpPath = getTmpGeoPackagePath(name + '-info');
  fs.writeFileSync(tmpPath, Buffer.from(output[filename]));
  try {
    var gpkg = await GeoPackageAPI.open(tmpPath);
    try {
      return gpkg.getFeatureTables().map(function(table) {
        var contents = gpkg.getTableContents(table);
        return {
          table: table,
          srsId: contents && (contents.srs_id ?? contents.srsId)
        };
      });
    } finally {
      gpkg.close();
    }
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

describe('geopackage export', function () {
  it('exports GeoPackage and round-trips via async import', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'alpha', value: 1},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }, {
        type: 'Feature',
        properties: {name: 'beta', value: 2},
        geometry: {type: 'Point', coordinates: [3, 4]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geopackage', {'in.json': input});
    var names = Object.keys(output);
    var gpkgName = names[0];
    var dataset = await importGeoPackageOutput(output, gpkgName, 'basic');

    assert.equal(names.length, 1);
    assert(/\.gpkg$/i.test(gpkgName));
    assert.equal(dataset.info.input_formats[0], 'geopackage');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].shapes.length, 2);
    assert.deepEqual(dataset.layers[0].data.getRecords().map(rec => rec.name), ['alpha', 'beta']);
  });

  it('exports multiple layers to one .gpkg file', async function () {
    var a = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {type: 'Point', coordinates: [1, 1]}
      }]
    };
    var b = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'b'},
        geometry: {type: 'Point', coordinates: [2, 2]}
      }]
    };
    var output = await api.applyCommands('-i a.json b.json combine-files -o format=geopackage', {
      'a.json': a,
      'b.json': b
    });
    var names = Object.keys(output);
    var info = await readGeoPackageTableInfo(output, names[0], 'multi');

    assert.equal(names.length, 1);
    assert(/\.gpkg$/i.test(names[0]));
    assert.equal(info.length, 2);
  });

  it('exports sparse properties without binding undefined values', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {a: 1},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }, {
        type: 'Feature',
        properties: {b: 'x'},
        geometry: {type: 'Point', coordinates: [3, 4]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geopackage', {'in.json': input});
    var names = Object.keys(output);
    var dataset = await importGeoPackageOutput(output, names[0], 'sparse');
    var rows = dataset.layers[0].data.getRecords();

    assert.equal(names.length, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].a, 1);
    assert.equal(rows[0].b, null);
    assert.equal(rows[1].a, null);
    assert.equal(rows[1].b, 'x');
  });

  it('exports records containing undefined values', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {a: 1, b: undefined},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }, {
        type: 'Feature',
        properties: {a: undefined, b: 'x'},
        geometry: {type: 'Point', coordinates: [3, 4]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geopackage', {'in.json': input});
    var names = Object.keys(output);
    var dataset = await importGeoPackageOutput(output, names[0], 'undefined');
    var rows = dataset.layers[0].data.getRecords();

    assert.equal(rows.length, 2);
    assert.equal(rows[0].a, 1);
    assert.equal(rows[0].b, null);
    assert.equal(rows[1].a, null);
    assert.equal(rows[1].b, 'x');
  });

  it('round-trips projected GeoPackage CRS metadata', async function () {
    var srcPath = fixPath('data/geopackage/Oregon.gpkg');
    var srcBytes = fs.readFileSync(srcPath);
    var output = await api.applyCommands('-i Oregon.gpkg -o format=geopackage', {
      'Oregon.gpkg': srcBytes
    });
    var names = Object.keys(output);
    var info = await readGeoPackageTableInfo(output, names[0], 'oregon');
    var tableNames = info.map(o => o.table).sort();
    var srsIds = info.map(o => o.srsId);

    assert.equal(names.length, 1);
    assert.deepEqual(tableNames, ['land', 'roads']);
    assert.deepEqual(srsIds, [2269, 2269]);
  });

  it('round-trips custom projected CRS without authority', async function () {
    var shpPath = fixPath('data/geopackage/Oregon_customCRS.shp');
    var output = await api.applyCommands('-i "' + shpPath + '" -o format=geopackage', {});
    var names = Object.keys(output);
    var dataset = await importGeoPackageOutput(output, names[0], 'custom');

    assert.equal(names.length, 1);
    assert(dataset.info.wkt1 && dataset.info.wkt1.includes('Lambert_Conformal_Conic'));
    assert.equal(dataset.info.geopackage_crs.organization, 'NONE');
    assert.notEqual(dataset.info.geopackage_crs.organization_coordsys_id, 4326);
  });

  it('preserves a -proj assigned projection on GeoPackage round-trip', async function () {
    var input = fs.readFileSync(fixPath('data/world_land.json'));
    var output = await api.applyCommands(
      '-i world_land.json -proj +proj=robin -o format=geopackage',
      {'world_land.json': input}
    );
    var names = Object.keys(output);
    var info = await readGeoPackageTableInfo(output, names[0], 'robinson');
    var dataset = await importGeoPackageOutput(output, names[0], 'robinson');

    assert.equal(names.length, 1);
    assert.equal(info.length, 1);
    assert.notEqual(info[0].srsId, -1, 'srs_id should not be the undefined cartesian SRS');
    assert(dataset.info.wkt1 && /Robinson/i.test(dataset.info.wkt1),
      'round-tripped wkt1 should contain Robinson projection metadata');
  });

  it('uses undefined cartesian CRS for projected data without CRS metadata', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'p'},
        geometry: {type: 'Point', coordinates: [500000, 4500000]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geopackage', {'in.json': input});
    var names = Object.keys(output);
    var info = await readGeoPackageTableInfo(output, names[0], 'unknown-projected');

    assert.equal(names.length, 1);
    assert.equal(info.length, 1);
    assert.equal(info[0].srsId, -1);
  });
});
