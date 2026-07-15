import assert from 'assert';
import api from '../mapshaper.js';

describe('Narukawa 2022 projection', function() {
  var radius = 6371000;

  it('projects reference points with the published tetrahedron orientation', function() {
    var src = api.internal.parseCrsString('wgs84');
    var dest = api.internal.parseCrsString(
      '+proj=narukawa2022 +R=' + radius);
    var project = api.internal.getProjTransform2(src, dest);
    var fixtures = [
      [[0, 0], [-20296061.293899134, 6180772.448419459]],
      [[-74, 40], [6421791.954431085, 4625539.35257965]],
      [[120, -30], [-8905448.636812085, -7846704.605512076]]
    ];
    fixtures.forEach(function(test) {
      almostEqualPoint(project(test[0][0], test[0][1]), test[1], 1e-6);
    });
    assert.equal(api.internal.isInvertibleCRS(dest), false);
  });

  it('exposes rectangular topology cuts and an exact projected outline', function() {
    var dest = api.internal.parseCrsString('narukawa2022');
    var topology = api.internal.getProjectionTopology(dest);
    var outline = dest.__projected_outline[0];
    var width = outline[1][0] - outline[0][0];
    var height = outline[2][1] - outline[1][1];
    assert.equal(topology.regions.length, 144);
    assert.equal(topology.seams.length, 1);
    assert.equal(topology.seams[0].type, 'cut');
    assert(topology.seams[0].paths.length >= 3);
    assert(topology.seams[0].paths.every(function(path) {
      return path.length > 100;
    }));
    assert.equal(outline.length, 5);
    assert(Math.abs(width / height - 4 * Math.sqrt(3) / 3) < 1e-12);
  });

  it('splits vector paths at the rectangular wrap boundary', async function() {
    var topology = getTopology();
    var line = findCrossingLine(topology.seams[0].paths, topology);
    var ring = crossingRectangle(line);
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {type: 'line'},
        geometry: {type: 'LineString', coordinates: line}
      }, {
        type: 'Feature',
        properties: {type: 'polygon'},
        geometry: {type: 'Polygon', coordinates: [ring]}
      }]
    };
    var out = await api.applyCommands(
      '-i in.json -proj narukawa2022 -o out.json',
      {'in.json': input}
    );
    var features = Object.values(out).map(function(content) {
      return JSON.parse(content).features[0];
    });
    assert.equal(features.find(function(f) {
      return f.properties.type == 'line';
    }).geometry.type, 'MultiLineString');
    assert.equal(features.find(function(f) {
      return f.properties.type == 'polygon';
    }).geometry.type, 'MultiPolygon');
  });

  it('creates a rectangular polygon and polyline footprint', async function() {
    var input = {'point.json': {type: 'Point', coordinates: [0, 0]}};
    var base = '-i point.json -proj narukawa2022 ';
    var polygonOut = await api.applyCommands(
      base + '-graticule polygon -o target=polygon polygon.json', input);
    var outlineOut = await api.applyCommands(
      base + '-graticule outline -o target=outline outline.json', input);
    var polygon = JSON.parse(polygonOut['polygon.json']).geometries[0];
    var outline = JSON.parse(outlineOut['outline.json']).geometries[0];
    assert.equal(polygon.type, 'Polygon');
    assert.equal(outline.type, 'LineString');
    assert.equal(polygon.coordinates[0].length, 5);
    assert.deepEqual(outline.coordinates,
      polygon.coordinates[0].slice().reverse());
  });

  it('creates graticules without lines spanning wrap boundaries', async function() {
    var out = await api.applyCommands(
      '-i point.json -proj narukawa2022 ' +
      '-graticule -o target=graticule graticule.json',
      {'point.json': {type: 'Point', coordinates: [0, 0]}}
    );
    var features = JSON.parse(out['graticule.json']).features;
    features.filter(function(feature) {
      return feature.properties.type != 'outline';
    }).forEach(function(feature) {
      assert(maxSegmentLength(feature.geometry.coordinates) < 300000);
    });
  });

  it('rotates topology and forward coordinates with lon_0', function() {
    var src = api.internal.parseCrsString('wgs84');
    var unrotated = api.internal.parseCrsString('narukawa2022');
    var rotated = api.internal.parseCrsString(
      '+proj=narukawa2022 +lon_0=20');
    var f1 = api.internal.getProjTransform2(src, unrotated);
    var f2 = api.internal.getProjTransform2(src, rotated);
    almostEqualPoint(f1(0, 10), f2(20, 10), 1e-6);
    assert.equal(getTopology().findRegion(0, 10),
      api.internal.getProjectionTopology(rotated).findRegion(20, 10));
  });
});

function getTopology() {
  return api.internal.getProjectionTopology(
    api.internal.parseCrsString('narukawa2022')
  );
}

function findCrossingLine(paths, topology) {
  for (var path of paths) {
    for (var i = 10; i < path.length - 10; i += 10) {
      var p = path[i];
      for (var angle = 0; angle < Math.PI; angle += Math.PI / 36) {
        var dx = Math.cos(angle) * 0.1;
        var dy = Math.sin(angle) * 0.1;
        var a = [p[0] - dx, p[1] - dy];
        var b = [p[0] + dx, p[1] + dy];
        if (topology.findRegion(a[0], a[1]) !=
            topology.findRegion(b[0], b[1])) {
          return [a, b];
        }
      }
    }
  }
  throw new Error('Unable to find a line crossing the rectangular cut');
}

function crossingRectangle(line) {
  var a = line[0];
  var b = line[1];
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  var k = 0.05 / Math.hypot(dx, dy);
  var px = -dy * k;
  var py = dx * k;
  return [
    [a[0] + px, a[1] + py],
    [b[0] + px, b[1] + py],
    [b[0] - px, b[1] - py],
    [a[0] - px, a[1] - py],
    [a[0] + px, a[1] + py]
  ];
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
