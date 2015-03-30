
var assert = require('assert');
var getProjection = require("..").internal.getProjection;

function roundtripTest(proj, lng, lat) {
  var xy = proj.forward(lng, lat);
  var ll = proj.inverse(xy.x, xy.y);
  var e = 1e-7; // some inverse formulas not very accurate
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

  describe('LambertUSA', function () {
    it ('spherical formula projects/unprojects', function() {
      var proj = getProjection('lambertusa');
      proj.spherical = true;
      roundtripTest(proj, -96, 40);
      roundtripTest(proj, -70, 20);
    });

    it ('ellipsoidal formula projects/unprojects', function() {
      var proj = getProjection('lambertusa');
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


});
