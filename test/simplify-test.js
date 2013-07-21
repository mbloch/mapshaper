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
  describe("thinArcByInterval()", function() {

    it("removes interior vertices with threshold <= [u]", function() {
      var n5 = {
        xx: [0, 1, 8, 2, 0],
        yy: [2, 4, 3, 0, 1],
        uu: [Infinity, 23, 43, 14, Infinity]
      };

      assert.deepEqual(thinArcByInterval(n5.xx, n5.yy, n5.uu, 0),
        [[0, 2], [1, 4], [8, 3], [2, 0], [0, 1]]);
      assert.deepEqual(thinArcByInterval(n5.xx, n5.yy, n5.uu, 14),
        [[0, 2], [1, 4], [8, 3], [0, 1]]);
      assert.deepEqual(thinArcByInterval(n5.xx, n5.yy, n5.uu, 25),
        [[0, 2], [8, 3], [0, 1]]);
      assert.deepEqual(thinArcByInterval(n5.xx, n5.yy, n5.uu, 45),
        [[0, 2], [0, 1]]);
    })


  })

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

  describe("#lockMaxThresholds()", function() {
    var uu2, uu3, uu5;

    beforeEach(function() {
      uu2 = [Infinity, Infinity];
      uu3 = [Infinity, 23, Infinity];
      uu5 = [Infinity, 23, 43, 14, Infinity];
    })


    it("should not modify an n2 arc", function() {
      var orig = uu2.concat();
      api.lockMaxThresholds(uu2, 0)
      assert.deepEqual(uu2, orig);
      api.lockMaxThresholds(uu2, 1);
      assert.deepEqual(uu2, orig);
      api.lockMaxThresholds(uu2, 2);
      assert.deepEqual(uu2, orig);
    })

    it("should lock the max point if n == 1", function() {
      api.lockMaxThresholds(uu5, 1);
      assert.deepEqual(uu5, [Infinity, 23, Infinity, 14, Infinity]);
    })

    it("should lock the max 2 points from an arc if n == 2", function() {
      api.lockMaxThresholds(uu5, 2);
      assert.deepEqual(uu5, [Infinity, Infinity, Infinity, 14, Infinity]);
    })

    it("should lock all points if n >= [no. interior points]", function() {
      api.lockMaxThresholds(uu5, 3);
      assert.deepEqual(uu5, [Infinity, Infinity, Infinity, Infinity, Infinity]);
    })
  })

})


// Replacement for defunct api function.
// TODO: rework api to be simpler to use and to test?
//
function thinArcByInterval(xx, yy, zz, interval) {
  var arcs = new api.ArcDataset([[xx, yy]]).setThresholds([zz]).setRetainedInterval(interval);
  var exporter = new api.PathExporter(arcs, false);
  return exporter.exportShapeForGeoJSON([[0]])[0];
}