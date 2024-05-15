import assert from 'assert';
import { parse, parseJSON, parseGeoJSON } from '../src/geojson/json-parser';
import fs from 'fs';
import helpers from './helpers';
var StringReader = helpers.Reader;

var numbers = [
  '-43',
  '-56.02',
  '1e-4',
  '0.332e-4',
  '0.0',
  '1.00001',
  '0.999999',
  '-0.4',
  '-344.8801',
  '4.00000',
  '0.2',
  '0.1',
  '-0.1',
  '1.89',
  '3.50582559e-71',
  '0.26604388413147273',
  '0.1234567890000000000000000000000000000',
  '6.931880898555431'
];

var coordinates = [
  '[[1.2,0.2],[4.3,-54.3]]',
  '[[[1.2,0.2],[4.3,-54.3]],[[0.03,-20],[0.01,-0.01],[0,0.0]]]',
  '[[26.482057582463895,10.433154888418336],[-35.726302957399604,-39.5829004894521],[24.588364401051606,16.357112560824532],[23.141129876644555,-49.17402188306126],[3.71313321551947,-38.81181966422922],[-26.718751399873142,-37.48084273223789],[-29.58025709607257,-45.81792210264535],[1.1922328732484146,-4.115867763306191],[8.116178342009576,48.08428411660084],[32.48171494205987,30.107830705822394]]',
  '[3.3, -0.2]',
  '[[-32.0, -2.2, -2.1]]',
  '[[2],\n[3,9, 0 ,2]]'
];

var arrays = [
  '[]',
  ' [ ] ',
  '[  "a"  ,  ["c"]]',
  '[true, false , null]',
  '[0]',
  '[0.0]',
  '  [  1  ,  2  ,   3   ,  4  ]  ',
  '[  3.324  ]'
];

var other = [
  'true',
  '  true  ',
  'false',
  'null',
];

var strings = [
  '  ""  ',
  '" "',
  '"a"',
  '"foo\\nbar\\nbaz"',
  '"\\"hello, world!\\""',
  '["\uD801\udc37"]',
];

var objects = [
  '{}',
  '  {   }  ',
  '{"foo":"bar"}',
  '{  "foo"  :  "bar"  }  ',
  '{ "a": [{ "bar": 3 } ] }',
];

function testValidJSON(str) {
  var reserveBytes = 256;
  it(str, function() {
    var buf = Buffer.from(str);
    var output = parse(buf, reserveBytes);
    assert.deepEqual(output, JSON.parse(str));
  })
}

describe('json-parse.js', function () {


  describe('parseGeoJSON', function() {
    function test(label, target) {
      it(label, function() {
        var str = JSON.stringify(target, null, 2);
        var objects = [];
        var retn = parseGeoJSON(new StringReader(str), obj => {
          objects.push(obj);
        });
        if (retn === null && objects.length == 1) {
          assert.deepEqual(objects[0], target);
        } else if (retn && retn.geometries === null) {
          retn.geometries = objects;
          assert.deepEqual(retn, target);
        } else if (retn && retn.features === null) {
          retn.features = objects;
          assert.deepEqual(retn, target);
        } else {
          throw Error('failed to parse as GeoJSON');
        }
      });
    }

    var ex1 = {
      type: 'Point',
      coordinates: [0, 0]
    };

    var ex2 = {
      type: 'Feature',
      properties: {
        foo: 'bar'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
      }
    };

    var ex3 = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'LineString',
        coordinates: [[0, 0], [1, 1]]
      }, {
        type: 'MultiPoint',
        coordinates: [[0, 0], [1, 1]]
      }]
    };

    var ex4 = {
      type: 'FeatureCollection',
      metadata: { foo: 'bar'},
      features: [{
        geometry: null,
        properties: { name: 'a'}
      }, {
        geometry: [{
          type: 'MultiLineString',
          coordinates: [[[0, 0], [2, 2]], [[-3, -4], [-4, -3]]]
        }]
      }]
    };

    test('Point', ex1)
    test('Feature', ex2)
    test('GeometryCollection', ex3)
    test('FeatureCollection with nonstandard property', ex4)

  })


  // testValidJSON('[{"foo": "b"}, {"foo": "c"}]');
  // return console.log('TEST')

  describe('valid JSON tests', function () {
    arrays.forEach(testValidJSON);
    coordinates.forEach(testValidJSON);
    other.forEach(testValidJSON);
    strings.forEach(testValidJSON);
    objects.forEach(testValidJSON);
    numbers.forEach(testValidJSON);
  });

  describe('JSONTestSuite tests', function () {
    // see: https://github.com/json-schema-org/JSON-Schema-Test-Suite
    var dir = 'test/data/json/JSONTestSuite/test_parsing/'
    var testFiles = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
    var validFiles = testFiles.filter(name => name.startsWith('y_'));
    var invalidFiles = testFiles.filter(name => name.startsWith('n_'));
    validFiles.forEach(file => {
      var str = fs.readFileSync(dir + file, 'utf8');
      testValidJSON(str, file);
    });
    invalidFiles.forEach(file => {
      it(file, () => {
        var buf = fs.readFileSync(dir + file);
        var str = buf.toString('utf8');
        assert.throws(() => {
          parse(buf);
        })

      });

    });
  })

  describe('Error message tests', function () {
    function test(str, expect) {
      it(str, function() {
        var buf = Buffer.from(str);
        var msg;
        try {
          var output = parse(buf);
        } catch (e) {
          msg = e.message
        }
        assert.equal(msg, expect);
      })
    }

    test('try', 'Unexpected token y in JSON at position 2');
    test('.', 'Unexpected token . in JSON at position 0');
    test('{"foo:4}', 'Unterminated string in JSON at position 1');
    test('01', 'Invalid number in JSON at position 0');
  })


  describe('parseJSON()', function () {
    function test(label, json) {
      it(label, function() {
        var target = JSON.parse(json);
        var result = parseJSON(new StringReader(json));
        assert.deepEqual(result, target);
      });
    }

    test('test1', '{}');
    test('test2', '{"foo": {"type": "Point"}}');
    test('test3', '[{"a": 0},\n{"b": 1}]');
  })




})
