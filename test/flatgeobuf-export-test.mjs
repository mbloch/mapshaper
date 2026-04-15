import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';

describe('flatgeobuf export', function () {
  it('exports FlatGeobuf and round-trips via async import', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'alpha'},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }, {
        type: 'Feature',
        properties: {name: 'beta'},
        geometry: {type: 'Point', coordinates: [3, 4]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var names = Object.keys(output);
    var fgbName = names[0];
    var dataset = await api.internal.importContentAsync({
      fgb: {
        filename: fgbName,
        content: output[fgbName]
      }
    }, {});

    assert.equal(names.length, 1);
    assert(/\.fgb$/i.test(fgbName));
    assert.equal(dataset.info.input_formats[0], 'flatgeobuf');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].shapes.length, 2);
    assert.deepEqual(dataset.layers[0].data.getRecords().map(rec => rec.name), ['alpha', 'beta']);
  });

  it('exports one .fgb file per layer', async function () {
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
    var output = await api.applyCommands('-i a.json b.json combine-files -o format=flatgeobuf', {
      'a.json': a,
      'b.json': b
    });
    var names = Object.keys(output);

    assert.equal(names.length, 2);
    assert(names.every(name => /\.fgb$/i.test(name)));
  });

  it('preserves EPSG code from dataset.info.flatgeobuf_crs on export', async function () {
    var src = fixPath('data/flatgeobuf/countries.fgb');
    var imported = await api.internal.importFileAsync(src, {});
    assert.equal(imported.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(imported.info.flatgeobuf_crs.code, 4326);

    var files = api.internal.exportFileContent(imported, {format: 'flatgeobuf'});
    var roundtrip = await api.internal.importContentAsync({
      fgb: {
        filename: files[0].filename,
        content: files[0].content
      }
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 4326);
  });

  it('treats missing org + EPSG-like code as EPSG', async function () {
    var src = fixPath('data/flatgeobuf/countries.fgb');
    var imported = await api.internal.importFileAsync(src, {});
    imported.info.flatgeobuf_crs = {code: 4326};

    var files = api.internal.exportFileContent(imported, {format: 'flatgeobuf'});
    var roundtrip = await api.internal.importContentAsync({
      fgb: {
        filename: files[0].filename,
        content: files[0].content
      }
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 4326);
  });
});
