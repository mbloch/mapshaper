import assert from 'assert';
import api from '../mapshaper.js';

var geom = api.geom;

function equalAngles(a, b) {
  if (Math.abs(a - b) < 1e-10) {
    assert(true);
  } else {
    assert.equal(a, b);
  }
}

function aboutEqual(a, b) {
  var d = Math.abs(a - b);
  if (isNaN(d) || d > 1e-12) {
    assert.equal(a, b);
  }
}

function equalBearings(a, b) {
  equalAngles(geom.standardAngle(a), geom.standardAngle(b));
}

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

describe("mapshaper-geom.js", function() {

  describe('findClosestPointOnSeg()', function () {
    it('test 1', function () {
      assert.deepEqual(geom.findClosestPointOnSeg(0, 0, 0, 2, 2, 0), [1, 1]);
      assert.deepEqual(geom.findClosestPointOnSeg(0, 0, 0, -2, -2, 0), [-1, -1]);
      assert.deepEqual(geom.findClosestPointOnSeg(3, 0, 0, 2, 2, 0), [2, 0]);
      assert.deepEqual(geom.findClosestPointOnSeg(-2, 0, 0, 2, 2, 0), [0, 2]);
      assert.deepEqual(geom.findClosestPointOnSeg(0, 0, 0, 2, 0, 2), [0, 2]); // 0 len
      assert.deepEqual(geom.findClosestPointOnSeg(2, 0, 0, 2, 2, 0), [2, 0]); // coincident pt
    })
  })

  describe('pointSegDistSq()', function () {
    it('Perpendicular dist. to vertical line', function () {
      assert.equal(geom.pointSegDistSq(0, 0, 2, -1, 2, 3), 4);
      assert.equal(geom.pointSegDistSq(1, 0, 0, 3, 2, 3), 9);
    })
    it('Perpendicular dist. to horiz. line', function () {
      assert.equal(geom.pointSegDistSq(1, 1, -3, 0, -3, 3), 16);
    })
    it('Perpendicular dist. to sloping line', function () {
      assert.equal(geom.pointSegDistSq(1, 1, 3, 1, 1, 3), 2);
    })
    it('Shortest distance is an endpoint', function () {
      assert.equal(geom.pointSegDistSq(0, 0, 2, 6, 2, 2), 8);
    })
  })

  describe('pointSegDistSq3D()', function () {
    it('Perpendicular dist. to sloping line', function () {
      assert.equal(geom.pointSegDistSq3D(1, 1, 1, 3, 1, 2, 1, 3, 2), 3);
    })
  })

  // degrees to meters in equirectangular projection
  describe('degreesToMeters()', function () {
    var d2r = Math.PI / 180;
    it('360 deg', function () {
      aboutEqual(geom.degreesToMeters(360), 360 * d2r * 6378137);
    });

    it('1 deg', function () {
      aboutEqual(geom.degreesToMeters(1), d2r * 6378137);
    });
  })

  describe('standardAngle()', function() {
    it('wraps', function() {
      equalAngles(geom.standardAngle(-Math.PI), Math.PI);
      equalAngles(geom.standardAngle(-3 * Math.PI), Math.PI);
      equalAngles(geom.standardAngle(3 * Math.PI), Math.PI);
      equalAngles(geom.standardAngle(2 * Math.PI), 0);
      equalAngles(geom.standardAngle(4 * Math.PI), 0);
    })
  })

  describe('bearing()', function () {
    it('bearing to north pole is 0', function () {
      equalBearings(geom.bearing(90, 0, 90, 90), 0)
      equalBearings(geom.bearing(90, 70, 20, 90), 0)
    })

    it('bearing to s pole is PI', function () {
      equalBearings(geom.bearing(90, 0, 90, -90), Math.PI)
      equalBearings(geom.bearing(90, 70, 20, -90), Math.PI)
    })
  })

  describe('sphericalDistance()', function () {
    var PI = Math.PI,
        halfPI = PI / 2;
    it('antipodal distance is PI', function () {
      aboutEqual(geom.sphericalDistance(0, PI/2, 0, -PI/2), PI);
      aboutEqual(geom.sphericalDistance(-PI, PI/2, PI, -PI/2), PI);
      aboutEqual(geom.sphericalDistance(-PI, 0, 0, 0), PI);
      aboutEqual(geom.sphericalDistance(0, 0, PI, 0), PI);
      aboutEqual(geom.sphericalDistance(0, 0, -PI, 0), PI);
      aboutEqual(geom.sphericalDistance(PI/2, PI/4, -PI/2, -PI/4), PI);
    })

    it('quarter arc distance is half PI', function() {
        aboutEqual(geom.sphericalDistance(0, PI/2, 0, 0), halfPI);
        aboutEqual(geom.sphericalDistance(0, 0, PI/2, 0), halfPI);
    })
  })

  describe('signedAngleSph()', function () {
    it('bend at equator', function () {
      equalAngles(geom.signedAngleSph(0, 0, 90, 0, 180, 0), geom.signedAngle(0, 0, 90, 0, 180, 0));
      equalAngles(geom.signedAngleSph(0, 0, -90, 0, -180, 0), geom.signedAngle(0, 0, -90, 0, -180, 0));
      equalAngles(geom.signedAngleSph(10, 0, 90, 0, 90, 10), geom.signedAngle(10, 0, 90, 0, 90, 10));
      equalAngles(geom.signedAngleSph(90, -10, 90, 0, 10, 0), geom.signedAngle(90, -10, 90, 0, 10, 0));
      equalAngles(geom.signedAngleSph(10, 0, 90, 0, 90, -10), geom.signedAngle(10, 0, 90, 0, 90, -10));
      equalAngles(geom.signedAngleSph(90, -10, 90, 0, 110, 0), geom.signedAngle(90, -10, 90, 0, 110, 0));
    });

    it('bend at north pole', function() {
      equalAngles(geom.signedAngleSph(0, 0, 0, 90, 90, 0), Math.PI/2); // right bend
      equalAngles(geom.signedAngleSph(0, 0, 0, 90, -90, 0), 1.5 * Math.PI); // left bend
    });

  });

  describe('signedAngle()', function () {
    it("45 deg", function() {
      assert.equal(geom.signedAngle(1, 0, 0, 0, 2, 2), Math.PI / 4);
    })

    it("135 deg", function() {
      assert.equal(geom.signedAngle(1, 0, 0, 0, -2, 2), 3 * Math.PI / 4);
    })

    it("225 deg", function() {
      assert.equal(geom.signedAngle(1, 0, 0, 0, -2, -2), 5 * Math.PI / 4);
    })

    it("315 deg", function() {
      assert.equal(geom.signedAngle(1, 0, 0, 0, 2, -2), 7 * Math.PI / 4);
    })

    it("returns π if points form a line", function() {
      assert.equal(geom.signedAngle(0, 0, 0, 1, 0, 2), Math.PI);
      assert.equal(geom.signedAngle(-1, 0, 0, 0, 1, 0), Math.PI);
      assert.equal(geom.signedAngle(1, 2, 2, 3, 3, 4), Math.PI);
    })

    it("returns 0 if second segment doubles back", function() {
      assert.equal(geom.signedAngle(0, 0, 0, 1, 0, -2), 0);
      assert.equal(geom.signedAngle(1, 0, 0, -1, 2, 1), 0);
    })

    it("returns π/2 if abc bends right 90deg", function() {
      assert.equal(geom.signedAngle(-1, 0, -1, 2, 3, 2), Math.PI/2);
    })

    it("returns 3π/2 if abc bends left 90deg", function() {
      assert.equal(geom.signedAngle(1, 0, 1, 1, 0, 1), 3 * Math.PI/2);
    })

    it("returns NaN if two adjacent points are the same", function() {
      assert.ok(isNaN(geom.signedAngle(3, 0, 3, 0, 4, 1)));
      assert.ok(isNaN(geom.signedAngle(3, 1, 2, 0, 2, 0)));
    })

    it("returns NaN if all points are the same", function() {
      assert.ok(isNaN(geom.signedAngle(0, -1, 0, -1, 0, -1)));
    })

    it("returns NaN if one or more args are NaN", function() {
      assert.ok(isNaN(geom.signedAngle(0, -1, 0, -1, 0)));
      assert.ok(isNaN(geom.signedAngle()));
      // null gets coerced to zero... need to check for null if NaN is important here
      // assert.ok(isNaN(geom.signedAngle(0, -1, null, -1, 0, -1)));
    })

  })

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


  describe("triangleArea()", function() {

    it("returns correct area if points form a CW triangle", function() {
      assert.equal(geom.triangleArea(1, 3, 4, 1, 1, 1), 3);
    })

    it("returns correct area if points form a CCW triangle", function() {
      assert.equal(geom.triangleArea(1, 1, 4, 1, 1, 3), 3);
    })

    it("returns 0 if triangle has collapsed", function() {
      assert.equal(geom.triangleArea(1, 1, 1, 1, 2, 3), 0)
      assert.equal(geom.triangleArea(1, 1, 2, 3, 1, 1), 0)
      assert.equal(geom.triangleArea(2, 3, 1, 1, 1, 1), 0)
      assert.equal(geom.triangleArea(1, 1, 1, 1, 1, 1), 0)
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
      api.geom.convLngLatToSph([0, 90, 180, -180], [90, 90, -90, -90], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [0, 0, 0, 0]);
      coordBuffersEqual(ybuf, [0, 0, 0, 0]);
      coordBuffersEqual(zbuf, [R, R, -R, -R]);
    })

    it("correctly handles coordinates at the equator", function() {
      api.geom.convLngLatToSph([0, 90, 180, -90, -180], [0, 0, 0, 0], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [R, 0, -R, 0, R]);
      coordBuffersEqual(ybuf, [0, R, 0, -R, 0]);
      coordBuffersEqual(zbuf, [0, 0, 0, 0, 0]);
    })
  })

  describe('latLngToXYZ()/xyzToLngLat()', function () {
    function test(lng, lat) {
      var p = [], p2 = [];
      geom.lngLatToXYZ(lng, lat, p);
      geom.xyzToLngLat(p[0], p[1], p[2], p2);
      aboutEqual(p2[0], lng);
      aboutEqual(p2[1], lat);
      // console.log(p2[0], lng, p2[1], lat, p);
    }

    it('roundtrip tests', function () {
      test(0, 0);
      test(0, 70);
      test(0, -70);
      test(179, -89);
      test(-179, 89);
      test(90, 45);
    })
  })

})
