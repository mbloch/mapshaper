import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var ArcCollection = internal.ArcCollection;

function addIntersectionCuts(layers, arcs) {
  var dataset = {
    layers: layers,
    arcs: arcs
  };
  return api.internal.addIntersectionCuts(dataset);
}

describe('mapshaper-polygon-repair.js', function () {

  describe('removeSpikesInPath()', function () {
    it('test 1', function () {
      var path = [0, ~0];
      internal.removeSpikesInPath(path);
      assert.deepEqual(path, []);
    })

    it('test 2', function () {
      var path = [1, ~1, ~0];
      internal.removeSpikesInPath(path);
      assert.deepEqual(path, [~0]);
    })
  })

  describe('repairSelfIntersections()', function () {

    describe('Fig xx - polygon with self-intersection', function() {
      //
      //  Remove the inner triangle
      //
      //  e --------- f
      //  |           |
      //  |   b - c   |
      //  |   | /     |
      //  |   /       |
      //  | / |       |
      //  d   a ----- g
      //

      it ("CW self-intersection 1", function() {
        var coords = [[[2, 1], [2, 3], [3, 3], [1, 1], [1, 4], [4, 4], [4, 1], [2, 1]]];  // abcdefga
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes)
        var target = [[[0, 2]]];

        assert.deepEqual(lyr.shapes, target);
      })

      it ("CW self-intersection 2", function() {
        var coords = [[[2, 3], [3, 3], [1, 1], [1, 4], [4, 4], [4, 1], [2, 1], [2, 3]]];  // bcdefgab
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes)
        var target = [[[1]]];

        assert.deepEqual(lyr.shapes, target);
      })

      it ("self-intersection 3 (inverted)", function() {
        var coords = [[[2, 3], [3, 3], [1, 1], [1, 4], [4, 4], [4, 1], [2, 1], [2, 3]]];
        coords[0].reverse(); // bagfedcb
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes)
        var target = [[[1]]];

        assert.deepEqual(lyr.shapes, target);
      })
    })

    describe('Fig xx - polygon with self-intersection', function () {
      //
      //  Remove the inverted triangle
      //
      //   a -- b
      //   |    |
      //   e ------ d
      //        | /
      //        c
      //
      it("CCW self-intersection 1", function() {
        var coords = [[[1, 3], [2, 3], [2, 1], [3, 2], [1, 2], [1, 3]]]; // abcdea
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes);
        var target = [[[0, 2]]];
        assert.deepEqual(lyr.shapes, target);
      })

      it("CCW self-intersection 2", function() {
        var coords = [[[2, 1], [3, 2], [1, 2], [1, 3], [2, 3], [2, 1]]];  // cdeabc
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes);
        var target = [[[1]]];

        assert.deepEqual(lyr.shapes, target);
      })
    })

    describe('Fig xx - polygon with two self-intersections', function () {
      return; // TODO: handle this polygon; currently fails in addIntersectionCuts() because area == 0
      //
      //  Remove the triangles
      //
      //        c
      //        | \
      //   a ------ b
      //   |    |
      //   f ------ e
      //        | /
      //        d
      //
      it("two intersections", function() {
        var coords = [[[1, 3], [3, 3], [2, 4], [2, 1], [3, 2], [1, 2], [1, 3]]]; // abcdefa
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes);
        var target = [[[0, 2, 4]]];
        assert.deepEqual(lyr.shapes, target);

      })
    })

    describe('Fig xx - polygon with two self-intersections', function () {
      //
      //  Remove the triangles
      //
      //           c
      //           | \
      //   a --------- b
      //   |       |
      //   f --------- e
      //           | /
      //           d
      //
      it("two intersections", function() {
        var coords = [[[0, 3], [3, 3], [2, 4], [2, 1], [3, 2], [0, 2], [0, 3]]]; // abcdefa
        var lyr = {
          geometry_type: "polygon",
          shapes: [[[0]]]
        };
        var arcs = new ArcCollection(coords);
        var nodes = addIntersectionCuts([lyr], arcs);
        api.internal.repairSelfIntersections(lyr, nodes);
        var target = [[[0, 2, 4]]];
        assert.deepEqual(lyr.shapes, target);
      })
    })

  }) // end repairSelfIntersections()


  describe('cleanShapes()', function () {
    // TODO: tests
  })

})
