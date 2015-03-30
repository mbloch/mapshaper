
var assert = require('assert');
var getProjection = require("..").internal.getProjection;

function roundtripTest(proj, lng, lat) {
  var xy = proj.forward(lng, lat);
  var ll = proj.inverse(xy.x, xy.y);
  var e = 1e-7; // some inverse formulas not very accurate
  // console.log(lng, lat, ll, xy);
  assert(Math.abs(ll.lat - lat) < e);
  assert(Math.abs(ll.lng - lng) < e);
}

describe('mapshaper-projections.js', function() {
  describe('albersusa', function () {
    it ('projects/unprojects', function() {
      var proj = getProjection('albersusa');
      roundtripTest(proj, -96, 40);
      roundtripTest(proj, -70, 20);
    });
  })

  describe('LambertCC', function () {
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

  describe('Mercator', function () {
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

  describe('TransverseMercator', function () {
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
