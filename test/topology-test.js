var assert = require('assert'),
    api = require("../"),
    ArcEngine = api.topology.ArcEngine,
    utils = api.Utils,
    trace = api.trace;

describe("mapshaper-topology.js", function() {

  describe('congruent rings', function () {
    it('hole-around-island, aligned', function () {
      var yy = [1, 3, 1, 1, 1, 1, 3, 1],
          xx = [1, 2, 3, 1, 1, 3, 2, 1],
          pathData = [{isHole: false, size: 4}, {isHole: true, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0],[-1]]);
      assert.deepEqual(out.arcs, [[[1, 2, 3, 1], [1, 3, 1, 1]]])
    })

    it('hole-around-island, misaligned', function () {
      var yy = [1, 3, 1, 1, 1, 3, 1, 1],
          xx = [1, 2, 3, 1, 3, 2, 1, 3],
          pathData = [{isHole: false, size: 4}, {isHole: true, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0],[-1]]);
      assert.deepEqual(out.arcs, [[[1, 2, 3, 1], [1, 3, 1, 1]]])
    })

    it('duplicate islands, aligned', function () {
      var yy = [1, 3, 1, 1, 1, 3, 1, 1],
          xx = [1, 2, 3, 1, 1, 2, 3, 1],
          pathData = [{isHole: false, size: 4}, {isHole: false, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0], [0]]);
    })

    it('duplicate islands, misaligned', function () {
      var yy = [1, 3, 1, 1, 1, 1, 3, 1],
          xx = [1, 2, 3, 1, 3, 1, 2, 3],
          pathData = [{isHole: false, size: 4}, {isHole: false, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0], [0]]);
    })

    it('three duplicate islands, aligned', function () {
      var yy = [1, 3, 1, 1, 1, 3, 1, 1, 1, 3, 1, 1],
          xx = [1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1],
          pathData = [{isHole: false, size: 4}, {isHole: false, size: 4}, {isHole: false, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0], [0], [0]]);
    })

    it('three duplicate islands, misaligned', function () {
      var yy = [1, 3, 1, 1, 1, 1, 3, 1, 3, 1, 1, 3],
          xx = [1, 2, 3, 1, 3, 1, 2, 3, 2, 3, 1, 2],
          pathData = [{isHole: false, size: 4}, {isHole: false, size: 4}, {isHole: false, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0], [0], [0]]);
    })

    it('two duplicate islands and a hole, misaligned', function () {
      var yy = [1, 3, 1, 1, 1, 1, 3, 1, 3, 1, 1, 3],
          xx = [1, 2, 3, 1, 3, 1, 2, 3, 2, 1, 3, 2],
          pathData = [{isHole: false, size: 4}, {isHole: false, size: 4}, {isHole: true, size: 4}];

      var out = new ArcEngine(xx, yy, pathData).buildTopology();
      assert.deepEqual(out.paths, [[0], [0], [-1]]);
    })

  })

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


    var e1 = {
      yy:       [1, 1, 3, 1, 1, 3, 3, 2],
      xx:       [3, 1, 2, 3, 3, 2, 4, 3], // second ring not closed
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