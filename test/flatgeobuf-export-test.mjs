import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';
import { exportFlatGeobuf } from '../src/flatgeobuf/mapshaper-flatgeobuf-export';
import { getHeaderMeta } from '../src/flatgeobuf/mapshaper-flatgeobuf-lib';

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

  it('writes the layer name to the FlatGeobuf header', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {type: 'Point', coordinates: [1, 2]}
      }]
    };
    var named = await api.applyCommands(
      '-i in.json -rename-layers places -o format=flatgeobuf', {'in.json': input});
    var unnamed = exportFlatGeobuf({
      layers: [{
        name: '',
        geometry_type: 'point',
        shapes: [[[1000000, 2000000]]]
      }],
      info: {}
    }, {})[0];

    assert.equal(getHeaderMeta(named['places.fgb']).name, 'places');
    assert.equal(unnamed.filename, 'layer.fgb');
    assert.equal(getHeaderMeta(unnamed.content).name, 'layer');
  });

  // The header declares the collection's geometry type and is written before
  // any features, so a layer that turns out to hold more than one type has to
  // be encoded a second time.
  it('round-trips a layer holding more than one geometry type', async function () {
    var square = function(x) {
      return [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]];
    };
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'single'},
        geometry: {type: 'Polygon', coordinates: square(0)}
      }, {
        type: 'Feature',
        properties: {name: 'multi'},
        geometry: {type: 'MultiPolygon', coordinates: [square(5), square(8)]}
      }, {
        type: 'Feature',
        properties: {name: 'single2'},
        geometry: {type: 'Polygon', coordinates: square(12)}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var dataset = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});
    var lyr = dataset.layers[0];
    assert.equal(lyr.geometry_type, 'polygon');
    assert.deepEqual(lyr.data.getRecords().map(rec => rec.name),
      ['single', 'multi', 'single2']);
    // the middle feature keeps both of its parts
    assert.equal(lyr.shapes[0].length, 1);
    assert.equal(lyr.shapes[1].length, 2);
    assert.equal(lyr.shapes[2].length, 1);
  });

  // A path that is shorter than the output precision interval rounds to a
  // single point and is dropped, leaving the feature without a geometry.
  it('keeps a feature whose geometry collapses at the output precision', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'kept'},
        geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}
      }, {
        type: 'Feature',
        properties: {name: 'collapsed'},
        geometry: {type: 'LineString', coordinates: [[2, 2], [2.0000001, 2.0000001]]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf precision=0.000001',
      {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var dataset = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});
    var lyr = dataset.layers[0];

    assert.equal(lyr.geometry_type, 'polyline');
    assert.deepEqual(lyr.data.getRecords().map(rec => rec.name), ['kept', 'collapsed']);
    assert.deepEqual(lyr.shapes[1], null);
  });

  it('writes a null shape as a record with no geometry', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}
      }, {
        type: 'Feature',
        properties: {name: 'b'},
        geometry: null
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var dataset = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});
    var lyr = dataset.layers[0];

    assert.equal(lyr.geometry_type, 'polyline');
    assert.deepEqual(lyr.data.getRecords().map(rec => rec.name), ['a', 'b']);
    assert.deepEqual(lyr.shapes[1], null);
  });

  // Features are read in place, so a record with no coordinates must still leave
  // the records that follow it 8-byte aligned.
  it('reads coordinates of features that follow a null geometry', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'first'},
        geometry: null
      }, {
        type: 'Feature',
        properties: {name: 'second'},
        geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}
      }, {
        type: 'Feature',
        properties: {name: 'third'},
        geometry: null
      }, {
        type: 'Feature',
        properties: {name: 'fourth'},
        geometry: {type: 'MultiLineString', coordinates: [[[3, 3], [4, 4]], [[6, 6], [7, 7]]]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.applyCommands('-i in.fgb -o out.json', {'in.fgb': output[fgbName]});
    var features = JSON.parse(roundtrip['out.json']).features;

    assert.deepEqual(features.map(feat => feat.properties.name),
      ['first', 'second', 'third', 'fourth']);
    assert.deepEqual(features.map(feat => feat.geometry), [
      null,
      {type: 'LineString', coordinates: [[0, 0], [1, 1]]},
      null,
      {type: 'MultiLineString', coordinates: [[[3, 3], [4, 4]], [[6, 6], [7, 7]]]}
    ]);
  });

  it('exports a layer in which every feature has a null geometry', async function () {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: null
      }, {
        type: 'Feature',
        properties: {name: 'b'},
        geometry: null
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var dataset = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});
    var lyr = dataset.layers[0];

    // A collection of null geometries imports as an attribute-only layer, the
    // same as the equivalent GeoJSON.
    assert.deepEqual(lyr.data.getRecords().map(rec => rec.name), ['a', 'b']);
    assert(!lyr.geometry_type);
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

  it('exports sparse properties without mutating first-row values', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {a: null, b: undefined},
        geometry: {type: 'Point', coordinates: [0, 0]}
      }, {
        type: 'Feature',
        properties: {a: 7, b: 'x'},
        geometry: {type: 'Point', coordinates: [1, 1]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});
    var records = roundtrip.layers[0].data.getRecords();

    assert.equal(records[0].a, undefined);
    assert.equal(records[0].b, undefined);
    assert.equal(records[1].a, 7);
    assert.equal(records[1].b, 'x');
  });

  it('uses integer column types for integer-valued numeric fields', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {small: 1, large: 3000000000, decimal: 1.5},
        geometry: {type: 'Point', coordinates: [0, 0]}
      }, {
        type: 'Feature',
        properties: {small: -2, large: 3000000001, decimal: 2},
        geometry: {type: 'Point', coordinates: [1, 1]}
      }]
    };
    var output = await api.applyCommands('-i in.json -o format=flatgeobuf', {'in.json': input});
    var fgbName = Object.keys(output)[0];
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: fgbName, content: output[fgbName]}
    }, {});
    var records = roundtrip.layers[0].data.getRecords();

    assert.deepEqual(records.map(rec => rec.small), [1, -2]);
    assert.deepEqual(records.map(rec => rec.large), [3000000000, 3000000001]);
    assert.deepEqual(records.map(rec => rec.decimal), [1.5, 2]);
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
    assert(/^GEOGCRS\[/i.test(roundtrip.info.flatgeobuf_crs.wkt));
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

  it('writes WKT-only CRS metadata when the projection has no EPSG code', async function () {
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

    assert.equal(roundtrip.info.flatgeobuf_crs.org, null);
    assert.equal(roundtrip.info.flatgeobuf_crs.code, null);
    assert(/^PROJCRS\[/i.test(roundtrip.info.flatgeobuf_crs.wkt));
    assert(/\+proj=aea/.test(roundtrip.info.crs_string), roundtrip.info.crs_string);
  });

  it('imports WKT1-only CRS metadata from FlatGeobuf', async function () {
    var dataset = {
      info: {
        flatgeobuf_crs: {
          wkt: 'GEOGCS["WGS84",DATUM["WGS_1984",' +
            'SPHEROID["WGS 84",6378137,298.257223563]],' +
            'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
        }
      },
      layers: [{
        name: 'pts',
        geometry_type: 'point',
        shapes: [[[500000, 4500000]]]
      }]
    };
    var files = api.internal.exportFileContent(dataset, {format: 'flatgeobuf'});
    var roundtrip = await api.internal.importContentAsync({
      fgb: {filename: files[0].filename, content: files[0].content}
    }, {});

    assert(/^GEOGCS\[/i.test(roundtrip.info.flatgeobuf_crs.wkt));
    assert(/\+datum=WGS84/.test(roundtrip.info.crs_string), roundtrip.info.crs_string);
  });
});
