import api from '../mapshaper.js';
import assert from 'assert';

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
    var dataset = await api.internal.importContentAsync({
      gpkg: {
        filename: gpkgName,
        content: output[gpkgName]
      }
    }, {});

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
    var dataset = await api.internal.importContentAsync({
      gpkg: {
        filename: names[0],
        content: output[names[0]]
      }
    }, {});

    assert.equal(names.length, 1);
    assert(/\.gpkg$/i.test(names[0]));
    assert.equal(dataset.layers.length, 2);
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
    var dataset = await api.internal.importContentAsync({
      gpkg: {
        filename: names[0],
        content: output[names[0]]
      }
    }, {});
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
    var dataset = await api.internal.importContentAsync({
      gpkg: {
        filename: names[0],
        content: output[names[0]]
      }
    }, {});
    var rows = dataset.layers[0].data.getRecords();

    assert.equal(rows.length, 2);
    assert.equal(rows[0].a, 1);
    assert.equal(rows[0].b, null);
    assert.equal(rows[1].a, null);
    assert.equal(rows[1].b, 'x');
  });
});
