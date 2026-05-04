import api from '../mapshaper.js';
import assert from 'assert';
import { parquetMetadataAsync } from 'hyparquet';
import { fixPath, captureLogCallsAsync } from './helpers';

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

  it('exports tabular layers as Parquet without a geometry column', async function() {
    var input = [{
      name: 'alpha',
      value: 3
    }, {
      name: 'beta',
      value: 7
    }];
    var out = await captureLogCallsAsync(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    });
    var output = out.result;
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    var fields = getParquetFieldNames(metadata);
    assert(!fields.includes('geometry'));
    assert(/writing attribute data only/.test(out.log.join('\n')));

    var dataset = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});
    assert.equal(dataset.layers[0].geometry_type, null);
    assert.deepEqual(dataset.layers[0].data.getRecords(), input);
  });

  it('exports null-geometry features with attributes as Parquet tables', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'alpha'},
        geometry: null
      }]
    };
    var out = await captureLogCallsAsync(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': input});
    });
    var output = out.result;
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    assert(!getParquetFieldNames(metadata).includes('geometry'));
    assert(/writing attribute data only/.test(out.log.join('\n')));
  });

  it('rejects empty GeoParquet output layers', async function() {
    var emptyInput = {
      type: 'FeatureCollection',
      features: []
    };
    var nullOnlyInput = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: null,
        geometry: null
      }]
    };
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': emptyInput});
    }, /requires at least one record/);
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -o format=geoparquet', {'in.json': nullOnlyInput});
    }, /requires at least one record|requires geometry or attribute data/);
  });

  it('exports ZSTD-compressed GeoParquet when requested', async function() {
    var text = 'abcdefghijklmnopqrstuvwxyz'.repeat(40);
    var input = {
      type: 'FeatureCollection',
      features: []
    };
    for (var i = 0; i < 3000; i++) {
      input.features.push({
        type: 'Feature',
        properties: {name: text + i},
        geometry: {type: 'Point', coordinates: [i % 360 - 180, Math.floor(i / 360)]}
      });
    }
    var output = await api.applyCommands('-i in.json -o format=geoparquet compression=zstd level=10', {'in.json': input});
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    assert.deepEqual(getParquetCodecs(metadata), ['ZSTD']);

    var dataset = await api.internal.importContentAsync({
      parquet: {
        filename: fileName,
        content: output[fileName]
      }
    }, {});
    assert.equal(dataset.layers[0].geometry_type, 'point');
    assert.equal(dataset.layers[0].data.size(), 3000);
    assert.equal(dataset.layers[0].data.getRecordAt(2999).name, text + '2999');
  });

  it('exports uncompressed GeoParquet when requested', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'Point', coordinates: [5, 6]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=geoparquet compression=none', {'in.json': input});
    var fileName = Object.keys(output)[0];
    var metadata = await parquetMetadataAsync(toArrayBuffer(output[fileName]));
    assert.deepEqual(getParquetCodecs(metadata), ['UNCOMPRESSED']);
  });

  it('rejects compression level without ZSTD compression', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 1},
        geometry: {type: 'Point', coordinates: [5, 6]}
      }]
    };
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -o format=geoparquet compression=snappy level=3', {'in.json': input});
    }, /level= option only applies with compression=zstd/);
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

function getParquetCodecs(metadata) {
  var index = {};
  (metadata.row_groups || []).forEach(function(rowGroup) {
    (rowGroup.columns || []).forEach(function(column) {
      index[column.meta_data && column.meta_data.codec] = true;
    });
  });
  return Object.keys(index).sort();
}

function getParquetFieldNames(metadata) {
  return metadata.schema.map(function(field) {
    return field.name;
  });
}

function toArrayBuffer(content) {
  if (content instanceof ArrayBuffer) return content;
  if (content instanceof Uint8Array) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  }
  return content;
}
