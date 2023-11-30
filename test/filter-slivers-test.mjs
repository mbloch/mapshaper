import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-filter-slivers.js', function () {

  describe('calcMaxSliverArea()', function () {
    it('ignores relatively long segments', function () {
      var coords2 = [[[3, 1], [2, 1], [2, 2]], [[2, 3], [3, 3]], [[1, 3], [4, 3], [4, 0]]],
          arcs2 = new api.internal.ArcCollection(coords2);
      assert.equal(api.internal.calcMaxSliverArea(arcs2), 1);
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

    api.applyCommands('-erase remove-slivers target=layer1 source=layer2 -o target=layer1 format=topojson no-quantization', topo, function(err, data) {
      if (err) throw err;
      var obj = JSON.parse(data);
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

    api.applyCommands('-erase remove-slivers target=layer1 source=layer2 -o target=layer1 format=topojson no-quantization bbox', topo, function(err, data) {
      if (err) throw err;
      var obj = JSON.parse(data);
      // sliver from erase is removed but equally tiny ring is retained
      assert.deepEqual(obj.bbox, [0, 2, 2, 3]);
      done();
    });
  })

})