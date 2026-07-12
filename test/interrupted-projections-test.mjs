import assert from 'assert';
import api from '../mapshaper.js';

describe('interrupted projections', function() {
  var igh = '+proj=igh +R=6371000';

  it('projects IGH points using PROJ-compatible coordinates', function() {
    var src = api.internal.parseCrsString('wgs84');
    var dest = api.internal.parseCrsString(igh);
    var project = api.internal.getProjTransform2(src, dest);
    var a = project(-40.001, 60);
    var b = project(-39.999, 60);
    almostEqualPoint(a, [-7232528.24086314, 6532652.773031666], 1e-6);
    almostEqualPoint(b, [-1198954.825491449, 6532652.773031666], 1e-6);
    assert.equal(api.internal.isInvertibleCRS(dest), false);
  });

  it('supports the Mollweide and oceanic forward transforms', function() {
    var src = api.internal.parseCrsString('wgs84');
    [
      ['igh_o', [2127241.739731794, 6532652.773031666]],
      ['imoll', [-12415169.066926826, 6869064.045895816]],
      ['imoll_o', [686280.1510976998, 6869064.045895816]]
    ].forEach(function(test) {
      var dest = api.internal.parseCrsString('+proj=' + test[0] + ' +R=6371000');
      var project = api.internal.getProjTransform2(src, dest);
      almostEqualPoint(project(-120, 60), test[1], 1e-6);
      assert.equal(api.internal.isInvertibleCRS(dest), false);
    });
  });

  it('exposes regions and typed seams with lon_0 rotation', function() {
    var P = api.internal.parseCrsString(igh + ' +lon_0=20');
    var topology = api.internal.getProjectionTopology(P);
    assert.equal(topology.regions.length, 6);
    assert.deepEqual(topology.seams.map(function(o) { return o.type; }),
      ['cut', 'cut', 'cut', 'cut']);
    assert.deepEqual(topology.seams[0].coordinates, [[-20, 0], [-20, 91]]);
    assert.equal(topology.regions[0].transform.lon_0, -80);

    var oceanCrs = api.internal.parseCrsString('+proj=igh_o');
    var ocean = api.internal.getProjectionTopology(oceanCrs);
    assert.equal(oceanCrs.lam0 * 180 / Math.PI, -160);
    assert.equal(ocean.regions.length, 6);
    assert.deepEqual(ocean.seams[0].coordinates, [[110, 0], [110, 91]]);
    assert.equal(ocean.regions[0].transform.lon_0, 60);

    var unrotated = api.internal.parseCrsString('+proj=igh_o +lon_0=0');
    assert.equal(unrotated.lam0, 0);
  });

  it('splits a line at an interruption without losing attributes', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 7},
        geometry: {
          type: 'LineString',
          coordinates: [[-80, 60], [0, 60]]
        }
      }]
    };
    var out = await api.applyCommands(
      '-i in.json -proj ' + igh + ' -o out.json',
      {'in.json': input}
    );
    var feature = JSON.parse(out['out.json']).features[0];
    assert.equal(feature.geometry.type, 'MultiLineString');
    assert.equal(feature.geometry.coordinates.length, 2);
    assert.equal(feature.properties.id, 7);
  });

  it('splits lines for every additional interrupted layout', async function() {
    var tests = [
      ['imoll', [[-80, 60], [0, 60]]],
      ['igh_o', [[-120, 60], [-80, 60]]],
      ['imoll_o', [[-120, 60], [-80, 60]]]
    ];
    for (var i = 0; i < tests.length; i++) {
      var id = tests[i][0];
      var out = await api.applyCommands(
        '-i in.json -proj +proj=' + id + ' +R=6371000 -o out.json',
        {'in.json': {type: 'LineString', coordinates: tests[i][1]}}
      );
      var geometry = JSON.parse(out['out.json']).geometries[0];
      assert.equal(geometry.type, 'MultiLineString', id);
      assert.equal(geometry.coordinates.length, 2, id);
    }
  });

  it('rotates interruption cuts with lon_0', async function() {
    var input = {
      type: 'LineString',
      coordinates: [[-60, 60], [20, 60]]
    };
    var out = await api.applyCommands(
      '-i in.json -proj ' + igh + ' +lon_0=20 -o out.json',
      {'in.json': input}
    );
    var geometry = JSON.parse(out['out.json']).geometries[0];
    assert.equal(geometry.type, 'MultiLineString');
    assert.equal(geometry.coordinates.length, 2);
  });

  it('heals source antimeridian cuts in rotated projections', async function() {
    var east = [[170, 50], [180, 50], [180, 70], [170, 70], [170, 50]];
    var west = [[-180, 50], [-170, 50], [-170, 70], [-180, 70], [-180, 50]];
    var input = {
      type: 'Feature',
      properties: {id: 1},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[east], [west]]
      }
    };
    for (var id of ['igh_o', 'imoll_o']) {
      var out = await api.applyCommands(
        '-i in.json -proj +proj=' + id + ' +R=6371000 densify -o out.json',
        {'in.json': input}
      );
      var geometry = JSON.parse(out['out.json']).features[0].geometry;
      assert.equal(geometry.type, 'Polygon', id);
    }
  });

  it('splits polygons into valid parts at interruptions', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: 9},
        geometry: {
          type: 'Polygon',
          coordinates: [[[-80, 50], [0, 50], [0, 70], [-80, 70], [-80, 50]]]
        }
      }]
    };
    var out = await api.applyCommands(
      '-i in.json -proj ' + igh + ' -o out.json',
      {'in.json': input}
    );
    var feature = JSON.parse(out['out.json']).features[0];
    assert.equal(feature.geometry.type, 'MultiPolygon');
    assert.equal(feature.geometry.coordinates.length, 2);
    assert.equal(feature.properties.id, 9);
  });

  it('creates an interrupted polygon outline', async function() {
    var out = await api.applyCommands(
      '-i point.json -proj ' + igh +
      ' -graticule polygon -o target=polygon outline.json',
      {'point.json': {type: 'Point', coordinates: [0, 0]}}
    );
    var json = JSON.parse(out['outline.json']);
    assert.equal(json.type, 'GeometryCollection');
    assert.equal(json.geometries.length, 1);
    assert.equal(json.geometries[0].type, 'Polygon');
    assert.equal(json.geometries[0].coordinates.length, 1);
    // Seam masks are densified at 0.5 degrees so their projected boundaries
    // curve instead of becoming endpoint-to-endpoint chords.
    assert(json.geometries[0].coordinates[0].length > 2000);
  });

  it('creates densified outlines for every additional layout', async function() {
    for (var id of ['imoll', 'igh_o', 'imoll_o']) {
      var out = await api.applyCommands(
        '-i point.json -proj +proj=' + id + ' +R=6371000' +
        ' -graticule polygon -o target=polygon outline.json',
        {'point.json': {type: 'Point', coordinates: [0, 0]}}
      );
      var geometry = JSON.parse(out['outline.json']).geometries[0];
      assert.equal(geometry.type, 'Polygon', id);
      assert.equal(geometry.coordinates.length, 1, id);
      assert(geometry.coordinates[0].length > 2000, id);
    }
  });

  it('removes tiny artifact rings from rotated outlines', async function() {
    var out = await api.applyCommands(
      '-i point.json -proj ' + igh + ' +lon_0=100' +
      ' -graticule polygon -o target=polygon outline.json',
      {'point.json': {type: 'Point', coordinates: [0, 0]}}
    );
    var geometry = JSON.parse(out['outline.json']).geometries[0];
    assert.equal(geometry.type, 'Polygon');
    assert.equal(geometry.coordinates.length, 1);
  });

  it('creates graticules without segments spanning lobe gaps', async function() {
    var projections = [
      igh,
      '+proj=imoll +R=6371000',
      '+proj=igh_o +R=6371000',
      '+proj=imoll_o +R=6371000'
    ];
    for (var projection of projections) {
      var out = await api.applyCommands(
        '-i point.json -proj ' + projection +
        ' -graticule -o target=graticule graticule.json',
        {'point.json': {type: 'Point', coordinates: [0, 0]}}
      );
      var json = JSON.parse(out['graticule.json']);
      var outline = json.features.filter(function(f) {
        return f.properties.type == 'outline';
      });
      assert.equal(outline.length, 1, projection);
      [60, -60].forEach(function(lat) {
        var parallel = json.features.find(function(f) {
          return f.properties.type == 'parallel' && f.properties.value == lat;
        });
        assert(parallel, projection);
        assert(maxSegmentXSpan(parallel.geometry.coordinates) < 100000, projection);
      });
    }
  });

  it('rejects projection from a forward-only CRS', async function() {
    await assert.rejects(function() {
      return api.applyCommands(
        '-i point.json -proj ' + igh + ' -proj wgs84 -o out.json',
        {'point.json': {type: 'Point', coordinates: [0, 0]}}
      );
    }, /no inverse transform/);
  });

  it('rejects raster reprojection to an interrupted CRS', function() {
    var dataset = {
      layers: [{raster_type: 'grid', raster: {}}],
      info: {}
    };
    assert.throws(function() {
      api.internal.projectDataset(
        dataset,
        api.internal.parseCrsString('wgs84'),
        api.internal.parseCrsString(igh),
        {}
      );
    }, /Raster reprojection is not currently supported/);
  });
});

function almostEqualPoint(a, b, tolerance) {
  assert(Math.abs(a[0] - b[0]) <= tolerance);
  assert(Math.abs(a[1] - b[1]) <= tolerance);
}

function maxSegmentXSpan(parts) {
  var max = 0;
  parts.forEach(function(part) {
    for (var i = 1; i < part.length; i++) {
      max = Math.max(max, Math.abs(part[i][0] - part[i - 1][0]));
    }
  });
  return max;
}
