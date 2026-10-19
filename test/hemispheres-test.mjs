import assert from 'assert';
import api from '../mapshaper.js';
import { isAxisAligned } from '../src/crs/mapshaper-proj-info.mjs';

describe('hemispheres projections', function() {
  var R = 6371000;
  var wgs84 = api.internal.parseCrsString('wgs84');

  function getProjector(defn) {
    return api.internal.getProjTransform2(wgs84, api.internal.parseCrsString(defn));
  }

  it('uses mproj ortho and laea for the two hemispheres', function() {
    [['hemispheres2', 'ortho', 1], ['hemispheres', 'laea', Math.SQRT2]].forEach(function(test) {
      var project = getProjector(`+proj=${test[0]} +lon_0=70 +lat_0=10 +gap=0.1 +R=${R}`);
      var front = getProjector(`+proj=${test[1]} +lon_0=70 +lat_0=10 +R=${R}`);
      var back = getProjector(`+proj=${test[1]} +lon_0=-110 +lat_0=10 +R=${R}`);
      var dy = 1.05 * test[2] * R;
      [[70, 10], [100, 30], [40, -20], [130, 50]].forEach(function(p) {
        var q = front(p[0], p[1]);
        almostEqualPoint(project(p[0], p[1]), [q[0], q[1] + dy], 1e-6);
      });
      [[-110, 10], [-60, -30], [-170, 40]].forEach(function(p) {
        var q = back(p[0], p[1]);
        almostEqualPoint(project(p[0], p[1]), [q[0], q[1] - dy], 1e-6);
      });
    });
  });

  it('places the hemispheres side by side with +horizontal', function() {
    var project = getProjector(`+proj=hemispheres2 +horizontal +gap=0 +R=${R}`);
    almostEqualPoint(project(70, 0), [-R, 0], 1e-6);
    almostEqualPoint(project(-110, 0), [R, 0], 1e-6);
  });

  it('divides the globe at 20W and 160E by default', function() {
    var project = getProjector(`+proj=hemispheres2 +gap=0 +R=${R}`);
    assert(project(-19.9, 30)[1] > 0);
    assert(project(-20.1, 30)[1] < 0);
    assert(project(159.9, 30)[1] > 0);
    assert(project(160.1, 30)[1] < 0);
  });

  it('hides areas more than 90 degrees from both centers', function() {
    var project = getProjector('+proj=hemispheres2 +lon_0=65 +lat_0=15 +lon_1=-95 +lat_1=8');
    assert.equal(project(0, -90), null);
    assert(project(65, 15));
    assert(project(-95, 8));
    // laea can project beyond 90 degrees, but the hidden area is the same
    project = getProjector('+proj=hemispheres +lon_0=65 +lat_0=15 +lon_1=-95 +lat_1=8');
    assert.equal(project(0, -90), null);
  });

  it('hides the part of the upper hemisphere under the lower disk', function() {
    var overlap = getProjector('+proj=hemispheres2 +gap=-0.2');
    var separate = getProjector('+proj=hemispheres2');
    assert.equal(overlap(70, -80), null);
    assert(separate(70, -80));
    assert(overlap(-110, 80)); // the lower disk is never hidden
    assert(overlap(70, 50));
  });

  it('hides the part of the left hemisphere under the right disk with +horizontal', function() {
    var overlap = getProjector('+proj=hemispheres2 +gap=-0.2 +horizontal +lat_0=0');
    assert.equal(overlap(150, 0), null); // 80 degrees east of the left center
    assert(overlap(170, 0)); // 80 degrees west of the right center
  });

  it('is invertible', function() {
    ['hemispheres', 'hemispheres2'].forEach(function(id) {
      var dest = api.internal.parseCrsString(`+proj=${id} +lon_0=65 +lat_0=15 +lon_1=-95 +lat_1=8 +gap=-0.2`);
      var fwd = api.internal.getProjTransform2(wgs84, dest);
      var inv = api.internal.getProjTransform2(dest, wgs84);
      assert(api.internal.isInvertibleCRS(dest));
      [[65, 15], [100, -40], [-95, 8], [-60, -30], [-150, 20], [10, 60]].forEach(function(p) {
        almostEqualPoint(inv.apply(null, fwd(p[0], p[1])), p, 1e-9);
      });
      // outside both disks
      assert.equal(inv(dest.a * 3, 0), null);
    });
  });

  it('inverts projected vertices on the rims, including at the poles', async function() {
    var input = {type: 'Polygon', coordinates: [[[-180, -90], [-180, -70], [180, -70], [180, -90], [-180, -90]]]};
    var out = await api.applyCommands('-i in.json -proj hemispheres2 +R=1 -o out.json', {'in.json': input});
    var dest = api.internal.parseCrsString('+proj=hemispheres2 +R=1');
    var inv = api.internal.getProjTransform2(dest, wgs84);
    var coords = JSON.parse(out['out.json']).geometries[0].coordinates.flat(2);
    assert(coords.length > 10);
    coords.forEach(function(p) {
      assert(inv(p[0], p[1]), String(p));
    });
  });

  it('has a view for each disk, which is cut along the disk\'s horizon', function() {
    var P = api.internal.parseCrsString('+proj=hemispheres2 +lat_0=20');
    var topology = api.internal.getProjectionTopology(P);
    assert.equal(isAxisAligned(P), false);
    assert(api.internal.isInterruptedProjection(P));
    assert.notEqual(topology.findRegion(70, 0), topology.findRegion(-110, 0));
    assert.equal(topology.findRegion(70, 0), topology.findRegion(100, 30));
    assert.equal(P.__projection_views.length, 2);
    // the back (upper) disk's view, then the front disk's view
    [[70, 20], [-110, 20]].forEach(function(center, i) {
      var view = P.__projection_views[i];
      var paths = api.internal.getProjectionTopology(view).seams[0].paths;
      assert(paths.length > 0);
      paths.forEach(function(path) {
        path.forEach(function(p) {
          if (Math.abs(p[1]) > 90) return; // extended past a pole
          assert(Math.abs(getAngle(center, p) - 90) < 1e-4, String(p));
        });
      });
    });
  });

  it('shows places that are visible from both centers in both disks', async function() {
    var input = {type: 'Polygon', coordinates: [[[60, 80], [60, 85], [80, 85], [80, 80], [60, 80]]]};
    var out = await api.applyCommands('-i in.json -proj hemispheres +gap=0 +lat_0=15 -o out.json', {'in.json': input});
    var geometry = JSON.parse(out['out.json']).geometries[0];
    var dest = api.internal.parseCrsString('+proj=hemispheres +gap=0 +lat_0=15');
    var r = Math.SQRT2 * dest.a;
    assert.equal(geometry.type, 'MultiPolygon');
    assert.equal(geometry.coordinates.length, 2);
    var centers = geometry.coordinates.map(function(polygon) {
      var ys = polygon[0].map(function(p) { return p[1]; });
      return ys.reduce(function(a, b) { return a + b; }) / ys.length;
    }).sort(function(a, b) { return a - b; });
    // near the top of each disk
    assert(centers[0] < 0 && centers[0] > -r * 0.2);
    assert(centers[1] > r && centers[1] < r * 2);
  });

  it('projects rasters into both disks, up to the rims', function() {
    ['hemispheres', 'hemispheres2'].forEach(function(id) {
      var w = 360, h = 180;
      var raster = {grid: {width: w, height: h, bands: 1, pixelType: 'uint8',
        samples: new Uint8Array(w * h).fill(1), nodata: null, bbox: [-180, -90, 180, 90],
        transform: [360 / w, 0, -180, 0, -180 / h, 90]}};
      var dest = api.internal.parseCrsString(`+proj=${id} +gap=-0.1 +lat_0=15 +R=1`);
      var r = id == 'hemispheres' ? Math.SQRT2 : 1;
      var cy = 1.9 * r / 2; // the disk centers are at +cy and -cy
      var grid = api.internal.projectRasterGridForward(raster, wgs84, dest, {resampling: 'nearest'});
      var t = grid.transform;
      var tolerance = 2 * t[0]; // two pixels
      for (var y = 0; y < grid.height; y++) {
        for (var x = 0; x < grid.width; x++) {
          var px = t[2] + (x + 0.5) * t[0];
          var py = t[5] + (y + 0.5) * t[4];
          var d = Math.min(Math.hypot(px, py - cy), Math.hypot(px, py + cy));
          var covered = grid.coverage[y * grid.width + x];
          if (d < r - tolerance) assert(covered, id + ' ' + [px, py]);
          if (d > r + tolerance) assert(!covered, id + ' ' + [px, py]);
        }
      }
    });
  });

  it('cuts polygons where the hemispheres meet, including at the poles', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'box'},
        geometry: {type: 'Polygon', coordinates: [[[-40, -10], [-40, 10], [0, 10], [0, -10], [-40, -10]]]}
      }, {
        type: 'Feature',
        properties: {name: 'polar'},
        geometry: {type: 'Polygon', coordinates: [[[-180, -90], [-180, -70], [180, -70], [180, -90], [-180, -90]]]}
      }]
    };
    var out = await api.applyCommands('-i in.json -proj hemispheres2 -o out.json', {'in.json': input});
    var features = JSON.parse(out['out.json']).features;
    features.forEach(function(feature) {
      var polygons = feature.geometry.coordinates;
      assert.equal(feature.geometry.type, 'MultiPolygon', feature.properties.name);
      assert.equal(polygons.length, 2, feature.properties.name);
      // one part in each disk
      var sides = polygons.map(function(polygon) {
        var ys = polygon[0].map(function(p) { return p[1]; });
        // the disks touch at y = 0
        assert(Math.min.apply(null, ys) > -1 || Math.max.apply(null, ys) < 1);
        return ys[0] > 0;
      });
      assert.notEqual(sides[0], sides[1]);
    });
  });

  it('rejoins polygons that were divided at the antimeridian', async function() {
    var input = {
      type: 'MultiPolygon',
      coordinates: [
        [[[170, -10], [170, 10], [180, 10], [180, -10], [170, -10]]],
        [[[-180, -10], [-180, 10], [-170, 10], [-170, -10], [-180, -10]]]
      ]
    };
    var out = await api.applyCommands('-i in.json -proj hemispheres +lon_0=0 -o out.json', {'in.json': input});
    var geometry = JSON.parse(out['out.json']).geometries[0];
    assert.equal(geometry.type, 'Polygon');
    assert.equal(geometry.coordinates.length, 1);
  });

  it('removes features in hidden areas', async function() {
    var input = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'hidden'},
        geometry: {type: 'Polygon', coordinates: [[[60, -84], [60, -78], [80, -78], [80, -84], [60, -84]]]}
      }, {
        type: 'Feature',
        properties: {name: 'visible'},
        geometry: {type: 'Polygon', coordinates: [[[60, -40], [60, -30], [80, -30], [80, -40], [60, -40]]]}
      }]
    };
    var out = await api.applyCommands('-i in.json -proj hemispheres2 +gap=-0.2 -o out.json', {'in.json': input});
    var features = JSON.parse(out['out.json']).features.filter(function(f) {
      return !!f.geometry;
    });
    assert.deepEqual(features.map(function(f) { return f.properties.name; }), ['visible']);
    assert.equal(features[0].geometry.type, 'Polygon');
  });

  it('creates a two-part footprint and an outline that includes the front rim', async function() {
    var input = {'point.json': {type: 'Point', coordinates: [0, 0]}};
    var cmd = '-i point.json -proj hemispheres2 +gap=-0.2 ';
    var polygonOut = await api.applyCommands(cmd + '-graticule polygon -o target=polygon polygon.json', input);
    var outlineOut = await api.applyCommands(cmd + '-graticule outline -o target=outline outline.json', input);
    var separateOut = await api.applyCommands('-i point.json -proj hemispheres2 -graticule outline -o target=outline outline.json', input);
    var polygons = JSON.parse(polygonOut['polygon.json']).features;
    var outline = JSON.parse(outlineOut['outline.json']).geometries[0];
    var separate = JSON.parse(separateOut['outline.json']).geometries[0];
    assert.deepEqual(polygons.map(function(f) { return f.properties.hemisphere; }), ['back', 'front']);
    // the front (complete) disk is the lower one
    var ys = polygons[1].geometry.coordinates[0].map(function(p) { return p[1]; });
    assert(Math.min.apply(null, ys) + Math.max.apply(null, ys) < 0);
    assert.equal(outline.type, 'MultiLineString');
    assert.equal(outline.coordinates.length, 2); // the outer boundary and the front rim
    assert.equal(separate.type, 'MultiLineString');
    assert.equal(separate.coordinates.length, 2); // two circles
  });

  it('clips the graticule to the visible parts of the map', async function() {
    var input = {'point.json': {type: 'Point', coordinates: [0, 0]}};
    var out = await api.applyCommands('-i point.json -proj hemispheres2 +gap=-0.2 +R=1 -graticule -o target=graticule out.json', input);
    var r = 1 + 1e-6;
    JSON.parse(out['out.json']).features.forEach(function(feature) {
      var lines = feature.geometry.type == 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      lines.forEach(function(line) {
        line.forEach(function(p) {
          var inUpper = Math.hypot(p[0], p[1] - 0.9) <= r;
          var inLower = Math.hypot(p[0], p[1] + 0.9) <= r;
          assert(inUpper || inLower, String(p));
        });
      });
    });
  });

  it('rejects invalid parameters', function() {
    assert.throws(function() {
      api.internal.parseCrsString('+proj=hemispheres +gap=-1');
    });
    assert.throws(function() {
      api.internal.parseCrsString('+proj=hemispheres +lat_1=100');
    });
    assert.throws(function() {
      api.internal.parseCrsString('+proj=hemispheres +lon_0=10 +lon_1=10');
    });
  });
});

// Great-circle distance in degrees
function getAngle(a, b) {
  var D2R = Math.PI / 180;
  var cos = Math.sin(a[1] * D2R) * Math.sin(b[1] * D2R) +
    Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((a[0] - b[0]) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / D2R;
}

function almostEqualPoint(a, b, tolerance) {
  assert(a, 'Missing point');
  assert(Math.abs(a[0] - b[0]) <= tolerance, `x: ${a[0]} != ${b[0]}`);
  assert(Math.abs(a[1] - b[1]) <= tolerance, `y: ${a[1]} != ${b[1]}`);
}
