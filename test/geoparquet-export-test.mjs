import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';

describe('geoparquet export', function() {
  it('exports GeoParquet and round-trips via async import', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'alpha', value: 3},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }, {
        type: 'Feature',
        properties: {name: 'beta', value: 7},
        geometry: {type: 'Point', coordinates: [3, 4]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    var names = Object.keys(output);
    var fileName = names[0];
    var dataset = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});

    assert.equal(names.length, 1);
    assert(/\.parquet$/i.test(fileName));
    assert.equal(dataset.info.input_formats[0], 'geoparquet');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].shapes.length, 2);
    assert.deepEqual(dataset.layers[0].data.getRecords().map(rec => rec.name), ['alpha', 'beta']);
    assert.deepEqual(dataset.layers[0].data.getRecords().map(rec => rec.value), [3, 7]);
  });

  it('accepts format=parquet as an alias', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'Point', coordinates: [5, 6]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=parquet', {'in.json': input});
    var names = Object.keys(output);
    assert.equal(names.length, 1);
    assert(/\.parquet$/i.test(names[0]));
  });

  it('preserves CRS metadata from imported GeoParquet on export', async function() {
    var src = fixPath('data/geoparquet/example-crs_vermont-utm_geo.parquet');
    var imported = await api.internal.importFileAsync(src, {});
    assert.equal(imported.info.crs_string, 'epsg:32618');

    var output = await api.applyCommands('-i ' + src + ' -o format=geoparquet');
    var fileName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});
    assert.equal(roundtrip.info.crs_string, 'epsg:32618');
  });
});
