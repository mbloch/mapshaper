var assert = require('assert'),
    api = require("../"),
    topojson = api.internal.topojson;

//   Fig. 1
//
//      b --- d
//     / \   /
//    /   \ /
//   a --- c
//
//   cab, bc, bdc
//   0,   1,  2
//
var arcs1 = [[[3, 1], [1, 1], [2, 3]],
    [[2, 3], [3, 1]],
    [[2, 3], [4, 3], [3, 1]]];

function jsonCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

describe('topojson-arc-dissolve.js', function () {
  describe('TopoJSON.dissolveArcs()', function () {

    it('dissolve a ring', function () {
      var topology = {
        type: "Topology",
        arcs: arcs1,
        objects: {
          poly: {
            type: "Polygon",
            arcs: [[0, 2]]
          },
          poly2: {
            type: "Polygon",
            arcs: [[~2, ~0]]
          }
        }
      };

      topojson.dissolveArcs(topology);
      assert.deepEqual(topology.objects.poly.arcs, [[2]]);
      assert.deepEqual(topology.objects.poly2.arcs, [[~2]]);
      assert.deepEqual(topology.arcs,
        [null, [[2, 3], [3, 1]],
        [[3, 1], [1, 1], [2, 3], [4, 3], [3, 1]]]);
    })

    it('no dissolve', function () {
      var topology = {
        type: "Topology",
        arcs: arcs1,
        objects: {
          poly: {
            type: "Polygon",
            arcs: [[0, 2]]
          },
          poly2: {
            type: "Polygon",
            arcs: [[~2, 1]]
          }
        }
      };

      topojson.dissolveArcs(topology);
      assert.deepEqual(topology.objects.poly.arcs, [[0, 2]]);
      assert.deepEqual(topology.objects.poly2.arcs, [[~2, 1]]);
    })

  })


  describe('TopoJSON.forEachPath()', function () {

    var ex1 = {
      type: "Topology",
      arcs: arcs1,
      objects: {
        shapes: {
          type: "GeometryCollection",
          geometries: [{
            type: null
          }, {
            type: "Point",
            coordinates: [2, 3]
          }, {
            type: "LineString",
            arcs: [~1]
          }, {
            type: "MultiLineString",
            arcs: [[0], [2]]
          }, {
            type: "MultiPolygon",
            arcs: [[[0, 2]], [[1, 0]]]
          }, {
            type: "Polygon",
            arcs: [[0, 2], [~0, ~1]]
          }]
        }
      }
    };

    it('hit all the paths', function () {
      var paths = [],
          topology = jsonCopy(ex1);

      topojson.forEachPath(topology.objects.shapes, function(arcs) {
        paths.push(arcs);
      });
      var target = [[~1], [0], [2], [0, 2], [1, 0], [0, 2], [~0, ~1]];

      assert.deepEqual(paths, target);
    })


    it('replace a path', function() {
      var paths = [],
          topology = jsonCopy(ex1);

      topojson.forEachPath(topology.objects.shapes.geometries[2], function(arcs) {
        return [1];
      });
      assert.deepEqual(topology.objects.shapes.geometries[2].arcs, [1]);

      topojson.forEachPath(topology.objects.shapes.geometries[3], function(arcs) {
        return [~1];
      });
      assert.deepEqual(topology.objects.shapes.geometries[3].arcs, [[~1], [~1]]);
    })

    it('replacement is an array', function() {
      assert.throws(function() {
        jsonCopy(topojson).forEachPath(topology.objects.shapes, function(arcs) {
          return null;
        });
      })

      assert.throws(function() {
        jsonCopy(topojson).forEachPath(topology.objects.shapes, function(arcs) {
          return 1;
        });
      })
    })
  })
})
