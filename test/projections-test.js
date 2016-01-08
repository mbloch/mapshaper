
var assert = require('assert');
var api = require("..");
var getProjection = api.internal.getProjection;

function roundtripTest(proj, lng, lat) {
  var xy = proj.projectLatLng(lat, lng);
  var ll = proj.unprojectXY(xy.x, xy.y);
  var e = 1e-7; // some inverse formulas not very accurate
  // console.log(lng, lat, ll, xy);
  almostEqual(ll.lat, lat, e);
  almostEqual(ll.lng, lng, e);
}

function almostEqual(a, b, e) {
  e = e || 1e-10;
  if (Math.abs(a - b) < e) {
    assert(true);
  } else {
    assert.equal(a, b)
  }
}

describe('mapshaper-projections.js', function() {

  describe('getProjection()', function () {
    it('projection opts are not modified', function () {
      var opts = {lng0:-96, lat1:33, lat2:45, lat0:39, spherical: true};
      var copy = api.utils.extend({}, opts);
      var proj = getProjection('lambertcc', opts);
      assert.deepEqual(opts, copy);
    })
  })

  describe('albersusa', function () {
    it ('projects/unprojects', function() {
      var proj = getProjection('albersusa');
      roundtripTest(proj, -96, 40);
      roundtripTest(proj, -70, 20);
    });
  })

  describe('robinson', function() {
    it ("projects a point without throwing an error", function() {
      var proj = getProjection('robinson');
      var xy = proj.projectLatLng(10, 10);
      assert(true);
    })
  })

  describe('lambertcc', function () {
    it ('spherical formula projects/unprojects', function() {
      var proj = getProjection('lambertcc', {lng0:-96, lat1:33, lat2:45, lat0:39, spherical: true});
      proj.spherical = true;
      roundtripTest(proj, -96, 40);
      roundtripTest(proj, -70, 20);
    });

    it ('ellipsoidal formula projects/unprojects', function() {
      var proj = getProjection('lambertcc', {lng0:-96, lat1:33, lat2:45, lat0:39});
      roundtripTest(proj, -96, 40);
      roundtripTest(proj, -70, 20);
    });
  })

  describe('mercator', function () {
    it ('spherical formula projects/unprojects', function() {
      var proj = getProjection('webmercator');
      roundtripTest(proj, -96, 40);
      roundtripTest(proj, -70, 20);
    });

    it ('ellipsoidal formula projects/unprojects', function() {
      var proj = getProjection('mercator');
      roundtripTest(proj, -10, 10);
      roundtripTest(proj, -70, 20);
    });
  })

  describe('transversemercator', function () {
    it ('spherical formula projects/unprojects', function() {
      var proj = getProjection('transversemercator', {lat0: 0, lng0: 0, spherical: true});
      roundtripTest(proj, -10, 10);
      roundtripTest(proj, 10, -80);
    });

    it ('ellipsoidal formula projects/unprojects', function() {
      var proj = getProjection('transversemercator', {lat0: 0, lng0: 0});
      roundtripTest(proj, -10, 10);
      roundtripTest(proj, 10, -80);
    });

    it ('accepts units of feet', function() {
      var proj = getProjection('transversemercator', {lat0: 0, lng0: 0}),
          projFeet = getProjection('transversemercator', {lat0: 0, lng0: 0, units: 'feet'}),
          xy = proj.projectLatLng(10, 10),
          xyFeet = projFeet.projectLatLng(10, 10);
      almostEqual(xy.x * 0.3048, xyFeet.x);
      almostEqual(xy.y * 0.3048, xyFeet.y);
    })

    it ('accepts to_meter param', function() {
      var proj = getProjection('transversemercator', {lat0: 0, lng0: 0}),
          projKm = getProjection('transversemercator', {lat0: 0, lng0: 0, to_meter: 1000}),
          xy = proj.projectLatLng(10, 10),
          xyKm = projKm.projectLatLng(10, 10);
      almostEqual(xy.x, xyKm.x * 1000);
      almostEqual(xy.y, xyKm.y * 1000);
    })
  })

  describe('UTM', function () {
    it ('Zone 34S', function() {
      var proj = getProjection('utm', {zone: '34S'});
      roundtripTest(proj, 18.423889, -33.925278);
    });
    it ('Zone 54N', function() {
      var proj = getProjection('utm', {zone: '54N'});
      roundtripTest(proj, 139.68, 35.68);
    });
  })

});
