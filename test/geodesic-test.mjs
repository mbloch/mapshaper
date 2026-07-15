import assert from 'assert';
import api from '../mapshaper.js';
var internal = api.internal;

describe('mapshaper-geodesic.js', function () {
  it('calculates ellipsoidal WGS84 distances', function () {
    var wgs84 = internal.parseCrsString('wgs84');
    var distance = internal.getGeodesicDistanceFunction(wgs84);
    assert.ok(Math.abs(distance(0, 0, 1, 0) - 111319.49079327357) < 1e-6);
    assert.ok(Math.abs(distance(0, 0, 0, 1) - 110574.38855779878) < 1e-6);
  });
})
