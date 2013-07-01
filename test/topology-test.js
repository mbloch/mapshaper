var assert = require('assert'),
    api = require("../"),
    utils = api.Utils,
    trace = api.trace;

describe("mapshaper-topology.js", function() {

  describe("buildArcTopology()", function() {

    var d1 = {
      yy:       [1, 1, 3, 1, 3, 3, 1, 3],
      xx:       [3, 1, 2, 3, 2, 4, 3, 2],
      pathData: [{shapeId: 0, size: 4}, {shapeId: 1, size: 4}]

    };

    var d2 = {
      yy:       [1, 1, 3, 1, 1, 3, 3, 1],
      xx:       [3, 1, 2, 3, 3, 2, 4, 3],
      pathData: [{shapeId: 0, size: 4}, {shapeId: 1, size: 4}]
    };

    var d3 = {
      yy:       [1, 1, 3, 1, 3, 1, 3, 3],
      xx:       [3, 1, 2, 3, 4, 3, 2, 4],
      pathData: [{shapeId: 0, size: 4}, {shapeId: 1, size: 4}]
    };


    var e2 = {
      yy:       [1, 1, 3, 1, 1, 3, 3, 2],
      xx:       [3, 1, 2, 3, 3, 2, 4, 3],
      pathData: [{shapeId: 0, size: 4}, {shapeId: 1, size: 4}]
    };

    /*
    --    --
   |  |  |  |
   *--x--x--*
   |        |
    --------
    */

    it("d1 should make three arcs", function() {
      var data = api.buildArcTopology(d1);
      assert.equal(data.arcs.length, 3);
      assert.deepEqual(data.arcs, [
        [[3, 1, 2], [1, 1, 3]],
        [[2, 3], [3, 1]],
        [[2, 4, 3], [3, 3, 1]]
        ]);
      assert.deepEqual(data.shapes, [[[0, 1]], [[2, -2]]]);
      assert.deepEqual(utils.toArray(data.sharedArcFlags), [0, 1, 0]);
    });

    it("d2 should make three arcs", function() {
      var data = api.buildArcTopology(d2);
      assert.equal(data.arcs.length, 3);
      //trace(data);
    });

    it("d3 should make three arcs", function() {
      var data = api.buildArcTopology(d3);
      assert.equal(data.arcs.length, 3);
      //trace(data);
    });

  })

})