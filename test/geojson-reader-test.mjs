import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import helpers from './helpers';

var GeoJSONReader = api.internal.GeoJSONReader,
    FileReader = api.internal.FileReader,
    StringReader = helpers.Reader;

function toString(buf) {
  return buf.toString('utf8');
}

function parseTest(input, output) {
  var features = [];
  new GeoJSONReader(new StringReader(JSON.stringify(input))).readObjects(function(o) {features.push(o)});
  assert.deepEqual(features, output);
}

function testReadingFromFile(file, readerOpts) {
  var reader = new FileReader(file, readerOpts);
  var features = [];
  var contents = fs.readFileSync(file, 'utf8');
  var target = JSON.parse(contents).features;
  new GeoJSONReader(reader).readObjects(function(feat) {features.push(feat)});
  assert.deepEqual(features, target);
}

describe('geojson-reader.js', function () {

  describe('GeoJSONReader()', function () {

    describe('readObjects()', function () {
      it('test1', function () {
        var json = {
          type: "Point",
          coordinates: [0, 0]
        };
        parseTest(json, [json]);
      })

      it('test2', function () {
        var json = {type: 'GeometryCollection', geometries: [{
          type: "Point",
          coordinates: [0, 0]
        }, {
          type: "Point",
          coordinates: [1, 1]
        }]};
        parseTest(json, json.geometries);
      })

      it('test3', function () {
        var json = {type: 'FeatureCollection', features: [{
          type: 'Feature',
          geometry: {
            type: "Point",
            coordinates: [0, 0]
          },
          properties: {foo: {}}
        }]};
        parseTest(json, json.features);
      })

      it('file reading test', function() {
        testReadingFromFile('test/data/three_points.geojson', null);
      });

      it('file reading with buffer expansion', function() {
        testReadingFromFile('test/data/two_states.json', {cacheSize: 2, bufferSize: 2});
      })
    })

  })

})
