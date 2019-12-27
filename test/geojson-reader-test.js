var fs = require('fs'),
    api = require('..'),
    assert = require('assert'),
    GeoJSONReader = api.internal.GeoJSONReader,
    FileReader = api.internal.FileReader,
    StringReader = require('./helpers.js').Reader;

function toString(buf) {
  return buf.toString('utf8');
}

function parseTest(input, output) {
  var features = [];
  new GeoJSONReader(new StringReader(JSON.stringify(input))).readObjects(function(o) {features.push(o)});
  assert.deepEqual(features, output);
}

describe('geojson-reader.js', function () {

  describe('GeoJSONReader()', function () {

    describe('parseFile()', function () {
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
        var file = 'test/data/three_points.geojson';
        var reader = new FileReader(file);
        var features = [];
        var contents = require('fs').readFileSync(file, 'utf8');
        var target = JSON.parse(contents).features;
        new GeoJSONReader(reader).readObjects(function(feat) {features.push(feat)});
        assert.deepEqual(features, target);

      });
    })

    describe('readObject()', function () {
      it('test1', function () {
        var reader = new GeoJSONReader(new StringReader('{}'));
        var target = {text: '{}', end: 2, start: 0};
        assert.deepEqual(reader.readObject(0), target);
      })

      it('test2', function () {
        var reader = new GeoJSONReader(new StringReader('{"foo": {"type": "Point"}}'));
        var target = {text: '{"type": "Point"}', end: 25, start: 2};
        assert.deepEqual(reader.readObject(6), target);
      })

      it('test3', function () {
        var reader = new GeoJSONReader(new StringReader('{"foo": {"type": "Point"}}'));
        var target = {text: '{"foo": {"type": "Point"}}', end: 26, start: 0};
        assert.deepEqual(reader.readObject(0), target);
      })

      it('test4', function () {
        var reader = new GeoJSONReader(new StringReader('{"a": "}""}\\"}"}'));
        var target = {text: '{"a": "}\""}\\\"}"}', end: 16, start: 0};
        assert.deepEqual(reader.readObject(0), target);
      })

      it('test5', function () {
        var reader = new GeoJSONReader(new StringReader('[{"a": 0},\n{"b": 1}]'));
        var target = {text: '{"b": 1}', end: 19, start: 2};
        assert.deepEqual(reader.readObject(9), target);
      })

    })

  })

})
