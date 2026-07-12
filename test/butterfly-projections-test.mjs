import assert from 'assert';
import api from '../mapshaper.js';
import {createCahillKeyesRaw} from '../src/crs/mapshaper-cahill-keyes.mjs';
import {
  createRadialButterflyEngine
} from '../src/crs/mapshaper-butterfly-projections.mjs';
import {createGnomonicProjector} from '../src/crs/mapshaper-slice-and-dice.mjs';

describe('Butterfly projections', function() {
  var radius = 6371000;

  it('projects reference points and remains forward-only', function() {
    var src = api.internal.parseCrsString('wgs84');
    var fixtures = {
      butterfly: [
        [[0, 0], [-10069466.501345025, 8341707.59919877]],
        [[-74, 40], [6034368.69020827, 5356352.078105299]],
        [[120, -30], [-6015664.099246422, -5837788.570011446]]
      ],
      butterfly2: [
        [[0, 0], [2602069.4271444003, -4311303.710935575]],
        [[-74, 40], [-3562461.3391541583, 910301.8155581526]],
        [[120, -30], [13093815.265308343, 6223940.576395109]]
      ],
      cahill_keyes: [
        [[0, 0], [3724414.5350762657, 1404499.1133618308]],
        [[-74, 40], [-6481963.309702179, 3183578.0832191235]],
        [[120, -30], [18094076.64206148, -2413997.168872486]]
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

  it('matches documented Cahill-Keyes 12-zone reference values', function() {
    var raw = createCahillKeyesRaw(10000);
    var r = Math.PI / 180;
    var fixtures = [
      [[0, 0], [940, -5773.502691896258]],
      [[-74, 40], [-8853.866399709364, -6085.143419182104]],
      [[120, -30], [15452.15947525505, -11900.602791778441]],
      [[29, 15], [4380.215039325024, -6541.296619820929]],
      [[44, 74], [8675.03679564931, -2236.961598722879]]
    ];
    fixtures.forEach(function(test) {
      almostEqualPoint(raw(test[0][0] * r, test[0][1] * r), test[1], 1e-9);
    });
  });

  it('uses low-distortion Cahill-Keyes facets in the butterfly net', function() {
    var engine = api.internal.getButterflyEngine('butterfly');
    var face = engine.faces[0];
    var scales = [];
    var r = Math.PI / 180;
    assert.equal(engine.facetProjection, 'cahill_keyes');
    for (var lat = 2; lat < 88; lat += 2) {
      for (var lon = -88; lon < -2; lon += 2) {
        if (engine.findFace(lon * r, lat * r) == face.id) {
          scales.push(getArealScale(face.project, [lon, lat]));
        }
      }
    }
    assert(Math.max.apply(null, scales) / Math.min.apply(null, scales) < 1.5);
  });

  it('exposes the expected butterfly topology', function() {
    assertTopology('butterfly', 32, {attached: 31, cut: 29});
    assertTopology('butterfly2', 32, {attached: 31, cut: 29});
    assertTopology('cahill_keyes', 32, {attached: 31, cut: 29});
  });

  it('shares one engine between the two butterfly aspects', function() {
    assert.strictEqual(
      api.internal.getButterflyEngine('butterfly'),
      api.internal.getButterflyEngine('butterfly2')
    );
  });

  it('does not register the former Cahill and Waterman aliases', function() {
    assert.throws(function() {
      api.internal.parseCrsString('+proj=cahill');
    });
    assert.throws(function() {
      api.internal.parseCrsString('+proj=waterman');
    });
  });

  it('selects every central and corner region', function() {
    var r = Math.PI / 180;
    ['butterfly', 'cahill_keyes'].forEach(function(id) {
      var engine = api.internal.getButterflyEngine(id);
      var selected = engine.faces.map(function(face) {
        return engine.findFace(
          face.centroid[0] * r,
          face.centroid[1] * r
        );
      });
      assert.deepEqual(selected, engine.faces.map(function(face) {
        return face.id;
      }), id);
    });
  });

  it('preserves smooth low-distortion radial facet infrastructure', function() {
    var engine = createRadialButterflyEngine();
    var face = engine.faces[0];
    var scales = [];
    var r = Math.PI / 180;
    assert.deepEqual(engine.radialFacet, {
      projection: 'laea',
      projection2: null,
      blend: 0,
      boundaryStrength: 1
    });
    for (var lat = 2; lat < 88; lat += 2) {
      for (var lon = -88; lon < -2; lon += 2) {
        if (engine.findFace(lon * r, lat * r) == face.id) {
          scales.push(getArealScale(face.project, [lon, lat]));
        }
      }
    }
    assert(Math.max.apply(null, scales) / Math.min.apply(null, scales) < 2.1);
  });

  it('supports configurable and blended radial facet projections', function() {
    var point = [-74, 40];
    var options = {
      laea: {projection: 'laea'},
      aeqd: {projection: 'aeqd'},
      blend0: {projection: 'laea', projection2: 'aeqd', blend: 0},
      blend1: {projection: 'laea', projection2: 'aeqd', blend: 1},
      blend: {projection: 'laea', projection2: 'stere', blend: 0.25}
    };
    var projected = {};
    Object.keys(options).forEach(function(id) {
      projected[id] = createRadialButterflyEngine(options[id]).forward(
        point[0] * Math.PI / 180,
        point[1] * Math.PI / 180
      );
    });
    almostEqualPoint(projected.laea, projected.blend0, 1e-6);
    almostEqualPoint(projected.aeqd, projected.blend1, 1e-6);
    assert(Math.hypot(
      projected.blend[0] - projected.laea[0],
      projected.blend[1] - projected.laea[1]
    ) > 1e-6);
    assert.deepEqual(
      createRadialButterflyEngine({
        projection: 'equal_area',
        projection2: 'stereographic',
        blend: 0.25
      }).radialFacet,
      {
        projection: 'laea',
        projection2: 'stere',
        blend: 0.25,
        boundaryStrength: 1
      }
    );
  });

  it('rejects invalid radial facet projection options', function() {
    assert.throws(function() {
      createRadialButterflyEngine({projection: 'invalid'});
    });
    assert.throws(function() {
      createRadialButterflyEngine({
        projection: 'laea',
        projection2: 'gnom',
        blend: 2
      });
    });
  });

  it('keeps radial facet boundaries exactly gnomonic', function() {
    var face = createRadialButterflyEngine().faces[0];
    var gnomonic = createGnomonicProjector(face.centroid);
    var r = Math.PI / 180;
    face.coords.forEach(function(a, i) {
      var b = face.coords[(i + 1) % face.coords.length];
      var p = sphericalMidpoint(a, b);
      almostEqualPoint(
        face.project(p[0] * r, p[1] * r),
        gnomonic(p[0] * r, p[1] * r),
        1e-12
      );
    });
  });

  it('uses historical central meridians unless lon_0 is supplied', function() {
    var src = api.internal.parseCrsString('wgs84');
    var defaults = {
      butterfly: 157.5,
      butterfly2: -20,
      cahill_keyes: -20
    };
    Object.keys(defaults).forEach(function(id) {
      var lon0 = defaults[id];
      var defaultCrs = api.internal.parseCrsString(id);
      var zeroCrs = api.internal.parseCrsString('+proj=' + id + ' +lon_0=0');
      assert.equal(defaultCrs.lam0 * 180 / Math.PI, lon0);
      assert.equal(zeroCrs.lam0, 0);
      almostEqualPoint(
        api.internal.getProjTransform2(src, defaultCrs)(lon0, 10),
        api.internal.getProjTransform2(src, zeroCrs)(0, 10),
        1e-6
      );
    });
  });

  it('keeps attached edges connected and splits cut edges', async function() {
    for (var id of ['butterfly', 'butterfly2', 'cahill_keyes']) {
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
      }
    }
  });

  it('creates matching polygon and polyline footprints', async function() {
    for (var id of ['butterfly', 'butterfly2', 'cahill_keyes']) {
      var base = '-i point.json -proj ' + id + ' ';
      var input = {'point.json': {type: 'Point', coordinates: [0, 0]}};
      var polygonOut = await api.applyCommands(
        base + '-graticule polygon -o target=polygon polygon.json', input);
      var outlineOut = await api.applyCommands(
        base + '-graticule outline -o target=outline outline.json', input);
      var polygon = JSON.parse(polygonOut['polygon.json']).geometries[0];
      var outline = JSON.parse(outlineOut['outline.json']).geometries[0];
      if (id == 'cahill_keyes') {
        assert.equal(polygon.type, 'MultiPolygon', id);
        assert.equal(outline.type, 'MultiLineString', id);
        assert(polygon.coordinates.length > 1, id);
        assert(outline.coordinates.length > 1, id);
        assertNoExtremeOutlineConnectors(outline.coordinates);
      } else {
        assert.equal(polygon.type, 'Polygon', id);
        assert.equal(outline.type, 'LineString', id);
        assert(polygon.coordinates[0].length > 10, id);
        assert.deepEqual(outline.coordinates,
          polygon.coordinates[0].slice().reverse(), id);
      }
    }
  });

  it('creates graticules without lines spanning net gaps', async function() {
    for (var id of ['butterfly', 'butterfly2', 'cahill_keyes']) {
      var out = await api.applyCommands(
        '-i point.json -proj ' + id +
        ' -graticule -o target=graticule graticule.json',
        {'point.json': {type: 'Point', coordinates: [0, 0]}}
      );
      var features = JSON.parse(out['graticule.json']).features;
      assert(features.some(function(f) {
        return f.properties.type == 'outline';
      }), id);
      features.filter(function(f) {
        return f.properties.type != 'outline';
      }).forEach(function(f) {
        assert(maxSegmentLength(f.geometry.coordinates) < 600000, id);
      });
    }
  });

  it('rotates topology and forward coordinates with lon_0', function() {
    var src = api.internal.parseCrsString('wgs84');
    for (var id of ['butterfly', 'butterfly2', 'cahill_keyes']) {
      var unrotated = api.internal.parseCrsString('+proj=' + id + ' +lon_0=0');
      var rotated = api.internal.parseCrsString('+proj=' + id + ' +lon_0=20');
      var f1 = api.internal.getProjTransform2(src, unrotated);
      var f2 = api.internal.getProjTransform2(src, rotated);
      almostEqualPoint(f1(0, 10), f2(20, 10), 1e-6);
      assert.equal(api.internal.getProjectionTopology(unrotated).findRegion(0, 10),
        api.internal.getProjectionTopology(rotated).findRegion(20, 10));
    }
  });
});

function assertTopology(id, regionCount, expectedSeams) {
  var topology = getTopology(id);
  var seamTypes = topology.seams.reduce(function(memo, seam) {
    memo[seam.type] = (memo[seam.type] || 0) + 1;
    return memo;
  }, {});
  assert.equal(topology.regions.length, regionCount);
  assert.deepEqual(seamTypes, expectedSeams);
  assert(topology.seams.every(function(seam) {
    return seam.faces.length == 2 && seam.paths.length > 0;
  }));
}

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

function assertNoExtremeOutlineConnectors(paths) {
  var points = paths.flat();
  var xmin = Math.min.apply(null, points.map(function(p) {return p[0];}));
  var xmax = Math.max.apply(null, points.map(function(p) {return p[0];}));
  var ymin = Math.min.apply(null, points.map(function(p) {return p[1];}));
  var ymax = Math.max.apply(null, points.map(function(p) {return p[1];}));
  var width = xmax - xmin;
  var height = ymax - ymin;
  paths.forEach(function(path) {
    for (var i = 1; i < path.length; i++) {
      var a = path[i - 1];
      var b = path[i];
      var atTop = Math.min(a[1], b[1]) >= ymax - height * 1e-3;
      var atBottom = Math.max(a[1], b[1]) <= ymin + height * 1e-3;
      var flat = Math.abs(a[1] - b[1]) <= height * 1e-4;
      var wide = Math.abs(a[0] - b[0]) >= width * 0.02;
      assert(!(atTop || atBottom) || !flat || !wide);
    }
  });
}

function almostEqualPoint(a, b, tolerance) {
  almostEqual(a[0], b[0], tolerance);
  almostEqual(a[1], b[1], tolerance);
}

function almostEqual(a, b, tolerance) {
  assert(Math.abs(a - b) < tolerance, 'Expected ' + a + ' to equal ' + b);
}

function getArealScale(project, p) {
  var r = Math.PI / 180;
  var lam = p[0] * r;
  var phi = p[1] * r;
  var e = 1e-6;
  var left = project(lam - e, phi);
  var right = project(lam + e, phi);
  var bottom = project(lam, phi - e);
  var top = project(lam, phi + e);
  var dxdl = (right[0] - left[0]) / (2 * e);
  var dydl = (right[1] - left[1]) / (2 * e);
  var dxdp = (top[0] - bottom[0]) / (2 * e);
  var dydp = (top[1] - bottom[1]) / (2 * e);
  return Math.abs(dxdl * dydp - dydl * dxdp) / Math.cos(phi);
}

function sphericalMidpoint(a, b) {
  var r = Math.PI / 180;
  var av = [
    Math.cos(a[1] * r) * Math.cos(a[0] * r),
    Math.cos(a[1] * r) * Math.sin(a[0] * r),
    Math.sin(a[1] * r)
  ];
  var bv = [
    Math.cos(b[1] * r) * Math.cos(b[0] * r),
    Math.cos(b[1] * r) * Math.sin(b[0] * r),
    Math.sin(b[1] * r)
  ];
  var x = av[0] + bv[0];
  var y = av[1] + bv[1];
  var z = av[2] + bv[2];
  return [
    Math.atan2(y, x) / r,
    Math.atan2(z, Math.hypot(x, y)) / r
  ];
}
