import api from '../mapshaper.js';
import assert from 'assert';
import { rhumbDistance } from '../src/commands/mapshaper-densify-command.mjs';

async function densify(geojson, cmd) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.json',
    {'in.json': JSON.stringify(geojson)});
  return JSON.parse(String(out['out.json']));
}

function firstGeom(gj) {
  if (gj.features) return gj.features[0].geometry;
  if (gj.geometries) return gj.geometries[0];
  return gj.geometry || gj;
}

// coordinates of the first (line or first-ring) path in the output
function firstPath(gj) {
  var g = firstGeom(gj);
  if (g.type == 'LineString') return g.coordinates;
  if (g.type == 'Polygon') return g.coordinates[0];
  if (g.type == 'MultiPolygon') return g.coordinates[0][0];
  return g.coordinates;
}

function allFinite(coords) {
  return coords.every(function(p) { return isFinite(p[0]) && isFinite(p[1]); });
}

function feature(geometry, properties) {
  return {type: 'Feature', properties: properties || {}, geometry: geometry};
}

function line(coords) {
  return feature({type: 'LineString', coordinates: coords});
}

describe('mapshaper-densify-command.js', function () {

  describe('interpolation modes', function () {
    it('geodesic is the default for lat-long and adds vertices', async function () {
      var gj = await densify(line([[0, 0], [90, 60]]), '-densify 500km');
      var path = firstPath(gj);
      assert(path.length > 2);
      assert(allFinite(path));
      // endpoints preserved
      assert.deepEqual(path[0], [0, 0]);
      assert.deepEqual(path[path.length - 1], [90, 60]);
    });

    it('rhumb fills a full-longitude parallel edge (antimeridian sweep)', async function () {
      var gj = await densify(line([[-180, -40], [180, -40]]), '-densify 2000km rhumb');
      var path = firstPath(gj);
      assert(path.length > 10);
      assert(allFinite(path));
      // interior vertices stay on the parallel and advance monotonically in lng
      for (var i = 1; i < path.length; i++) {
        assert(Math.abs(path[i][1] - -40) < 1e-9, 'stays at lat -40');
        assert(path[i][0] > path[i - 1][0], 'longitude increases');
      }
    });

    it('planar interpolation of a lat-long line uses decimal degrees', async function () {
      var gj = await densify(line([[0, 0], [30, 0]]), '-densify 10 planar');
      assert.deepEqual(firstPath(gj), [[0, 0], [10, 0], [20, 0], [30, 0]]);
    });

    it('planar interval accepts an explicit degree unit', async function () {
      var gj = await densify(line([[0, 0], [20, 0]]), '-densify 5deg planar');
      assert.deepEqual(firstPath(gj), [[0, 0], [5, 0], [10, 0], [15, 0], [20, 0]]);
    });
  });

  describe('robustness', function () {
    it('rhumb does not emit NaN on a meridian segment that reaches a pole', async function () {
      // regression: isometric latitude is -Infinity at the pole; longitude must
      // stay constant rather than evaluate 0 * Infinity/Infinity = NaN
      var gj = await densify(line([[180, -90], [180, -80]]), '-densify 100km rhumb');
      var path = firstPath(gj);
      assert(path.length > 2);
      assert(allFinite(path));
      path.forEach(function(p) { assert.equal(p[0], 180); });
    });

    it('geodesic leaves a full-longitude edge undivided without error', async function () {
      // a -180 -> 180 edge has zero great-circle length (same point on the globe)
      var rect = feature({type: 'Polygon', coordinates: [[
        [-180, -40], [180, -40], [180, -30], [-180, -30], [-180, -40]]]});
      var gj = await densify(rect, '-densify 500km');
      var ring = firstPath(gj);
      assert(allFinite(ring));
      // the E-W edge from -180 to 180 is preserved as-is (adjacent in the ring)
      assert(ring.some(function(p, i) {
        return i > 0 && ring[i - 1][0] == -180 && p[0] == 180;
      }));
    });

    it('preserves ring closure and attributes', async function () {
      var poly = feature({type: 'Polygon', coordinates: [[
        [0, 0], [40, 0], [40, 20], [0, 20], [0, 0]]]}, {id: 7, name: 'x'});
      var gj = await densify(poly, '-densify 500km rhumb');
      var ring = firstPath(gj);
      assert.deepEqual(ring[0], ring[ring.length - 1]);
      var props = gj.features ? gj.features[0].properties : null;
      assert.deepEqual(props, {id: 7, name: 'x'});
    });

    it('passes point layers through unchanged', async function () {
      var pt = feature({type: 'Point', coordinates: [10, 20]}, {id: 1});
      var gj = await densify(pt, '-densify 100km');
      assert.deepEqual(firstGeom(gj).coordinates, [10, 20]);
    });
  });

  describe('projected data', function () {
    it('planar densification uses coordinate units', async function () {
      var out = await api.applyCommands(
        '-i in.json -proj crs=wgs84 -proj webmercator -densify 200000 planar -o out.json',
        {'in.json': JSON.stringify(line([[0, 0], [10, 0]]))});
      var path = firstPath(JSON.parse(String(out['out.json'])));
      assert(path.length > 2);
      assert(allFinite(path));
    });

    it('rejects geodesic and rhumb on projected data', async function () {
      await assert.rejects(async function() {
        await api.applyCommands(
          '-i in.json -proj crs=wgs84 -proj webmercator -densify 200000 rhumb -o out.json',
          {'in.json': JSON.stringify(line([[0, 0], [10, 0]]))});
      }, /requires a lat-long dataset/);
    });
  });

  describe('option validation', function () {
    it('requires an interval', async function () {
      await assert.rejects(async function() {
        await densify(line([[0, 0], [10, 0]]), '-densify');
      }, /interval/);
    });

    it('rejects distance units for planar lat-long densification', async function () {
      await assert.rejects(async function() {
        await densify(line([[0, 0], [10, 0]]), '-densify 500km planar');
      }, /decimal degrees/);
    });

    it('rejects more than one interpolation mode', async function () {
      await assert.rejects(async function() {
        await densify(line([[0, 0], [10, 0]]), '-densify 100km rhumb planar');
      }, /only one/);
    });
  });

  describe('rhumbDistance()', function () {
    var R = 6378137;
    it('full-longitude sweep at the equator equals the equatorial circumference', function () {
      var d = rhumbDistance([-180, 0], [180, 0]);
      assert(Math.abs(d - 2 * Math.PI * R) / d < 1e-9);
    });

    it('full-longitude sweep at 60N equals half the equatorial circumference', function () {
      // cos(60) = 0.5
      var d = rhumbDistance([-180, 60], [180, 60]);
      assert(Math.abs(d - Math.PI * R) / d < 1e-6);
    });

    it('a pure meridian arc equals the latitude difference times R', function () {
      var d = rhumbDistance([10, 0], [10, 10]);
      assert(Math.abs(d - (10 * Math.PI / 180) * R) / d < 1e-9);
    });
  });
});
