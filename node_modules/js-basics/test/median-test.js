var api = require("../"),
  assert = require("assert");

var trace = api.trace,
  Utils = api.Utils;

describe("median.js", function() {
  describe("findValueByRank()", function() {

    var a1 = [3, 8, 1],
        a2 = [3, 2],
        a3 = [3];

    it("finds median of n1 array", function() {
      assert.equal(Utils.findValueByRank(a3, 1), 3);
    })

    it("finds median of n2 array", function() {
      assert.equal(Utils.findValueByRank(a2, 1), 2);
    })

    it("finds median of n3 array", function() {
      assert.equal(Utils.findValueByRank(a1, 2), 3);
    })
  })

  describe("findMedian()", function() {

    var a1 = [3, 8, 1],
        a2 = [3, 2],
        a3 = [3];

    it("finds median of n1 array", function() {
      assert.equal(Utils.findMedian(a3), 3);
    })

    it("finds median of n2 array", function() {
      assert.equal(Utils.findMedian(a2), 2.5);
    })

    it("finds median of n3 array", function() {
      assert.equal(Utils.findMedian(a1), 3);
    })
  })

})