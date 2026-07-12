import assert from 'assert';
import api from '../mapshaper.js';

describe('Dymaxion projections', function() {
  var radius = 6371000;

  it('projects reference points with both facet transformations', function() {
    var src = api.internal.parseCrsString('wgs84');
    var fixtures = {
      dymaxion: [
        [[0, 0], [-5864002.643216022, 8811563.967846861]],
        [[-74, 40], [3736470.96883422, 1839236.0644917663]],
        [[120, -30], [-12632651.20192684, -4039718.5012551486]]
      ],
      dymaxion2: [
        [[0, 0], [-5960809.924882611, 8752543.974451415]],
        [[-74, 40], [3617937.8780502495, 1756939.5124053466]],
        [[120, -30], [-12668454.874594623, -4175107.156822578]]
      ]
    };
    Object.keys(fixtures).forEach(function(id) {
      var dest = api.internal.parseCrsString('+proj=' + id + ' +R=' + radius);
      var project = api.internal.getProjTransform2(src, dest);
      fixtures[id].forEach(function(test) {
        almostEqualPoint(project(test[0][0], test[0][1]), test[1], 1e-6);
      });
      assert.equal(api.internal.isInvertibleCRS(dest), false);
    });
  });

  it('exposes the Airocean facet topology', function() {
    var topology = getTopology('dymaxion');
    var seamTypes = topology.seams.reduce(function(memo, seam) {
      memo[seam.type] = (memo[seam.type] || 0) + 1;
      return memo;
    }, {});
    assert.equal(topology.regions.length, 24);
    assert.deepEqual(seamTypes, {attached: 23, cut: 13});
    assert(topology.seams.every(function(seam) {
      return seam.faces.length == 2 && seam.paths.length > 0;
    }));
    assert(topology.seams.some(function(seam) {
      return seam.paths[0].length > 100;
    }));
  });

  it('keeps attached edges connected and splits cut edges', async function() {
    for (var id of ['dymaxion', 'dymaxion2']) {
      var topology = getTopology(id);
      for (var type of ['attached', 'cut']) {
        var seam = topology.seams.find(function(o) {
          return o.type == type;
        });
        var input = {
          type: 'Feature',
          properties: {edge: type},
          geometry: {
            type: 'LineString',
            coordinates: findCrossingLine(seam, topology)
          }
        };
        var out = await api.applyCommands(
          '-i in.json -proj +proj=' + id + ' +R=' + radius + ' -o out.json',
          {'in.json': input}
        );
        var feature = JSON.parse(out['out.json']).features[0];
        assert.equal(feature.geometry.type,
          type == 'cut' ? 'MultiLineString' : 'LineString', id + ' ' + type);
        assert.equal(feature.properties.edge, type);
      }
    }
  });

  it('keeps polygons valid at attached and cut edges', async function() {
    var topology = getTopology('dymaxion');
    for (var type of ['attached', 'cut']) {
      var seam = topology.seams.find(function(o) {
        return o.type == type;
      });
      var path = seam.paths[0];
      var p = path[Math.floor(path.length / 2)];
      var e = 0.3;
      var ring = [
        [p[0] - e, p[1] - e],
        [p[0] + e, p[1] - e],
        [p[0] + e, p[1] + e],
        [p[0] - e, p[1] + e],
        [p[0] - e, p[1] - e]
      ];
      var out = await api.applyCommands(
        '-i in.json -proj dymaxion -o out.json',
        {'in.json': {type: 'Polygon', coordinates: [ring]}}
      );
      var geometry = JSON.parse(out['out.json']).geometries[0];
      assert.equal(geometry.type,
        type == 'cut' ? 'MultiPolygon' : 'Polygon', type);
    }
  });

  it('creates exact polygon and polyline net footprints', async function() {
    for (var id of ['dymaxion', 'dymaxion2']) {
      var base = '-i point.json -proj ' + id + ' ';
      var input = {'point.json': {type: 'Point', coordinates: [0, 0]}};
      var polygonOut = await api.applyCommands(
        base + '-graticule polygon -o target=polygon polygon.json', input);
      var outlineOut = await api.applyCommands(
        base + '-graticule outline -o target=outline outline.json', input);
      var polygon = JSON.parse(polygonOut['polygon.json']).geometries[0];
      var outline = JSON.parse(outlineOut['outline.json']).geometries[0];
      assert.equal(polygon.type, 'Polygon', id);
      assert.equal(outline.type, 'LineString', id);
      assert.equal(polygon.coordinates[0].length, 27, id);
      assert.deepEqual(outline.coordinates,
        polygon.coordinates[0].slice().reverse(), id);
    }
  });

  it('creates graticules without lines spanning net gaps', async function() {
    for (var id of ['dymaxion', 'dymaxion2']) {
      var out = await api.applyCommands(
        '-i point.json -proj ' + id +
        ' -graticule -o target=graticule graticule.json',
        {'point.json': {type: 'Point', coordinates: [0, 0]}}
      );
      var features = JSON.parse(out['graticule.json']).features;
      assert.equal(features.filter(function(f) {
        return f.properties.type == 'outline';
      }).length, 1, id);
      features.filter(function(f) {
        return f.properties.type != 'outline';
      }).forEach(function(f) {
        assert(maxSegmentLength(f.geometry.coordinates) < 100000, id);
      });
    }
  });

  it('rotates facet topology and forward coordinates with lon_0', function() {
    var src = api.internal.parseCrsString('wgs84');
    var unrotated = api.internal.parseCrsString('dymaxion');
    var rotated = api.internal.parseCrsString('+proj=dymaxion +lon_0=20');
    var f1 = api.internal.getProjTransform2(src, unrotated);
    var f2 = api.internal.getProjTransform2(src, rotated);
    almostEqualPoint(f1(0, 10), f2(20, 10), 1e-6);
    assert.equal(getTopology('dymaxion').findRegion(0, 10),
      api.internal.getProjectionTopology(rotated).findRegion(20, 10));
  });
});

function getTopology(id) {
  return api.internal.getProjectionTopology(
    api.internal.parseCrsString('+proj=' + id)
  );
}

function findCrossingLine(seam, topology) {
  for (var path of seam.paths) {
    var p = path[Math.floor(path.length / 2)];
    for (var angle = 0; angle < Math.PI; angle += Math.PI / 36) {
      var dx = Math.cos(angle) * 0.2;
      var dy = Math.sin(angle) * 0.2;
      var a = [p[0] - dx, p[1] - dy];
      var b = [p[0] + dx, p[1] + dy];
      var regionA = topology.findRegion(a[0], a[1]);
      var regionB = topology.findRegion(b[0], b[1]);
      if (regionA != regionB &&
          seam.faces.includes(regionA) &&
          seam.faces.includes(regionB)) {
        return [a, b];
      }
    }
  }
  throw new Error('Unable to find a line crossing facet edge');
}

function maxSegmentLength(coords) {
  if (typeof coords[0][0] == 'number') {
    var max = 0;
    for (var i = 1; i < coords.length; i++) {
      max = Math.max(max, Math.hypot(
        coords[i][0] - coords[i - 1][0],
        coords[i][1] - coords[i - 1][1]
      ));
    }
    return max;
  }
  return Math.max.apply(null, coords.map(maxSegmentLength));
}

function almostEqualPoint(a, b, tolerance) {
  assert(Math.abs(a[0] - b[0]) < tolerance,
    'Expected x ' + a[0] + ' to equal ' + b[0]);
  assert(Math.abs(a[1] - b[1]) < tolerance,
    'Expected y ' + a[1] + ' to equal ' + b[1]);
}
