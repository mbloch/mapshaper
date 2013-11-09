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

})
