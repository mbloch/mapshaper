var assert = require('assert'),
    api = require("../");

describe("mapshaper-simplify.js", function() {

  describe("thinArcByInterval()", function() {


  })


  describe("convLngLatToXYZ()", function() {


  })


  describe("stripArc()", function() {
    var a1 = {
      xx: [0, 1],
      yy: [2, 4],
      uu: [Infinity, Infinity]
    };

    var a2 = {
      xx: [0, 1, 8],
      yy: [2, 4, 3],
      uu: [Infinity, 23, Infinity]
    };

    var a3 = {
      xx: [0, 1, 8, 2],
      yy: [2, 4, 3, 0],
      uu: [Infinity, 23, 43, Infinity]
    };

    var a3 = {
      xx: [0, 1, 8, 2, 0],
      yy: [2, 4, 3, 0, 1],
      uu: [Infinity, 23, 43, 14, Infinity]
    };

    /*
    it("should remove all interior points from a n3 arc", function() {

    })

    it("should remove all interior points from a n4 arc", function() {

    })

    it("should remove all interior points from a n5 arc", function() {

    })
    */


  })

})