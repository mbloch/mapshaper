import assert from 'assert';
import api from '../mapshaper.js';
import { projectAndDensifyArcs } from '../src/crs/mapshaper-densify';

var internal = api.internal;

function getTransform(dest) {
  return internal.getProjTransform2(internal.getCrsInfo('wgs84').crs,
    internal.getCrsInfo(dest).crs);
}

describe('-proj densify', function() {

  it('curves the edges of a rectangle in a conic projection', async function() {
    var rect = {type: 'Polygon', coordinates: [[[-130, 20], [-130, 55], [-60, 55], [-60, 20], [-130, 20]]]};
    var out = await api.applyCommands('-i in.json -proj +proj=lcc +lat_1=33 +lat_2=45 +lon_0=-96 densify -o out.json',
      {'in.json': rect});
    var ring = JSON.parse(out['out.json']).geometries[0].coordinates[0];
    assert(ring.length > 20, 'vertices: ' + ring.length);
  });

  describe('default', function() {
    var rect = {type: 'Polygon', coordinates: [[[-130, 20], [-130, 55], [-60, 55], [-60, 20], [-130, 20]]]};
    var lcc = '+proj=lcc +lat_1=33 +lat_2=45 +lon_0=-96';

    async function countRingVertices(cmd, input) {
      var out = await api.applyCommands(cmd + ' -o out.json', {'in.json': input});
      return JSON.parse(out['out.json']).geometries[0].coordinates[0].length;
    }

    it('lat-long data is densified', async function() {
      assert(await countRingVertices('-i in.json -proj ' + lcc, rect) > 20);
    });

    it('no-densify projects only the vertices', async function() {
      assert.equal(await countRingVertices('-i in.json -proj ' + lcc + ' no-densify', rect), 5);
    });

    it('projected data is densified', async function() {
      // a rectangle in LCC coordinates, unprojected to lat-long
      var projected = {type: 'Polygon', coordinates: [[[-2e6, 0], [-2e6, 2e6], [2e6, 2e6], [2e6, 0], [-2e6, 0]]]};
      var cmd = '-i in.json -proj init="' + lcc + '" wgs84';
      assert(await countRingVertices(cmd, projected) > 20);
      assert.equal(await countRingVertices(cmd + ' no-densify', projected), 5);
    });

    it('a round trip through a projected CRS adds vertices only along the original edges', async function() {
      var out = await api.applyCommands('-i in.json -proj ' + lcc + ' -proj wgs84 -o out.json',
        {'in.json': rect});
      var ring = JSON.parse(out['out.json']).geometries[0].coordinates[0];
      rect.coordinates[0].forEach(function(p) {
        assert(ring.some(function(q) {
          return Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9;
        }), 'missing vertex ' + p);
      });
      // the added vertices are on the rectangle's edges
      ring.forEach(function(q) {
        var onEdge = [-130, -60].some(function(x) { return Math.abs(q[0] - x) < 1e-9; }) ||
          [20, 55].some(function(y) { return Math.abs(q[1] - y) < 1e-9; });
        assert(onEdge, 'vertex off the edges: ' + q);
      });
    });

    it('densify and no-densify can not be combined', async function() {
      await assert.rejects(api.applyCommands('-i in.json -proj ' + lcc + ' densify no-densify',
        {'in.json': rect}), /can not be combined/);
    });
  });

  it('projects a multi-view projection with a view that hides every feature', async function() {
    // the southern view shows neither polygon, so no interval can be found
    // for it, which used to be a "Densification error"
    var input = {type: 'FeatureCollection', features: [
      {type: 'Feature', properties: {name: 'hidden'}, geometry: {type: 'Polygon',
        coordinates: [[[60, -84], [60, -78], [80, -78], [80, -84], [60, -84]]]}},
      {type: 'Feature', properties: {name: 'visible'}, geometry: {type: 'Polygon',
        coordinates: [[[60, -40], [60, -30], [80, -30], [80, -40], [60, -40]]]}}]};
    var out = await api.applyCommands('-i in.json -proj hemispheres2 +gap=-0.2 densify -o out.json',
      {'in.json': input});
    var features = JSON.parse(out['out.json']).features.filter(function(f) { return !!f.geometry; });
    assert.deepEqual(features.map(function(f) { return f.properties.name; }), ['visible']);
  });

  describe('projectAndDensifyArcs()', function() {
    it('leaves a segment whose midpoint does not project as it is', function() {
      // short arcs give a small interval, so the long arc is densified, and
      // the first midpoint it tries is the one that fails
      var robin = getTransform('robinson');
      var paths = [[[0, 0], [40, 20]]];
      for (var i = 0; i < 50; i++) paths.push([[i * 0.5, 20], [i * 0.5 + 0.1, 20.1]]);
      var arcs = new internal.ArcCollection(paths);
      var proj = function(x, y) { return x === 20 && y === 10 ? null : robin(x, y); };
      projectAndDensifyArcs(arcs, proj);
      assert.equal(arcs.size(), 51);
      assert.equal(arcs.getArcLength(0), 2);
    });

    it('projects without densifying if no interval can be found', function() {
      var robin = getTransform('robinson');
      var arcs = new internal.ArcCollection([[[-179, 0], [-178, 1]], [[178, 0], [179, 1]]]);
      // only the arcs' own vertices project, not the points probed inside
      // their bounding box
      var proj = function(x, y) { return Math.abs(x) >= 178 ? robin(x, y) : null; };
      projectAndDensifyArcs(arcs, proj);
      assert.equal(arcs.getPointCount(), 4);
      var p = robin(-179, 0);
      assert.deepEqual(arcs.getVertex(0, 0), {x: p[0], y: p[1]});
    });

    it('accepts an empty arc collection', function() {
      var arcs = new internal.ArcCollection([]);
      projectAndDensifyArcs(arcs, getTransform('robinson'));
      assert.equal(arcs.size(), 0);
    });
  });
});
