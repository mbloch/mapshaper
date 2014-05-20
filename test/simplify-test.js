var assert = require('assert'),
    api = require("../"),
    utils = api.utils;


function coordBuffersEqual(a, b) {
  var precision = 1e-9,
      bufLen = a.length;
  assert.equal(bufLen, b.length, "buffers should have same length");
  for (var i=0; i<bufLen; i++) {
    var c1 = a[i],
        c2 = b[i];
    if (Math.abs(c1 - c2) > precision) {
      assert.equal(c1, c2);
    }
  }
  return true;
}

describe("mapshaper-simplify.js", function() {

  describe("convLngLatToSph()", function() {
    var xbuf, ybuf, zbuf,
      R = 6378137;

    beforeEach(function() {
      xbuf = [];
      ybuf = [];
      zbuf = [];
    });

    it("correctly handles coordinates at the poles", function() {
      api.internal.convLngLatToSph([0, 90, 180, -180], [90, 90, -90, -90], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [0, 0, 0, 0]);
      coordBuffersEqual(ybuf, [0, 0, 0, 0]);
      coordBuffersEqual(zbuf, [R, R, -R, -R]);
    })

    it("correctly handles coordinates at the equator", function() {
      api.internal.convLngLatToSph([0, 90, 180, -90, -180], [0, 0, 0, 0], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [R, 0, -R, 0, R]);
      coordBuffersEqual(ybuf, [0, R, 0, -R, 0]);
      coordBuffersEqual(zbuf, [0, 0, 0, 0, 0]);
    })
  })

  describe('#protectWorldEdges()', function () {
    it('should set world edges equal to highest threshold in each arc', function () {
      var arcs = [[[178, 30], [179, 31], [180, 32], [180, 33]],
          [[-170, 1], [-180, 2], [-160, 2], [-160, 1]],
          [[2, 90], [3, 90], [3, 89], [2, 88]],
          [[3, -79], [4, -84], [3, -90], [4, -80]]];
      var thresholds = [[Infinity, 6, 4, Infinity], [Infinity, 5, 8, Infinity],
        [Infinity, 1, 4, Infinity], [Infinity, 5, 8, Infinity]];
      var data = new api.internal.ArcCollection(arcs).setThresholds(thresholds);
      api.internal.protectWorldEdges(data);

      var expected = [Infinity, 6, 6, Infinity, Infinity, 8, 8, Infinity, Infinity, 4, 4, Infinity, Infinity, 5, 8, Infinity];
      assert.deepEqual(utils.toArray(data.getVertexData().zz), expected);
    })

    it('should not modify arcs if internal vertices do not reach edge', function() {
      var arcs = [[[178, 30], [179, 31], [179.9, 32], [180, 33]],
          [[-180, 1], [-179.0, 2], [-160, 2], [-160, 1]],
          [[2, 90], [3, 89.9], [3, 89], [2, 88]],
          [[3, -79], [4, -84], [3, -89.2], [4, -90]]];
      var thresholds = [[Infinity, 6, 4, Infinity], [Infinity, 5, 8, Infinity],
        [Infinity, 1, 4, Infinity], [Infinity, 5, 8, Infinity]];
      var data = new api.internal.ArcCollection(arcs).setThresholds(thresholds);
      api.internal.protectWorldEdges(data);
      var expected = [Infinity, 6, 4, Infinity, Infinity, 5, 8, Infinity, Infinity, 1, 4, Infinity, Infinity, 5, 8, Infinity];
      assert.deepEqual(utils.toArray(data.getVertexData().zz), expected);
    })
  })
})
