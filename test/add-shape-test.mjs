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

  describe('style options', function() {
    it('style options become properties of the new line', async function() {
      var cmd = '-add-shape coordinates=0,0,10,0 stroke=red stroke-width=2 line-end=arrow ' +
        'stroke-dasharray="4 2" -o out.json';
      var out = await api.applyCommands(cmd);
      var feat = JSON.parse(out['out.json']).features[0];
      assert.deepEqual(feat.properties, {
        stroke: 'red',
        'stroke-width': 2,
        'line-end': 'arrow',
        'stroke-dasharray': '4 2'
      });
      assert.equal(feat.geometry.type, 'LineString');
    });

    it('style options are merged with properties=', async function() {
      var cmd = '-add-shape coordinates=0,0,10,0 properties={"name":"A1"} stroke=blue -o out.json';
      var out = await api.applyCommands(cmd);
      var feat = JSON.parse(out['out.json']).features[0];
      assert.deepEqual(feat.properties, {name: 'A1', stroke: 'blue'});
    });

    it('style options are applied to a geojson= feature', async function() {
      var geojson = JSON.stringify({type: 'LineString', coordinates: [[0, 0], [1, 1]]});
      var out = await api.applyCommands(`-add-shape geojson=${geojson} stroke=green -o out.json`);
      var feat = JSON.parse(out['out.json']).features[0];
      assert.deepEqual(feat.properties, {stroke: 'green'});
    });

    it('an unusable style value is an error', async function() {
      await assert.rejects(api.applyCommands('-add-shape coordinates=0,0,10,0 stroke-width=wide'),
        /Unexpected value for stroke-width/);
    });

    it('a style value matches the type already used by the target layer', async function() {
      var cmd = '-add-shape coordinates=0,0,10,0 stroke-width=2 ' +
        '-add-shape coordinates=0,5,10,5 stroke-width=3 -o out.json';
      var out = await api.applyCommands(cmd);
      var features = JSON.parse(out['out.json']).features;
      assert.strictEqual(features[0].properties['stroke-width'], 2);
      assert.strictEqual(features[1].properties['stroke-width'], 3);
    });

    it('lines with different styles share one layer', async function() {
      var cmd = '-add-shape coordinates=0,0,10,0 stroke=red line-end=arrow ' +
        '-add-shape coordinates=0,5,10,5 stroke=blue -o out.json';
      var out = await api.applyCommands(cmd);
      var features = JSON.parse(out['out.json']).features;
      assert.equal(features.length, 2);
      assert.equal(features[0].properties.stroke, 'red');
      assert.equal(features[1].properties.stroke, 'blue');
      assert.equal(features[0].properties['line-end'], 'arrow');
      assert(!features[1].properties['line-end']);
    });

    it('styles are written to SVG output', async function() {
      var cmd = '-add-shape coordinates=0,0,10,0 stroke=#c00 stroke-width=3 -o out.svg';
      var out = await api.applyCommands(cmd);
      var svg = String(out['out.svg']);
      assert(svg.includes('stroke="#c00"'));
      assert(svg.includes('stroke-width="3"'));
    });
  });

  describe('target layers', function() {
    it('the first shape added to an empty named layer keeps the layer name', async function() {
      var cmd = '-add-layer geometry-type=polyline name=routes ' +
        '-add-shape coordinates=0,0,10,0 target=routes -o format=geojson';
      var out = await api.applyCommands(cmd);
      assert.deepEqual(Object.keys(out), ['routes.json']);
      assert.equal(JSON.parse(out['routes.json']).geometries.length, 1);
    });

    it('a ring added to a polyline layer stays a line', async function() {
      var cmd = '-add-layer geometry-type=polyline name=routes ' +
        '-add-shape coordinates=0,0,10,0,10,10,0,0 -o out.json';
      var out = await api.applyCommands(cmd);
      var geom = JSON.parse(out['out.json']).geometries[0];
      assert.equal(geom.type, 'LineString');
      assert.equal(geom.coordinates.length, 4);
    });

    it('an open path added to a polygon layer is an error, unless closed is given', async function() {
      var cmd = '-add-layer geometry-type=polygon name=zones -add-shape coordinates=0,0,10,0,10,10';
      await assert.rejects(api.applyCommands(cmd), /closed option/);
      var out = await api.applyCommands(cmd + ' closed fill=pink -o out.json');
      var feat = JSON.parse(out['out.json']).features[0];
      assert.equal(feat.geometry.type, 'Polygon');
      assert.equal(feat.geometry.coordinates[0].length, 4);
      assert.deepEqual(feat.properties, {fill: 'pink'});
    });

    it('closed makes a polygon layer when there is no target', async function() {
      var out = await api.applyCommands('-add-shape coordinates=0,0,10,0,10,10 closed -o out.json');
      assert.equal(JSON.parse(out['out.json']).geometries[0].type, 'Polygon');
    });

    it('closed needs three vertices', async function() {
      await assert.rejects(api.applyCommands('-add-shape coordinates=0,0,10,0 closed'),
        /at least three vertices/);
    });

    it('+ adds the shape to a new layer', async function() {
      var cmd = '-add-layer geometry-type=polyline name=routes ' +
        '-add-shape coordinates=0,0,10,0 target=routes ' +
        '-add-shape coordinates=0,5,10,5 target=routes + name=extra -o target=* format=geojson';
      var out = await api.applyCommands(cmd);
      assert.deepEqual(Object.keys(out).sort(), ['extra.json', 'routes.json']);
    });
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

  describe('extend', function() {
    var routes = '-add-layer geometry-type=polyline name=routes ' +
      '-add-shape coordinates=0,0,10,0 stroke=red target=routes ' +
      '-add-shape coordinates=0,5,10,5 target=routes ';

    async function getFeatures(cmd) {
      var out = await api.applyCommands(routes + cmd + ' -o out.json');
      return JSON.parse(out['out.json']).features;
    }

    it('continues a line from its last vertex', async function() {
      var features = await getFeatures('-add-shape coordinates=10,0,15,5 extend target=routes');
      assert.equal(features.length, 2);
      assert.deepEqual(features[0].geometry.coordinates, [[0, 0], [10, 0], [15, 5]]);
      assert.deepEqual(features[0].properties, {stroke: 'red'});
    });

    it('continues a line from its first vertex, keeping its direction', async function() {
      var features = await getFeatures('-add-shape coordinates=0,0,-5,-5 extend target=routes');
      assert.deepEqual(features[0].geometry.coordinates, [[-5, -5], [0, 0], [10, 0]]);
    });

    it('joins a path that ends at the line', async function() {
      var features = await getFeatures('-add-shape coordinates=15,5,10,5 extend target=routes');
      assert.deepEqual(features[1].geometry.coordinates, [[0, 5], [10, 5], [15, 5]]);
    });

    it('applies style options to the line it extends', async function() {
      var features = await getFeatures('-add-shape coordinates=10,5,20,5 stroke=blue extend target=routes');
      assert.deepEqual(features[1].properties, {stroke: 'blue'});
      assert.deepEqual(features[0].properties, {stroke: 'red'});
    });

    it('is an error when no line ends at the path', async function() {
      await assert.rejects(getFeatures('-add-shape coordinates=5,0,5,5 extend target=routes'),
        /No line in the target layer ends at/);
    });

    it('is an error when more than one line ends there', async function() {
      var cmd = '-add-shape coordinates=10,0,10,5 target=routes ' +
        '-add-shape coordinates=10,0,20,0 extend target=routes';
      await assert.rejects(getFeatures(cmd), /More than one line ends at/);
    });

    it('requires a polyline layer', async function() {
      var cmd = '-add-layer geometry-type=polygon name=zones ' +
        '-add-shape coordinates=0,0,1,0,1,1 extend target=zones';
      await assert.rejects(getFeatures(cmd), /requires a polyline target layer/);
    });
  });

})

