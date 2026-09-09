import assert from 'assert';
import api from '../mapshaper.js';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import { calcMaxSliverArea } from '../src/polygons/mapshaper-slivers';


describe('mapshaper-filter-slivers.js', function () {

  it('remove-empty flag', async function() {
    var cmd = `-i test/data/shapefile/two_states_mercator.shp -explode -filter-slivers
    min-area=100km2 remove-empty -o output.json`;
    var out = await api.applyCommands(cmd);
    var features = JSON.parse(out['output.json']).features;
    assert.equal(features.length, 4);
  });

  it('default gap-width=auto matches legacy area + sliver-control=1', async function() {
    var input = {
      'in.json': JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'block'},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 10000], [10000, 10000], [10000, 0], [0, 0]]]
          }
        }, {
          type: 'Feature',
          properties: {name: 'sliver'},
          geometry: {
            type: 'Polygon',
            coordinates: [[[20000, 0], [20000, 50], [40000, 50], [40000, 0], [20000, 0]]]
          }
        }]
      })
    };
    var modern = await api.applyCommands(
      '-i in.json -filter-slivers remove-empty -o out.json', input);
    var legacy = await api.applyCommands(
      '-i in.json -filter-slivers sliver-control=1 remove-empty -o out.json',
      input);
    assert.deepEqual(JSON.parse(String(modern['out.json'])),
      JSON.parse(String(legacy['out.json'])));
  });

  it('accepts an explicit gap-width', async function() {
    var input = {
      'in.json': JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'sliver'},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 50], [20000, 50], [20000, 0], [0, 0]]]
          }
        }]
      })
    };
    var kept = await api.applyCommands(
      '-i in.json -filter-slivers gap-width=10 -o out.json', input);
    var removed = await api.applyCommands(
      '-i in.json -filter-slivers gap-width=100 -o out.json', input);
    assert.ok(JSON.parse(String(kept['out.json'])).features[0].geometry);
    assert.equal(JSON.parse(String(removed['out.json'])).features[0].geometry,
      null);
  });


  describe('calcMaxSliverArea()', function () {
    it('ignores relatively long segments', function () {
      var coords2 = [[[3, 1], [2, 1], [2, 2]], [[2, 3], [3, 3]], [[1, 3], [4, 3], [4, 0]]],
          arcs2 = new ArcCollection(coords2);
      assert.equal(calcMaxSliverArea(arcs2), 1);
    })
  })

  it ('Issue #118 small erased island not detected as splinter', function(done) {
    //  a ---- b
    //  |      |
    //  |  ef  |
    //  |  hg  |
    //  |      |
    //  d ---- c
    //
    var arcs = [
      [[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]],
      [[3, 4], [3.001, 4], [3.001, 3.999], [3, 3.999], [3, 4]]
    ]

    var topo = {
      type: 'Topology',
      arcs: arcs,
      objects: {
        layer1: {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Polygon',
            arcs: [[0]]
          }]
        },
        layer2: {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Polygon',
            arcs: [[1]]
          }]
        }
      }
    };

    api.applyCommands('-i input.json -erase remove-slivers target=layer1 source=layer2 -o target=layer1 format=topojson no-quantization output.json', {'input.json': topo}, function(err, output) {
      if (err) throw err;
      var obj = JSON.parse(output['output.json']);
      var target = {
        type: "Topology",
        arcs: [
          [[1, 6], [6, 6], [6, 1], [1, 1], [1, 6]],
          // gets reversed, because it becomes a hole
          // [[3, 4], [3.001, 4], [3.001, 3.999], [3, 3.999], [3, 4]]
          [[3, 4], [3, 3.999], [3.001, 3.999], [3.001, 4], [3, 4]]
        ],
        objects: {
          layer1: {
            type: 'GeometryCollection',
            geometries: [{
              type: 'Polygon',
              arcs: [[0], [1]]
            }]
          }
        }
      };

      assert.deepEqual(obj, target);
      done();
    });

  })

  it ('Erasing only removes splinters adjacent to clipping boundary', function(done) {

    //         a -- b
    //         |    |
    // ij  e --|----|f
    // ||  |   |    ||
    // lk  h __|____|g
    //         |    |
    //         d -- c
    //

    var arcs = [
      [[2, 4], [3, 4], [3, 1], [2, 1], [2, 4]],         // abcd
      [[1, 3], [3.01, 3], [3.01, 2], [1, 2], [1, 3]],   // efgh
      [[0, 3], [0.01, 3], [0.01, 2], [0, 2], [0, 3]]];  // ijkl

    var topo = {
      type: 'Topology',
      arcs: arcs,
      objects: {
        layer1: {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Polygon',
            arcs: [[1]]
          }, {
            type: 'Polygon',
            arcs: [[2]]
          }]
        },
        layer2: {
          type: 'Polygon',
          arcs: [[0]]
        }
      }
    };

    api.applyCommands('-i input.json -erase remove-slivers target=layer1 source=layer2 -o target=layer1 format=topojson no-quantization bbox output.json', {'input.json': topo}, function(err, output) {
      if (err) throw err;
      var obj = JSON.parse(output['output.json']);
      // sliver from erase is removed but equally tiny ring is retained
      assert.deepEqual(obj.bbox, [0, 2, 2, 3]);
      done();
    });
  })

})