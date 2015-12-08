var assert = require('assert'),
    api = require("../");

describe('mapshaper-filter-slivers.js', function () {

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
      [[2, 4], [3, 4], [3, 1], [2, 1], [2, 4]],
      [[1, 3], [3.01, 3], [3.01, 2], [1, 2], [1, 3]],
      [[0, 3], [0.01, 3], [0.01, 2], [0, 2], [0, 3]]];

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

    api.applyCommands('-erase target=layer1 source=layer2 -o target=layer1 format=topojson no-quantization bbox', topo, function(err, data) {
      var obj = JSON.parse(data);
      // sliver from erase is removed but equally tiny ring is retained
      assert.deepEqual(obj.bbox, [0, 2, 2, 3]);
      done();
    });
  })

})