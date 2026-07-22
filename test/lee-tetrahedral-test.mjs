import assert from 'assert';
import api from '../mapshaper.js';
import { isAxisAligned } from '../src/crs/mapshaper-proj-info.mjs';

describe('Lee conformal tetrahedral projections', function() {
  var src = api.internal.parseCrsString('wgs84');

  it('matches the published Markley and CALM layouts', function() {
    var tests = {
      markley: [
        [[0, 0], [1.5716265423767932, 0.10706611854251347]],
        [[-30, 40], [0.39312478440138676, 1.519415900521321]],
        [[120, -50], [4.5407869977802395, -0.9808419818849177]],
        [[179, 80], [-1.2003997991994897, 1.6409397623448858]]
      ],
      calm: [
        [[0, 0], [-1.4427937681067675, 1.1970351123622134]],
        [[-30, 40], [-0.8000511343862904, 0.41341293388706046]],
        [[120, -50], [3.6859609945561047, -0.31148710076737585]],
        [[179, 80], [-0.6048866775373773, -1.1369318418881198]]
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
      assert.equal(topology.regions.length, 8, id);
      assert.equal(topology.raster_regions.length, 8, id);
      assert.equal(topology.raster_source_regions.length, 4, id);
      assert.equal(topology.seams.length, 6, id);
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
