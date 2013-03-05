var assert = require('assert'),
    mapshaper = require("../"),
    geom = mapshaper.geom;

describe("mapshaper-geom.js", function() {

  describe("innerAngle()", function() {

    it("returns π if points form a line", function() {
      assert.equal(geom.innerAngle(0, 0, 0, 1, 0, 2), Math.PI);
      assert.equal(geom.innerAngle(-1, 0, 0, 0, 1, 0), Math.PI);
      assert.equal(geom.innerAngle(1, 2, 2, 3, 3, 4), Math.PI);
    })

    it("returns 0 if second segment doubles back", function() {
      assert.equal(geom.innerAngle(0, 0, 0, 1, 0, -2), 0);
      assert.equal(geom.innerAngle(1, 0, 0, -1, 2, 1), 0);
    })

    it("returns π/2 if abc bends right 90deg", function() {
      assert.equal(geom.innerAngle(-1, 0, -1, 2, 3, 2), Math.PI/2);
    })

    it("returns π/2 if abc bends left 90deg", function() {
      assert.equal(geom.innerAngle(1, 0, 1, 1, 0, 1), Math.PI/2);
    })

    it("returns 0 if two adjacent points are the same", function() {
      assert.equal(geom.innerAngle(3, 0, 3, 0, 4, 1), 0);
      assert.equal(geom.innerAngle(3, 1, 2, 0, 2, 0), 0);
    })

    it("returns 0 if all points are the same", function() {
      assert.equal(geom.innerAngle(0, -1, 0, -1, 0, -1), 0);
    })

  })

/*
  describe("triangleArea()", function() {

    it("returns correct area if points form a CW triangle", function() {

    })

    it("returns correct area if points form a CCW triangle", function() {

    })

    it("returns 0 if triangle has collapsed", function() {

    })

  })


  describe("msRingArea()", function() {

    it("returns 0 if shape has collapsed", function() {
     
    })

    it("returns 0 if shape is not closed", function() {
     
    })

    it("returns correct area for simple shapes", function() {
     
    })

  })


  describe("msRingDirection()", function() {

    it("returns 1 if shape is CW", function() {
     
    })

    it("returns -1 if shape is CCW", function() {
     
    })

    it("returns 0 if shape has collapsed", function() {
     
    })

    it("returns 0 if shape is not a ring", function() {
     
    })

  })*/

})
