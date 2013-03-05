var assert = require('assert'),
    api = require("../"),
    trace = api.trace;

describe("mapshaper-topology.js", function() {

  describe("buildArcTopology()", function() {

    var d1 = {
      xx:       [3, 1, 2, 3, 2, 4, 3, 2],
      yy:       [1, 1, 3, 1, 3, 3, 1, 3],
      partIds:  [0, 0, 0, 0, 1, 1, 1, 1],
      shapeIds: [0, 1]
    };

    var d2 = {
      xx:       [3, 1, 2, 3, 3, 2, 4, 3],
      yy:       [1, 1, 3, 1, 1, 3, 3, 2],
      partIds:  [0, 0, 0, 0, 1, 1, 1, 1],
      shapeIds: [0, 1]
    };

    var d3 = {
      xx:       [3, 1, 2, 3, 4, 3, 2, 4],
      yy:       [1, 1, 3, 1, 3, 1, 3, 3],
      partIds:  [0, 0, 0, 0, 1, 1, 1, 1],
      shapeIds: [0, 1]
    };


    it("d1 should make three arcs", function() {
      var data = api.buildArcTopology(d1);
      assert.equal(data.arcs.length, 3);
      //trace(data);
    });


    it("d2 should make three arcs", function() {
      var data = api.buildArcTopology(d2);
      assert.equal(data.arcs.length, 3);
      //trace(data);
    });

    it("d3 should make four arcs", function() {
      var data = api.buildArcTopology(d3);
      assert.equal(data.arcs.length, 4);
      //trace(data);
    });

  })

})