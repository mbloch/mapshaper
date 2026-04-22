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

  it('embeds EPSG:4326 when source is a WGS-84 GeoJSON', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {type: 'Point', coordinates: [-122.4, 37.8]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 4326);
  });

  it('embeds EPSG:4326 when -proj wgs84 is applied', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {type: 'Point', coordinates: [-122.4, 37.8]}
      }]
    };
    var output = await api.applyCommands(
      '-i in.json -proj wgs84 -o format=flatgeobuf',
      {'in.json': input}
    );
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 4326);
  });

  it('embeds the EPSG code requested by -proj epsg:NNNN', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {type: 'Point', coordinates: [-122.4, 37.8]}
      }]
    };
    var output = await api.applyCommands(
      '-i in.json -proj epsg:32610 -o format=flatgeobuf',
      {'in.json': input}
    );
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 32610);
  });

  it('embeds EPSG:3857 when source is reprojected to Web Mercator', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {type: 'Point', coordinates: [-122.4, 37.8]}
      }]
    };
    var output = await api.applyCommands(
      '-i in.json -proj webmercator -o format=flatgeobuf',
      {'in.json': input}
    );
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 3857);
  });

  it('extracts top-level AUTHORITY["EPSG", N] from a WKT1 .prj string', async function () {
    var dataset = {
      info: {
        wkt1: 'GEOGCS["NAD27",DATUM["North_American_Datum_1927",' +
          'SPHEROID["Clarke 1866",6378206.4,294.9786982139006,' +
          'AUTHORITY["EPSG","7008"]],AUTHORITY["EPSG","6267"]],' +
          'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
          'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
          'AUTHORITY["EPSG","4267"]]'
      },
      layers: [{
        name: 'pts',
        geometry_type: 'point',
        shapes: [[[1, 2]]]
      }]
    };
    var files = api.internal.exportFileContent(dataset, {format: 'flatgeobuf'});
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: files[0].filename, content: files[0].content}
    }, {});

    assert.equal(roundtrip.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(roundtrip.info.flatgeobuf_crs.code, 4267);
  });

  it('warns and writes no CRS when the projection has no EPSG code', async function () {
    var loggingWasEnabled = api.internal.loggingEnabled();
    api.enableLogging();
    var calls = [];
    var origError = console.error;
    console.error = function() { calls.push(Array.prototype.join.call(arguments, ' ')); };
    try {
      var input = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'a'},
          geometry: {type: 'Point', coordinates: [-122.4, 37.8]}
        }]
      };
      // +proj=aea is a custom projection that mapshaper can't tag with an EPSG code.
      var output = await api.applyCommands(
        '-i in.json -proj "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +datum=WGS84" -o format=flatgeobuf',
        {'in.json': input}
      );
      var fgbName = Object.keys(output)[0];
      var roundtrip = await api.internal.importContentAsync({
        fgb: {filename: fgbName, content: output[fgbName]}
      }, {});

      assert.strictEqual(roundtrip.info.flatgeobuf_crs, null);
      assert.ok(
        calls.some(s => /without a CRS in the FlatGeobuf header/.test(s)),
        'expected a "no CRS" warning but got:\n' + calls.join('\n')
      );
    } finally {
      console.error = origError;
      if (!loggingWasEnabled) api.internal.disableLogging();
    }
  });
});
