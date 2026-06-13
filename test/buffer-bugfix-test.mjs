
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-buffer.js', function () {

  describe('k_bugfix.json', function () {
    var file = 'test/data/features/buffer/k_bugfix.json';
    it('-buffer creates a simple polygon', async function () {
      // An artifact is also present with "-buffer 1km". Adding "right debug-offset" isolates the
      // problem to the right-side half-buffer before the shape is dissolved
      var out = await api.applyCommands(`-i ${file} -buffer 1km right debug-offset cap-style=flat -o buffer.json`);
      var geojson = JSON.parse(out['buffer.json']);
      assert.equal(geojson.geometries[0].type, 'Polygon');
    });

  })

  describe('high-latitude shallow convex join', function () {
    it('-buffer creates a simple polygon', async function () {
      var line = {
        type: 'LineString',
        coordinates: [
          [-89.63824571063742, 81.97945692206268],
          [-89.79586110431967, 81.95642349660133],
          [-89.79586706380448, 81.95642262480064]
        ]
      };
      var out = await api.applyCommands('-i line.json -buffer 1km right debug-offset cap-style=flat -o buffer.json', {
        'line.json': line
      });
      var geojson = JSON.parse(out['buffer.json']);
      assert.equal(geojson.geometries[0].type, 'Polygon');
    });
  })

  describe('lat-long antimeridian and polar cases', function () {
    it('-buffer splits antimeridian-crossing polygons', async function () {
      var line = {
        type: 'LineString',
        coordinates: [[179.95, 0], [179.95, 1]]
      };
      var out = await api.applyCommands('-i line.json -buffer 20km cap-style=flat -o buffer.json', {
        'line.json': line
      });
      var geojson = JSON.parse(out['buffer.json']);
      var geom = geojson.geometries[0];

      assert.equal(geom.type, 'MultiPolygon');
      assert.equal(geom.coordinates.length, 2);
      assertNoAntimeridianCrosses(geom);
    });

    it('-buffer splits antimeridian-crossing point buffers', async function () {
      var point = {
        type: 'Point',
        coordinates: [179.95, 0.5]
      };
      var out = await api.applyCommands('-i point.json -buffer 20km -o buffer.json', {
        'point.json': point
      });
      var geojson = JSON.parse(out['buffer.json']);
      var geom = geojson.geometries[0];

      assert.equal(geom.type, 'MultiPolygon');
      assert.equal(geom.coordinates.length, 2);
      assertNoAntimeridianCrosses(geom);
    });

    it('-buffer splits westward antimeridian-crossing point buffers', async function () {
      var point = {
        type: 'Point',
        coordinates: [-179.95, 0.5]
      };
      var out = await api.applyCommands('-i point.json -buffer 20km -o buffer.json', {
        'point.json': point
      });
      var geojson = JSON.parse(out['buffer.json']);
      var geom = geojson.geometries[0];

      assert.equal(geom.type, 'MultiPolygon');
      assert.equal(geom.coordinates.length, 2);
      assertNoAntimeridianCrosses(geom);
    });

    it('-buffer dissolves polygon buffers after antimeridian splitting', async function () {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/q_split_circle.json ' +
        '-buffer 500km -o format=geojson buffer.json'
      );
      var geojson = JSON.parse(out['buffer.json']);
      var geom = geojson.features ? geojson.features[0].geometry : geojson.geometries[0];

      assert.equal(geom.type, 'MultiPolygon');
      assert.equal(geom.coordinates.length, 2);
      assertNoAntimeridianCrosses(geom);
    });

    it('-buffer stops before reaching a pole', async function () {
      var line = {
        type: 'LineString',
        coordinates: [[0, 89.8], [10, 89.8]]
      };

      await assert.rejects(function() {
        return api.applyCommands('-i line.json -buffer 50km cap-style=flat -o buffer.json', {
          'line.json': line
        });
      }, /near the poles is not supported/);
    });
  })

})

function assertNoAntimeridianCrosses(geom) {
  geom.coordinates.forEach(function(poly) {
    poly.forEach(function(ring) {
      ring.forEach(function(p, i) {
        assert.ok(p[0] >= -180 && p[0] <= 180);
        if (i > 0) {
          assert.ok(Math.abs(p[0] - ring[i - 1][0]) <= 180);
        }
      });
    });
  });
}

