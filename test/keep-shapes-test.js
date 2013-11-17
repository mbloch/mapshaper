var assert = require('assert'),
    api = require("../"),
    trace = api.trace;

describe("mapshaper-keep-shapes.js", function() {

  describe("#replaceValue()", function() {
    var uu2, uu3, uu5;

    beforeEach(function() {
      uu3 = [Infinity, 23, Infinity];
      uu5 = [Infinity, 23, 43, 43, Infinity];
    })

    it("should replace a single occurence of a value", function() {
      api.replaceValue(uu3, 23, Infinity, 0, 2);
      assert.deepEqual(uu3, [Infinity, Infinity, Infinity]);
    })

    it("should replace multiple occurences of a value", function() {
      api.replaceValue(uu5, 43, Infinity, 0, 4);
      assert.deepEqual(uu5, [Infinity, 23, Infinity, Infinity, Infinity]);
    })
  })


  describe("#protectShape()", function() {
    it("ignores null or empty shape", function() {
      var arcs = new api.ArcDataset([[[0, 0, 1, 0], [0, 1, 1, 0], [Infinity, 1, 1, Infinity]]]);
      assert.equal(api.protectShape(arcs, null), undefined)
      assert.equal(api.protectShape(arcs), undefined)
      assert.equal(api.protectShape(arcs, []), undefined)
      assert.equal(api.protectShape(arcs, [[]]), undefined)
      var data = arcs.getVertexData();
      assert.deepEqual(api.Utils.toArray(data.zz), [Infinity, 1, 1, Infinity])
    })

    it("protects points in a single-part polygon", function() {
      var arcs = new api.ArcDataset([[[0, 0, 1, 1, 0], [0, 1, 1, 0, 0], [Infinity, 1, 2, 1, Infinity]]]);
      assert.equal(api.protectShape(arcs, [[0]]), undefined)
      var data = arcs.getVertexData();
      assert.deepEqual(api.Utils.toArray(data.zz), [Infinity, Infinity, Infinity, Infinity, Infinity])
    })

    it("protects points in a single-part polygon, test2", function() {
      var arcs = new api.ArcDataset([[[0, 0, 1, 1, 0], [0, 1, 1, 0, 0], [Infinity, 2, 1, 2, Infinity]]]);
      assert.equal(api.protectShape(arcs, [[0]]), undefined)
      var data = arcs.getVertexData();
      assert.deepEqual(api.Utils.toArray(data.zz), [Infinity, Infinity, 1, Infinity, Infinity])
    })

    it("protects largest ring in a multi-part polygon", function() {
      var arcs = new api.ArcDataset([[[0, 0, 1, 0], [0, 1, 1, 0], [Infinity, 1, 1, Infinity]],
        [[0, 0, 2, 0], [0, 1, 1, 0], [Infinity, 1, 1, Infinity]]]);
      api.protectShape(arcs, [[0], [1]])
      var data = arcs.getVertexData();
      assert.deepEqual(api.Utils.toArray(data.zz), [Infinity, 1, 1, Infinity, Infinity, Infinity, Infinity, Infinity])
    })

  })

})
