import assert from 'assert';
import api from '../mapshaper.js';
import {
  getCenterParams,
  getConicParams,
  getAutoFitBBox,
  getUtmParams
} from '../src/crs/mapshaper-projection-params';

describe('mapshaper-projection-params.js', function () {

  describe('expandProjDefn()', function () {
    it('merc uses default params', function () {
      assert.equal(api.internal.expandProjDefn('merc'), '+proj=merc');
    })

    it('proj4 string is unchanged', function() {
      var str = '+proj=aea +lon_0=-96 +lat_0=37.5 +lat_1=29.5 +lat_2=45.5 +ellps=WGS84';
      assert.equal(api.internal.expandProjDefn(str), str);
    });

    it('webmercator alias is unchanged', function() {
      assert.equal(api.internal.expandProjDefn('webmercator'), 'webmercator');
    })

    it('fits params to target layers when provided', function() {
      var layerA = {
        geometry_type: 'point',
        shapes: [
          [[-170, 10]],
          [[-160, 20]]
        ]
      };
      var layerB = {
        geometry_type: 'point',
        shapes: [
          [[100, 40]],
          [[110, 50]]
        ]
      };
      var dataset = {
        layers: [layerA, layerB],
        info: {crs_string: 'wgs84'}
      };
      var str = api.internal.expandProjDefn('tmerc', dataset, [layerA]);
      assert.equal(str, '+proj=tmerc +lon_0=-165.00 +lat_0=15.00');
    });

    it('fits UTM zone to target layers when provided', function() {
      var layerA = {
        geometry_type: 'point',
        shapes: [
          [[103, 20]],
          [[106, 30]]
        ]
      };
      var layerB = {
        geometry_type: 'point',
        shapes: [
          [[-80, -30]],
          [[-70, -20]]
        ]
      };
      var dataset = {
        layers: [layerA, layerB],
        info: {crs_string: 'wgs84'}
      };
      var str = api.internal.expandProjDefn('utm', dataset, [layerA]);
      assert.equal(str, '+proj=utm +zone=48');
    });

    it('fits params from wrapped bbox when data spans the antimeridian', function() {
      var layer = {
        geometry_type: 'point',
        shapes: [
          [[165, -47]],
          [[178, -34]],
          [[-177, -40]]
        ]
      };
      var dataset = {
        layers: [layer],
        info: {crs_string: 'wgs84'}
      };
      assert.deepEqual(getAutoFitBBox(dataset), [165, -47, 183, -34]);
      assert.equal(api.internal.expandProjDefn('utm', dataset), '+proj=utm +zone=60 +south');
    });
  })

  it('getConicParams()', function() {
    var bbox=[0, 10, 30, 70];
    var str = getConicParams(bbox, 2);
    assert.equal(str, '+lon_0=15.00 +lat_1=20.00 +lat_2=60.00');
  })

  it('getCenterParams()', function() {
    var bbox=[-60, -40, -30, -10];
    var str = getCenterParams(bbox, 1);
    assert.equal(str, '+lon_0=-45.0 +lat_0=-25.0');
  })

  it('getUtmParams()', function() {
    assert.equal(getUtmParams([102, 20, 108, 30]), '+zone=48');
    assert.equal(getUtmParams([-78, -30, -72, -20]), '+zone=18 +south');
    assert.equal(getUtmParams([179, 0, 181, 10]), '+zone=60');
  })
})

