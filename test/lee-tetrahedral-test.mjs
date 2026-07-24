import assert from 'assert';
import fs from 'fs';
import api from '../mapshaper.js';
import { isAxisAligned } from '../src/crs/mapshaper-proj-info.mjs';

describe('Lee conformal tetrahedral projections', function() {
  var src = api.internal.parseCrsString('wgs84');

  it('matches the published Markley and CALM layouts', function() {
    var tests = {
      markley: [
        [[0, 0], [-0.42792496236375754, 0.10649095122238883]],
        [[-30, 40], [-1.607312593541491, 1.5205680523936511]],
        [[120, -50], [2.5403031971520624, -0.9810755877912332]],
        [[179, 80], [-3.200336844948355, 1.6420537563573276]]
      ],
      calm: [
        [[0, 0], [0.5088344930806263, 1.0457244341409706]],
        [[-30, 40], [-2.3334162182971667, 1.5165503541156358]],
        [[120, -50], [0.1279736003897578, -1.5388820113971455]],
        [[179, 80], [-3.9050715522691624, 1.3358143443600978]]
      ]
    };
    Object.keys(tests).forEach(function(id) {
      var dest = api.internal.parseCrsString('+proj=' + id + ' +R=1');
      var project = api.internal.getProjTransform2(src, dest);
      tests[id].forEach(function(test) {
        almostEqualPoint(project(test[0][0], test[0][1]), test[1], 0.003);
      });
    });
  });

  it('exposes rectangular expanded-facet topology', function() {
    ['markley', 'calm'].forEach(function(id) {
      var dest = api.internal.parseCrsString('+proj=' + id + ' +R=1');
      var topology = api.internal.getProjectionTopology(dest);
      var outline = dest.__projected_outline[0];
      var regionKeys = id == 'markley' ?
        ['0:0', '1:0', '2:1', '2:3', '3:0', '3:2'] :
        ['0:0', '1:0', '2:1', '2:3', '2:3', '3:0', '3:0', '3:2'];
      assert.equal(topology.regions.length, regionKeys.length, id);
      assert.equal(topology.raster_regions.length, regionKeys.length, id);
      assert.equal(topology.raster_source_regions.length, 4, id);
      assert.equal(topology.seams.length, 7, id);
      assert.equal(topology.seams.filter(function(o) {
        return o.type == 'cut';
      }).length, 1, id);
      assert.equal(topology.partition_regions, undefined, id);
      assert.deepEqual(topology.regions.map(function(region) {
        return region.source_region + ':' + region.copy;
      }), regionKeys, id);
      topology.regions.forEach(function(region) {
        region.projected_boundary.forEach(function(p) {
          assert(p[0] >= -4 - 1e-9 && p[0] <= 4 + 1e-9, id);
          assert(p[1] >= -Math.sqrt(3) - 1e-9 &&
            p[1] <= Math.sqrt(3) + 1e-9, id);
        });
      });
      assert.equal(outline[1][0] - outline[0][0], 8, id);
      assert(Math.abs(outline[2][1] - outline[1][1] - 2 * Math.sqrt(3)) < 1e-12, id);
      assert.equal(api.internal.isInvertibleCRS(dest), false, id);
      assert.equal(isAxisAligned(dest), false, id);
    });
  });

  it('keeps expanded face transforms aligned with the projection', function() {
    ['markley', 'calm'].forEach(function(id) {
      var dest = api.internal.parseCrsString('+proj=' + id + ' +R=6371000');
      var topology = api.internal.getProjectionTopology(dest);
      var project = api.internal.getProjTransform2(src, dest);
      [[-170, -80], [-30, 1], [-20, -20], [25, 55], [130, 77]].forEach(function(p) {
        var region = topology.findRasterRegion(p[0], p[1]);
        var piecePoint = topology.projectRasterRegion(p[0], p[1], region).map(function(val) {
          return val * dest.a;
        });
        almostEqualPoint(piecePoint, project(p[0], p[1]), 1e-6);
      });
    });
  });

  it('matches the published Markley landmark layout', function() {
    var dest = api.internal.parseCrsString('+proj=markley +R=1');
    var project = api.internal.getProjTransform2(src, dest);
    var northAmerica = project(-100, 40);
    var southAmerica = project(-60, -15);
    var africa = project(20, 5);
    var asia = project(100, 40);
    var australia = project(135, -25);
    assert(northAmerica[0] < southAmerica[0]);
    assert(southAmerica[0] < africa[0]);
    assert(africa[0] < asia[0]);
    assert(asia[0] < australia[0]);
  });

  it('matches the published Atlantic-centered CALM landmark layout', function() {
    var dest = api.internal.parseCrsString('+proj=calm +R=1');
    var project = api.internal.getProjTransform2(src, dest);
    var northAmerica = project(-100, 40);
    var southAmerica = project(-60, -15);
    var africa = project(20, 5);
    var asia = project(100, 40);
    var australia = project(135, -25);
    var antarctica = project(0, -85);
    var northPole = project(0, 90);
    var southPole = project(0, -90);
    assert(northAmerica[0] < southAmerica[0]);
    assert(southAmerica[0] < africa[0]);
    assert(africa[0] < asia[0]);
    assert(asia[0] < australia[0]);
    assert(northAmerica[1] > 0.4);
    assert(africa[1] > 0.6);
    assert(australia[1] < -1);
    assert(antarctica[1] < -0.6);
    assert(northPole[0] < -3.4 && northPole[1] > 1.5);
    assert(southPole[0] > -1 && southPole[0] < 0 && southPole[1] < -0.7);
  });

  it('routes every source point through the split-face topology', function() {
    ['markley', 'calm'].forEach(function(id) {
      var dest = api.internal.parseCrsString('+proj=' + id + ' +R=1');
      var topology = api.internal.getProjectionTopology(dest);
      var project = api.internal.getProjTransform2(src, dest);
      var reached = new Set();
      for (var lat = -85; lat <= 85; lat += 10) {
        for (var lon = -175; lon <= 175; lon += 10) {
          var region = topology.findRegion(lon, lat);
          assert.notEqual(region, undefined, id + ' ' + lon + ',' + lat);
          reached.add(region);
          almostEqualPoint(
            topology.projectRegion(lon, lat, region),
            project(lon, lat),
            1e-6
          );
        }
      }
      assert.equal(reached.size, topology.regions.length, id);
    });
  });

  it('projects vectors across tetrahedral cuts', async function() {
    for (var id of ['markley', 'calm']) {
      var out = await api.applyCommands(
        '-i in.json -proj +proj=' + id + ' +R=6371000 densify -o out.json',
        {'in.json': {type: 'LineString', coordinates: [[-170, 0], [170, 0]]}}
      );
      var geometry = JSON.parse(out['out.json']).geometries[0];
      assert.equal(geometry.type, 'MultiLineString', id);
      assert(geometry.coordinates.length > 1, id);
    }
  });

  it('avoids remote closure chords in world polygons', async function() {
    this.timeout(15000);
    var input = JSON.parse(fs.readFileSync(
      'test/data/features/buffer/__world_country_polygon.json',
      'utf8'
    ));
    for (var densify of ['', ' densify']) {
      for (var id of ['markley', 'calm']) {
        var out = await api.applyCommands(
          '-i in.json -proj ' + id + densify + ' -o out.json',
          {'in.json': input}
        );
        var projected = JSON.parse(out['out.json']);
        assert.equal(projected.features.length, input.features.length, id);
        projected.features.forEach(function(feature) {
          assertNoRemoteHorizontalChord(feature.geometry, 6378137 * 0.2, id);
        });
      }
    }
  });

  it('splits frame-crossing polygons without densification', async function() {
    var input = JSON.parse(fs.readFileSync(
      'test/data/features/proj/a_antarctica.json',
      'utf8'
    ));
    var out = await api.applyCommands(
      '-i in.json -proj markley -o out.json',
      {'in.json': input}
    );
    var geometry = JSON.parse(out['out.json']).features[0].geometry;
    visitPaths(geometry.coordinates, function(path) {
      var xx = path.map(function(p) { return p[0]; });
      assert(Math.max(...xx) - Math.min(...xx) < 6378137 * 2);
    });
    assertNoRemoteHorizontalChord(geometry, 6378137 * 0.2, 'markley');
  });

  it('removes discontinuous chords from graticules', async function() {
    for (var id of ['markley', 'calm']) {
      var out = await api.applyCommands(
        '-i point.json -proj +proj=' + id + ' +R=1' +
        ' -graticule -o target=graticule graticule.json',
        {'point.json': {type: 'Point', coordinates: [0, 0]}}
      );
      var features = JSON.parse(out['graticule.json']).features;
      features.forEach(function(feature) {
        if (feature.properties.type == 'outline') return;
        var geometry = feature.geometry;
        var lines = geometry.type == 'LineString' ?
          [geometry.coordinates] : geometry.coordinates;
        lines.forEach(function(line) {
          for (var i = 1; i < line.length; i++) {
            assert(distance(line[i - 1], line[i]) <= 0.1, id);
          }
        });
      });
    }
  });

  it('projects rasters without gaps in the rectangular frame', function() {
    ['markley', 'calm'].forEach(function(id) {
      var raster = getWorldRaster(360, 180);
      var grid = api.internal.projectRasterGridForward(
        raster,
        src,
        api.internal.parseCrsString('+proj=' + id + ' +R=6371000'),
        {resampling: 'nearest'}
      );
      assert(grid.coverage.every(Boolean), id);
      assert.equal(grid.width, 387, id);
      assert.equal(grid.height, 167, id);
    });
  });
});

function getWorldRaster(width, height) {
  return {
    grid: {
      width: width,
      height: height,
      bands: 1,
      pixelType: 'uint8',
      samples: new Uint8Array(width * height),
      nodata: null,
      bbox: [-180, -90, 180, 90],
      transform: [360 / width, 0, -180, 0, -180 / height, 90]
    }
  };
}

function almostEqualPoint(a, b, tolerance) {
  assert(Math.abs(a[0] - b[0]) <= tolerance);
  assert(Math.abs(a[1] - b[1]) <= tolerance);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function assertNoRemoteHorizontalChord(geometry, maxLength, id) {
  if (!geometry) return;
  visitPaths(geometry.coordinates, function(path) {
    for (var i = 1; i < path.length; i++) {
      var len = distance(path[i - 1], path[i]);
      assert(
        len <= maxLength ||
        Math.abs(path[i][1] - path[i - 1][1]) >= len * 0.005,
        id
      );
    }
  });
}

function visitPaths(coords, cb) {
  if (!coords || !coords.length) return;
  if (typeof coords[0][0] == 'number') {
    cb(coords);
  } else {
    coords.forEach(function(part) {
      visitPaths(part, cb);
    });
  }
}
