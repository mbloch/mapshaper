
import assert from 'assert';
import api from '../mapshaper.js';
import util from './helpers';
import mproj from 'mproj';

function roundtrip(proj, xy) {
  it (proj, function() {
    var src = api.internal.parseCrsString('wgs84');
    var dest = api.internal.parseCrsString(proj);
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
      api.internal.parseCrsString(proj);
    });
  })
}

describe('mapshaper-projections.js', function() {

  describe('parseCrsString()', function () {
    invalid('-proj merc +ellps=sphere');
  })

  describe('getProjDefn()', function () {
    test('merc', '+proj=merc');
    test('merc +lon_0=60', '+proj=merc +lon_0=60');
    test('wgs84', '+proj=longlat +datum=WGS84');

    function test(src, target) {
      var getProjDefn = api.internal.getProjDefn;
      it(src + ' -> ' + target, function() {
        assert.equal(getProjDefn(src), target);
      })
    }
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
    roundtrip('+proj=geos +h=35785831.0 +lon_0=60 +sweep=y +datum=WGS84', [38.42, 13.92]);
    roundtrip('+proj=geos +h=35785831.0 +lon_0=60 +sweep=x +R=6378137', [38.42, 13.92]);
  })

  describe('test aliases', function () {
    it('webmercator', function () {
      var a = api.internal.parseCrsString('webmercator');
      var b = api.internal.parseCrsString('+proj=merc +a=6378137');
      var lp = {lam: 0.3, phi: 0.2};
      assert.deepEqual(mproj.pj_fwd(lp, a), mproj.pj_fwd(lp, b));
    })
  })

  describe('parseAuthorityCodeString()', function () {
    var fn = api.internal.parseAuthorityCodeString;
    it('parses "epsg:4326"', function () {
      assert.deepEqual(fn('epsg:4326'), {org: 'EPSG', code: 4326});
    });
    it('parses "ESRI:54030" with mixed case', function () {
      assert.deepEqual(fn('ESRI:54030'), {org: 'ESRI', code: 54030});
    });
    it('returns null for proj4 strings, aliases, and junk', function () {
      assert.equal(fn('+proj=longlat +datum=WGS84'), null);
      assert.equal(fn('wgs84'), null);
      assert.equal(fn(''), null);
      assert.equal(fn(null), null);
      assert.equal(fn('epsg:'), null);
      assert.equal(fn('epsg:0'), null);
    });
  });

  describe('parseAuthorityCodeFromWkt()', function () {
    var fn = api.internal.parseAuthorityCodeFromWkt;
    it('extracts the top-level AUTHORITY clause and ignores nested ones', function () {
      var wkt = 'GEOGCS["NAD27",DATUM["North_American_Datum_1927",' +
        'SPHEROID["Clarke 1866",6378206.4,294.9786982139006,AUTHORITY["EPSG","7008"]],' +
        'AUTHORITY["EPSG","6267"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
        'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
        'AUTHORITY["EPSG","4267"]]';
      assert.deepEqual(fn(wkt), {org: 'EPSG', code: 4267});
    });
    it('handles a simple PROJCS root authority', function () {
      var wkt = 'PROJCS["WGS 84 / UTM zone 10N",GEOGCS["WGS 84",AUTHORITY["EPSG","4326"]],' +
        'PROJECTION["Transverse_Mercator"],AUTHORITY["EPSG","32610"]]';
      assert.deepEqual(fn(wkt), {org: 'EPSG', code: 32610});
    });
    it('returns null when there is no top-level AUTHORITY', function () {
      var wkt = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
        'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
        'UNIT["Degree",0.0174532925199433]]';
      assert.equal(fn(wkt), null);
    });
    it('returns null for empty/invalid input', function () {
      assert.equal(fn(''), null);
      assert.equal(fn(null), null);
      assert.equal(fn(undefined), null);
    });
  });

});
