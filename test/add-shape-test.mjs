import api from '../mapshaper.js';
import assert from 'assert';
import { toFeature } from '../src/commands/mapshaper-add-shape';

describe('mapshaper-add-shape.js', function () {

  it('Creates a new layer when run as first command with +', async function() {
    var cmd = '-add-shape coordinates=3.4,-5 + -o point.json';
    var output = await api.applyCommands(cmd);
    var geojson = JSON.parse(output['point.json']);
    assert.deepEqual(geojson, {
      type: 'GeometryCollection',
      geometries: [{
        type: 'Point',
        coordinates: [3.4, -5]
      }]
    });
  })

  it('Also creates a new layer without + when run as first command', async function() {
    var cmd = '-add-shape coordinates=3.4,-5 -o point.json';
    var output = await api.applyCommands(cmd);
    var geojson = JSON.parse(output['point.json']);
    assert.deepEqual(geojson, {
      type: 'GeometryCollection',
      geometries: [{
        type: 'Point',
        coordinates: [3.4, -5]
      }]
    });
  })

  it('shape is added to target layer by default', async function() {
    var data = {
      type: 'Feature',
      properties: {
        foo: 'bar'
      },
      geometry: {
        type: 'Point',
        coordinates: [6, 0]
      }
    };
    var cmd = '-i point.json -add-shape coordinates=7,0 properties={"foo":"baz"} -o points.json';
    var output = await api.applyCommands(cmd, {'point.json': data});
    var geojson = JSON.parse(output['points.json']);
    var expected = {
      type: 'FeatureCollection',
      features: [data, {
        type: 'Feature',
        properties: {foo: 'baz'},
        geometry: {type: 'Point', coordinates: [7,0]}
      }]
    };
    assert.deepEqual(geojson, expected);
  })

  it('error when added shape does not match layer type', async function() {
    var data = {
      type: 'Feature',
      properties: {
        foo: 'bar'
      },
      geometry: {
        type: 'LineString',
        coordinates: [[6, 0], [5, 1]]
      }
    };
    var cmd = '-i line.json -add-shape coordinates=7,0 -o out.json';
    try {
      await api.applyCommands(cmd, {'line.json': data});
      throw Error();
    } catch(e) {
      assert.equal(e.name, 'UserError');
    }
  })


  it('coordinates=x,y,x,y polyline notation', async function() {
    var cmd = '-add-shape coordinates=1,1,1,3,3,3 -o line.json';
    var output = await api.applyCommands(cmd);
    var geojson = JSON.parse(output['line.json']);
    var expect = {
      type: 'LineString',
      coordinates: [[1,1], [1,3], [3,3]]
    };
    assert.deepEqual(geojson.geometries[0], expect);
  })

  it('coordinates=x,y,x,y polygon notation', async function() {
    var cmd = '-add-shape coordinates=1,1,1,3,3,3,3,1,1,1 -o line.json';
    var output = await api.applyCommands(cmd);
    var geojson = JSON.parse(output['line.json']);
    // note: winding order is reversed as per geojson spec
    var expect = {
      type: 'Polygon',
      coordinates: [[[1,1], [3,1], [3,3], [1,3], [1,1]]]
    };
    assert.deepEqual(geojson.geometries[0], expect);
  })

  it('geojson= parameter works', async function() {
    var input = {
      type: 'Feature',
      properties: {foo: 'bar'},
      geometry: {type: 'Polygon', coordinates: [[[0,0], [1,0], [1,1], [0,1], [0,0]]]}
    };
    var geojson = JSON.stringify(input)
    var cmd = `-add-shape geojson=${geojson} -o polygon.json`;
    var out = await api.applyCommands(cmd);
    var output = JSON.parse(out['polygon.json']);
    assert.deepEqual(input, output.features[0]);
  })

  it('geojson param accepts object', function() {
    var input = {
      type: 'Feature',
      properties: {foo: 'bar'},
      geometry: {type: 'Point', coordinates: [3, 2]}
    };
    var feat = toFeature({geojson: input});
    assert.deepEqual(feat, input);
  });

  it('coordinates and properties params accept object', function() {
    var opts = {
      coordinates: [2,3,5,6],
      properties: {foo: 'bar'}
    };
    var expect = {
      type: 'Feature',
      properties: {foo: 'bar'},
      geometry: {type: 'LineString', coordinates: [[2,3], [5,6]]}
    };
    var feat = toFeature(opts);
    assert.deepEqual(feat, expect);
  });

})

