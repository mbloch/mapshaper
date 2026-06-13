import assert from 'assert';
import { importGeoJSON } from '../src/geojson/geojson-import';
import { makeShapeBufferGeoJSON } from '../src/buffer/mapshaper-polyline-buffer';
import { bearingDegrees2D } from '../src/geom/mapshaper-geodesic';

describe('mapshaper-path-buffer-v4.js', function () {
  describe('makeShapeBufferGeoJSON()', function () {
    it('aligns round cap vertices for polylines with a shared endpoint', function () {
      var endpoint = [10000, 10000];
      var dataset = importGeoJSON({
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: makeLineEndingAt(endpoint, 70)
        }, {
          type: 'LineString',
          coordinates: makeLineEndingAt(endpoint, 30)
        }]
      }, {});
      var geojson = makeShapeBufferGeoJSON(dataset.layers[0], dataset, {
        radius: '10',
        debug_offset: true,
        left: true,
        cap_style: 'round',
        quad_segs: 4
      });
      var bearings1 = getEndpointCapBearings(geojson.features[0], endpoint, 10);
      var bearings2 = getEndpointCapBearings(geojson.features[1], endpoint, 10);

      assert.deepEqual(bearings1, [-20, 0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 160]);
      assert.deepEqual(bearings2, [-60, -45, -22.5, 0, 22.5, 45, 67.5, 90, 112.5, 120]);
    });

    it('does not add a spike after starting a new offset ring', function () {
      var dataset = importGeoJSON({
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [
            [3699629.1081154733, 6505676.67403147],
            [3758272.1245864714, 6492086.724881566],
            [3813399.4602553304, 6454254.239618624],
            [3842078.1373185436, 6391717.450669014],
            [3847776.098486666, 6317643.955483418],
            [3824984.2538141753, 6254966.382634066],
            [3779400.5644691926, 6209382.693289084],
            [3717196.8548724195, 6194831.483529876],
            [3653422.094000603, 6207802.621334313],
            [3597065.807089263, 6232174.537961575],
            [3571271.5545724994, 6268334.597755021],
            [3553976.704166583, 6320219.14897277],
            [3550733.9197154734, 6373184.62834089],
            [3562624.129369541, 6414259.898054942]
          ]
        }]
      }, {});
      var lyr = dataset.layers[0];
      var geojson = makeShapeBufferGeoJSON(lyr, dataset, {
        radius: '110000',
        debug_offset: true,
        right: true,
        cap_style: 'flat'
      });
      var ring = geojson.features[0].geometry.coordinates[1][0];
      var spikeVertex = [3697084.7812920148, 6308765.831160925];

      assert.equal(hasPoint(ring, spikeVertex), false);
    });
  });
});

function makeLineEndingAt(endpoint, bearing) {
  var len = 100;
  var rad = bearing * Math.PI / 180;
  return [
    [endpoint[0] - Math.sin(rad) * len, endpoint[1] - Math.cos(rad) * len],
    endpoint
  ];
}

function getEndpointCapBearings(feature, center, radius) {
  var ring = feature.geometry.coordinates[0][0];
  return ring.filter(function(p) {
    return Math.abs(distance(p, center) - radius) < 1e-8;
  }).map(function(p) {
    return roundAngle(bearingDegrees2D(center[0], center[1], p[0], p[1]));
  });
}

function distance(a, b) {
  var dx = a[0] - b[0];
  var dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function roundAngle(angle) {
  var rounded = Math.round(angle * 1e8) / 1e8;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function hasPoint(ring, target) {
  return ring.some(function(p) {
    return Math.abs(p[0] - target[0]) < 1e-8 &&
      Math.abs(p[1] - target[1]) < 1e-8;
  });
}
