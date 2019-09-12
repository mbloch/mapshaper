
var assert = require('assert');
var api = require("..");
var mproj = require("mproj");
var util = require('./helpers.js');

function roundtrip(proj, xy) {
  it (proj, function() {
    var src = api.internal.getCRS('wgs84');
    var dest = api.internal.getCRS(proj);
    var fwd = api.internal.getProjTransform(src, dest);
    var inv = api.internal.getProjTransform(dest, src);
    var xy2 = fwd(xy[0], xy[1]);
    var xy3 = inv(xy2[0], xy2[1]);
    var e = 1e-7;
    util.almostEqual(xy[0], xy3[0], e);
    util.almostEqual(xy[1], xy3[1], e);
  });

}

function invalid(proj) {
  it('invalid: ' + proj, function() {
    assert.throws(function() {
      api.internal.getCRS(proj);
    });
  })
}

describe('mapshaper-projections.js', function() {

  describe('getCRS()', function () {
    invalid('-proj merc +ellps=sphere');
  })


  describe('findProjLibs()', function() {
    it('tests', function() {
      assert.deepEqual(api.internal.findProjLibs('+init=epsg:4300 +init=esri:10099'), ['epsg', 'esri']);
      assert.deepEqual(api.internal.findProjLibs('+proj=merc'), []);
      assert.deepEqual(api.internal.findProjLibs('+init=epsg:4300 +init=dummy:10099 +init=epsg:1000'), ['epsg']);
    });

    it('Works with upper case library names (e.g. EPSG:1000', function() {
      assert.deepEqual(api.internal.findProjLibs('+init=EPSG:4300 +init=ESRI:10099'), ['epsg', 'esri']);
    })
  });

  describe('looksLikeProj4String()', function() {
    [
      '+init=EPSG:4236',
      '+proj=utm +zone=11 +datum=WGS84'
    ].forEach(yes);

    [
      'wgs84',
      'albersusa',
      '+AK.lon_0=-141 albersusa'
    ].forEach(no);

    function yes(str) {
      it(str, function() {
        assert(api.internal.looksLikeProj4String(str));
      });
    }

    function no(str) {
      it(str, function() {
        assert(!api.internal.looksLikeProj4String(str));
      });
    }

  })

  describe('roundtrip tests', function () {
    roundtrip('albersusa', [-96, 40]);
    roundtrip('+proj=robin', [10, 0]);
    roundtrip('robin', [10, 0]);
    roundtrip('+proj=lcc +lon_0=-96 +lat_1=33 +lat_2=45 +lat_0=39', [-96, 40]);
    roundtrip('+proj=lcc +lon_0=-96 +lat_1=33 +lat_2=45 +lat_0=39 +ellps=sphere',
       [-96, 40]);
    roundtrip('webmercator', [-70, 20]);
    roundtrip('merc', [-70, 20]);
    roundtrip('etmerc', [10, -80]);
    roundtrip('+proj=tmerc +units=ft', [2, 3]);
    roundtrip('+proj=utm +zone=34 +south', [18.423889, -33.925278]);
  })

  describe('test aliases', function () {
    it('webmercator', function () {
      var a = api.internal.getCRS('webmercator');
      var b = api.internal.getCRS('+proj=merc +a=6378137');
      var lp = {lam: 0.3, phi: 0.2};
      assert.deepEqual(mproj.pj_fwd(lp, a), mproj.pj_fwd(lp, b));
    })
  })

});
