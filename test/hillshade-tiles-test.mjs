import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

// Rough terrain: smooth noise at several scales, plus a sea below 0 and a
// corner without data
// @relief optional height of the largest landforms (default 600)
function makeTerrain(width, height, relief) {
  var elev = new Float32Array(width * height);
  var valid = new Uint8Array(width * height).fill(1);
  var amp = relief || 600, freq = 1 / 60, o, x, y, i;
  for (o = 0; o < 5; o++, amp *= 0.5, freq *= 2) {
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        elev[y * width + x] += amp * noise(x * freq, y * freq, o);
      }
    }
  }
  for (i = 0; i < elev.length; i++) elev[i] -= (relief || 600) * 0.4;
  for (y = 0; y < height / 6; y++) {
    for (x = 0; x < width / 5; x++) valid[y * width + x] = 0;
  }
  return {
    elev: elev,
    valid: valid,
    width: width,
    height: height,
    cellWidths: new Float64Array(height).map(function(v, y) { return 90 - y * 0.01; }),
    cellHeights: new Float64Array(height).fill(100)
  };
}

function hash(x, y, s) {
  var n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y, s) {
  var x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  var a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// Runs a stage on the whole grid and on tiles, returning both results for @key
function runWholeAndTiled(grid, stage, settings, tiles, key) {
  var whole = internal.runHillshadeStage({stage: stage, grid: grid, settings: settings})[key];
  var tiled = new Float32Array(grid.width * grid.height);
  tiles.forEach(function(tile) {
    var part = internal.runHillshadeStage({stage: stage, settings: settings, grid: {
      elev: internal.copyTile(grid.elev, grid.width, tile),
      valid: internal.copyTile(grid.valid, grid.width, tile),
      width: tile.xb - tile.xa,
      height: tile.yb - tile.ya,
      cellWidths: grid.cellWidths.slice(tile.ya, tile.yb),
      cellHeights: grid.cellHeights.slice(tile.ya, tile.yb)
    }})[key];
    internal.pasteTileCore(tiled, grid.width, tile, part);
  });
  return {whole: whole, tiled: tiled};
}

function countDifferences(a, b) {
  var n = 0;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) n++;
  }
  return n;
}

function smoothingSettings(method, fps) {
  var presets = {
    low: {rounds: 1, threshold: 15, radius: 4, levels: 1},
    medium: {rounds: 3, threshold: 20, radius: 4, levels: 1},
    high: {rounds: 3, threshold: 20, radius: 4, levels: 2}
  };
  return {
    method: method,
    fps: method == 'lowpass' ? null : Object.assign({}, presets[method], fps),
    refinement: {rounds: 1, threshold: 20, radius: 4},
    lowpassRadius: 1,
    exaggeration: 2,
    minElevation: null
  };
}

function shadingSettings(o) {
  return Object.assign({
    lights: internal.getHillshadeLights(315, 45),
    azimuth: 315,
    exaggeration: 2,
    lightAdjust: 0,
    ambient: 0.5,
    aerial: 0,
    texture: 0,
    textureDetail: 0.5,
    textureHighlights: 0,
    minElevation: null,
    style: 'shadow',
    toneOpts: {maxOpacity: 0.55, highlightRatio: 1, gamma: 0.75, maxShade: Math.SQRT2},
    sharpening: 0.25,
    sharpenRadius: 3,
    sharpenThreshold: 0
  }, o);
}

describe('mapshaper-raster-tiles.mjs', function () {
  describe('getTileLayout()', function () {
    function checkCoverage(tiles, width, height) {
      var covered = new Uint8Array(width * height);
      tiles.forEach(function(t) {
        for (var y = t.y0; y < t.y1; y++) {
          for (var x = t.x0; x < t.x1; x++) covered[y * width + x]++;
        }
        assert(t.xa >= 0 && t.ya >= 0 && t.xb <= width && t.yb <= height);
        assert(t.xa <= t.x0 && t.ya <= t.y0 && t.xb >= t.x1 && t.yb >= t.y1);
      });
      assert(covered.every(function(n) { return n == 1; }));
    }

    it('tiles cover every pixel once, with margins inside the grid', function () {
      [[300, 200, 16, 34], [101, 57, 6, 10], [50, 40, 3, 100]].forEach(function(o) {
        checkCoverage(internal.getTileLayout(o[0], o[1], o[2], o[3], false), o[0], o[1]);
      });
    });

    it('margins extend tile cores by the reach, where the grid continues', function () {
      var tiles = internal.getGridTiles(300, 200, 2, 2, 20, false);
      assert.deepEqual(tiles[0], {x0: 0, x1: 150, y0: 0, y1: 100, xa: 0, xb: 170, ya: 0, yb: 120});
      assert.deepEqual(tiles[3], {x0: 150, x1: 300, y0: 100, y1: 200, xa: 130, xb: 300, ya: 80, yb: 200});
    });

    it('aligned tiles start on even rows and columns', function () {
      var tiles = internal.getTileLayout(301, 199, 9, 33, true);
      checkCoverage(tiles, 301, 199);
      tiles.forEach(function(t) {
        assert.equal(t.xa % 2, 0);
        assert.equal(t.ya % 2, 0);
      });
    });

    it('minimizes the largest tile, so prefers tiles to strips', function () {
      function largest(tiles) {
        return Math.max.apply(null, tiles.map(function(t) { return (t.xb - t.xa) * (t.yb - t.ya); }));
      }
      var tiles = internal.getTileLayout(3000, 2000, 16, 34, false);
      assert.equal(tiles.length, 16);
      assert(tiles[0].x1 < 3000 && tiles[0].y1 < 2000);
      assert(largest(tiles) <= largest(internal.getGridTiles(3000, 2000, 4, 4, 34, false)));
      assert(largest(tiles) < largest(internal.getGridTiles(3000, 2000, 16, 1, 34, false)));
    });

    it('uses fewer tiles when more do not help', function () {
      assert.equal(internal.getTileLayout(100, 100, 16, 200, false).length, 1);
    });

    it('a reach of Infinity gives a single tile', function () {
      var tiles = internal.getTileLayout(300, 200, 8, Infinity, false);
      assert.deepEqual(tiles, [{x0: 0, x1: 300, y0: 0, y1: 200, xa: 0, xb: 300, ya: 0, yb: 200}]);
    });
  });

  it('copyTile() and pasteTileCore() reassemble a grid', function () {
    var src = Float32Array.from({length: 37 * 23}, function(v, i) { return i; });
    var dest = new Float32Array(src.length);
    internal.getGridTiles(37, 23, 3, 2, 4, false).forEach(function(t) {
      internal.pasteTileCore(dest, 37, t, internal.copyTile(src, 37, t));
    });
    assert.deepEqual(dest, src);
  });
});

describe('hillshading in tiles', function () {
  this.timeout(20000);
  var grid = makeTerrain(360, 280);
  // dynamic smoothing's thresholds reach their maximum everywhere on the steep
  // terrain above; here they are 4 to 6 degrees
  var gentle = makeTerrain(360, 280, 60);
  var DYNAMIC = {minThreshold: 1, slopeFactor: 3, slopeRadius: 10};

  function assertTilesMatch(stage, settings, key, gridArg) {
    var g = gridArg || grid;
    var reach = stage == 'smooth' ? internal.getSmoothingReach(settings) : internal.getShadingReach(settings);
    var tiles = internal.getGridTiles(g.width, g.height, 2, 2, reach, stage == 'smooth');
    var r = runWholeAndTiled(g, stage, settings, tiles, key);
    assert.equal(countDifferences(r.whole, r.tiled), 0);
  }

  describe('smoothing gives the same result as smoothing the whole grid', function () {
    [
      ['low', {}],
      ['medium', {}],
      ['high', {}],
      ['medium', {radius: 6, rounds: 2, maxChange: 20}]
    ].forEach(function(o) {
      it(o[0] + ' ' + JSON.stringify(o[1]), function () {
        assertTilesMatch('smooth', smoothingSettings(o[0], o[1]), 'elev');
      });
    });

    [
      ['medium', DYNAMIC],
      ['high', Object.assign({blendRange: [5, 15]}, DYNAMIC)],
      ['high', Object.assign({blendRange: null}, DYNAMIC)]
    ].forEach(function(o) {
      it('dynamic: ' + o[0] + ' ' + JSON.stringify(o[1]), function () {
        assertTilesMatch('smooth', smoothingSettings(o[0], o[1]), 'elev', gentle);
      });
    });

    it('with min-elevation', function () {
      var g = Object.assign({}, grid, {elev: Float32Array.from(grid.elev)});
      internal.raiseLowElevations(g.elev, g.valid, 0);
      assertTilesMatch('smooth', Object.assign(smoothingSettings('medium'), {minElevation: 0}), 'elev', g);
    });

    it('dynamic smoothing thresholds', function () {
      assertTilesMatch('smooth', smoothingSettings('medium', DYNAMIC), 'thresholds', gentle);
    });

    it('lowpass smoothing needs the whole grid', function () {
      assert.equal(internal.getSmoothingReach(smoothingSettings('lowpass')), Infinity);
    });
  });

  describe('shading gives the same result as shading the whole grid', function () {
    var smoothed = Object.assign({}, grid, {
      elev: internal.runHillshadeStage({stage: 'smooth', grid: grid, settings: smoothingSettings('medium')}).elev
    });
    [
      {},
      {ambient: 0, sharpening: 0},
      {lightAdjust: 30, lights: internal.getHillshadeLights(315, 45, true)},
      {texture: 0.5, textureHighlights: 0.5},
      {sharpening: 1, sharpenRadius: 6, sharpenThreshold: 0.02},
      {minElevation: 0, texture: 0.4, style: 'opaque', toneOpts: {maxOpacity: 1}}
    ].forEach(function(o) {
      it(JSON.stringify(o), function () {
        assertTilesMatch('shade', shadingSettings(o), 'tones', smoothed);
      });
    });

    it('aerial perspective, with the elevation range of the whole grid', function () {
      var range = internal.getAerialRange(smoothed.elev, smoothed.valid);
      assertTilesMatch('shade', shadingSettings({aerial: 0.6, aerialRange: range}), 'tones', smoothed);
    });
  });

  // The computed reach of a stage is an upper bound: a change to one pixel
  // should never change the result farther away than that. Smoothing ignores
  // neighbors whose slopes differ too much, so changes may stop short of it.
  describe('changes spread no farther than the computed reach', function () {
    var size = 241;
    var steep = makeTerrain(size, size);
    var gentleTerrain = makeTerrain(size, size, 60);

    // Largest distance (in rows or columns) from @cx, @cy at which the result
    // changes when that pixel's elevation does
    function measureSpread(terrain, stage, settings, key, cx, cy) {
      var changed = Object.assign({}, terrain, {elev: Float32Array.from(terrain.elev)});
      var a, b, d = 0, i;
      changed.elev[cy * size + cx] += 25;
      a = internal.runHillshadeStage({stage: stage, grid: terrain, settings: settings})[key];
      b = internal.runHillshadeStage({stage: stage, grid: changed, settings: settings})[key];
      for (i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          d = Math.max(d, Math.abs(i % size - cx), Math.abs(Math.floor(i / size) - cy));
        }
      }
      return d;
    }

    function assertWithinReach(stage, settings, key, terrain) {
      var reach = (stage == 'smooth' ? internal.getSmoothingReach(settings) :
        internal.getShadingReach(settings)) - internal.REACH_MARGIN;
      // an even and an odd pixel, for the 2x2 blocks of two-level smoothing
      [[120, 120], [121, 131]].forEach(function(p) {
        var spread = measureSpread(terrain || steep, stage, settings, key, p[0], p[1]);
        assert(spread > 0, 'the change should have an effect');
        assert(spread <= reach, 'changes spread ' + spread + ' pixels, beyond the reach of ' + reach);
      });
    }

    [
      ['low', {}],
      ['medium', {}],
      ['medium', {radius: 7, rounds: 2}],
      ['high', {}]
    ].forEach(function(o) {
      it('smoothing: ' + o[0] + ' ' + JSON.stringify(o[1]), function () {
        assertWithinReach('smooth', smoothingSettings(o[0], o[1]), 'elev');
      });
    });

    [
      ['medium', DYNAMIC],
      ['high', Object.assign({blendRange: [5, 15]}, DYNAMIC)]
    ].forEach(function(o) {
      it('dynamic smoothing: ' + o[0] + ' ' + JSON.stringify(o[1]), function () {
        assertWithinReach('smooth', smoothingSettings(o[0], o[1]), 'elev', gentleTerrain);
      });
    });

    it('dynamic smoothing thresholds', function () {
      assertWithinReach('smooth', smoothingSettings('medium', DYNAMIC), 'thresholds', gentleTerrain);
    });

    [
      {},
      {ambient: 0, sharpening: 0},
      {lightAdjust: 30},
      {texture: 0.5, textureHighlights: 0.5},
      {sharpening: 1, sharpenRadius: 8},
      {minElevation: 0, texture: 0.4}
    ].forEach(function(o) {
      it('shading: ' + JSON.stringify(o), function () {
        assertWithinReach('shade', shadingSettings(o), 'tones');
      });
    });
  });

  it('too small a margin changes the result (the comparison detects seams)', function () {
    var tiles = internal.getGridTiles(grid.width, grid.height, 2, 2, 5, true);
    var r = runWholeAndTiled(grid, 'smooth', smoothingSettings('medium'), tiles, 'elev');
    assert(countDifferences(r.whole, r.tiled) > 0);
  });
});
