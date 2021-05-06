import { getConicParams, getCenterParams, expandProjDefn } from '../src/crs/mapshaper-projection-params'
import assert from 'assert';

describe('mapshaper-projection-params.js', function () {

  describe('expandProjDefn()', function () {
    it('merc uses default params', function () {
      assert.equal(expandProjDefn('merc'), '+proj=merc');
    })

    it('proj4 string is unchanged', function() {
      var str = '+proj=aea +lon_0=-96 +lat_0=37.5 +lat_1=29.5 +lat_2=45.5 +ellps=WGS84';
      assert.equal(expandProjDefn(str), str);
    });

    it('webmercator alias is unchanged', function() {
      assert.equal(expandProjDefn('webmercator'), 'webmercator');
    })

  })

  it('getConicParams()', function() {
    var bbox=[0, 10, 30, 50];
    var str = getConicParams(bbox, 2);
    assert.equal(str, '+lon_0=15.00 +lat_1=20.00 +lat_2=40.00');
  })

  it('getCenterParams()', function() {
    var bbox=[-60, -40, -30, -10];
    var str = getCenterParams(bbox, 1);
    assert.equal(str, '+lon_0=-45.0 +lat_0=-25.0');
  })
})

