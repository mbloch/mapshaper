var assert = require('assert'),
    api = require("../"),
    trace = api.trace;


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
      api.convLngLatToSph([0, 90, 180, -180], [90, 90, -90, -90], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [0, 0, 0, 0]);
      coordBuffersEqual(ybuf, [0, 0, 0, 0]);
      coordBuffersEqual(zbuf, [R, R, -R, -R]);
    })

    it("correctly handles coordinates at the equator", function() {
      api.convLngLatToSph([0, 90, 180, -90, -180], [0, 0, 0, 0], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [R, 0, -R, 0, R]);
      coordBuffersEqual(ybuf, [0, R, 0, -R, 0]);
      coordBuffersEqual(zbuf, [0, 0, 0, 0, 0]);
    })
  })

  describe('#protectWorldEdges()', function () {
    it('should set world edges equal to highest threshold in each arc', function () {
      var arcs = [[[178, 179, 180, 180], [30, 31, 32, 33], [Infinity, 6, 4, Infinity]],
                  [[-170, -180, -160, -160], [1, 2, 2, 1], [Infinity, 5, 8, Infinity]],
                  [[2, 3, 3, 2], [90, 90, 89, 88], [Infinity, 1, 4, Infinity]],
                  [[3, 4, 3, 4], [-79, -84, -90, -80], [Infinity, 5, 8, Infinity]]];
      var data = new api.ArcDataset(arcs);
      api.protectWorldEdges(data);
      var actual = api.Utils.pluck(data.toArray2(), 2);
      var expected = [[Infinity, 6, 6, Infinity], [Infinity, 8, 8, Infinity],
          [Infinity, 4, 4, Infinity], [Infinity, 5, 8, Infinity]];
      assert.deepEqual(actual, expected);
    })

    it('should not modify arcs if internal vertices do not reach edge', function() {
      var arcs = [[[178, 179, 179.9, 180], [30, 31, 32, 33], [Infinity, 6, 4, Infinity]],
        [[-180, -179.9, -160, -160], [1, 2, 2, 1], [Infinity, 5, 8, Infinity]],
        [[2, 3, 3, 2], [90, 89.9, 89, 88], [Infinity, 1, 4, Infinity]],
        [[3, 4, 3, 4], [-79, -84, -89.2, -90], [Infinity, 5, 8, Infinity]]];
      var data = new api.ArcDataset(arcs);
      api.protectWorldEdges(data);
      var actual = api.Utils.pluck(data.toArray2(), 2);
      var expected = [[Infinity, 6, 4, Infinity], [Infinity, 5, 8, Infinity],
          [Infinity, 1, 4, Infinity], [Infinity, 5, 8, Infinity]];
      assert.deepEqual(actual, expected);
    })
  })
})
