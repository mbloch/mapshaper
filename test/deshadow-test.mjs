import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var deg = Math.PI / 180;

// Deterministic noise in [-1, 1]
function noise(i) {
  var x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function flatGrid(w, h, fn) {
  var Z = new Float32Array(w * h);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) Z[y * w + x] = fn ? fn(x, y) : 0;
  return Z;
}

// Flat ground with a few mesas of different heights
function mesas(x, y) {
  if (x >= 40 && x < 70 && y >= 40 && y < 70) return 30;
  if (x >= 95 && x < 115 && y >= 60 && y < 120) return 20;
  if (x >= 30 && x < 60 && y >= 100 && y < 120) return 15;
  return 0;
}

// A lat-long dataset with an elevation layer and an RGB image of the same
// grid, with the mesas' shadows darkened
// @surfaceFn optional function(x, y) returning {lit, gains} of the ground
// @cell optional cell size in degrees (default about 1.1 m)
function makeDataset(w, h, elevFn, sun, gains, surfaceFn, cell) {
  cell = cell || 0.00001;
  var bbox = [0, 0, w * cell, h * cell];
  var transform = [cell, 0, 0, 0, -cell, bbox[3]];
  var Z = flatGrid(w, h, elevFn);
  var cellM = cell * 6371008.8 * Math.PI / 180;
  var shadow = sun ? internal.castTerrainShadow(Z, w, h, cellM, cellM, sun) : new Uint8Array(w * h);
  var img = new Uint8Array(w * h * 3);
  var ground = {lit: [150, 120, 90], gains: gains || [3.5, 2.8, 2]};
  for (var i = 0; i < w * h; i++) {
    var s = surfaceFn ? surfaceFn(i % w, Math.floor(i / w)) : ground;
    for (var k = 0; k < 3; k++) {
      var v = s.lit[k] * (1 + 0.12 * noise(i * 3 + k));
      img[i * 3 + k] = Math.round(shadow[i] ? v / s.gains[k] : v);
    }
  }
  return {
    info: {crs_string: 'wgs84'},
    shadow: shadow,
    layers: [{
      name: 'elev',
      raster_type: 'grid',
      raster: {
        sourceId: 'dem',
        interpretation: 'continuous',
        grid: {width: w, height: h, bands: 1, pixelType: 'float32', samples: Z,
          sampleBands: [0], nodata: null, bbox: bbox, transform: transform},
        derivation: {type: 'gray', sourceId: 'dem', bands: [0]},
        view: {recipe: {type: 'gray', bands: [0]}}
      }
    }, {
      name: 'img',
      raster_type: 'grid',
      raster: {
        sourceId: 'img',
        interpretation: 'image',
        grid: {width: w, height: h, bands: 3, pixelType: 'uint8', samples: img,
          sampleBands: [0, 1, 2], nodata: null, bbox: bbox.concat(), transform: transform.concat()}
      }
    }]
  };
}

async function run(dataset, commands) {
  var catalog = new internal.Catalog().addDataset(dataset);
  var job = new internal.Job(catalog);
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return catalog;
}

function findLayer(catalog, name) {
  var o = catalog.getLayers().find(function(o) { return o.layer.name == name; });
  return o && o.layer;
}

function meanColor(samples, select) {
  var sum = [0, 0, 0], n = 0;
  for (var i = 0; i < samples.length / 3; i++) {
    if (!select(i)) continue;
    n++;
    for (var k = 0; k < 3; k++) sum[k] += samples[i * 3 + k];
  }
  return sum.map(function(v) { return v / n; });
}

describe('mapshaper-deshadow.mjs', function () {

  describe('castTerrainShadow()', function () {
    // a 10 m wall at x = 25; with the sun in the east at 45 degrees, its
    // shadow is 10 m long, to the west
    function wall(x) { return x == 25 ? 10 : 0; }
    var sun = {azimuth: 90 * deg, altitude: 45 * deg};

    it('shades the ground away from the sun, to the length of the shadow', function () {
      var w = 40, h = 3;
      var s = internal.castTerrainShadow(flatGrid(w, h, wall), w, h, 1, 1, sun);
      var row = Array.from(s.subarray(w, 2 * w));
      assert.deepEqual(row.slice(16, 25), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
      assert.equal(row[14], 0);
      assert.equal(row[26], 0);
    });

    it('uses the ground size of cells in each direction', function () {
      var w = 40, h = 3;
      var s = internal.castTerrainShadow(flatGrid(w, h, wall), w, h, 2, 1, sun);
      var row = Array.from(s.subarray(w, 2 * w));
      assert.deepEqual(row.slice(21, 25), [1, 1, 1, 1]);
      assert.equal(row[19], 0);
    });

    it('treats NaN cells as having no terrain', function () {
      var w = 40, h = 3;
      var Z = flatGrid(w, h, wall);
      Z[w + 20] = NaN;
      var s = internal.castTerrainShadow(Z, w, h, 1, 1, sun);
      assert.equal(s[w + 20], 0);
      assert.equal(s[w + 21], 1);
    });
  });

  describe('getSolarDeclination()', function () {
    it('is about 23.4 at the solstices and 0 at the equinoxes', function () {
      assert(Math.abs(internal.getSolarDeclination(172) - 23.44) < 0.2);
      assert(Math.abs(internal.getSolarDeclination(355) + 23.44) < 0.2);
      assert(Math.abs(internal.getSolarDeclination(80)) < 0.6);
      assert(Math.abs(internal.getSolarDeclination(266)) < 0.6);
    });
  });

  describe('getSunPosition()', function () {
    it('puts the sun due south at noon, at 90 - latitude + declination', function () {
      var p = internal.getSunPosition(35, 23.44, 0);
      assert(Math.abs(p.azimuth - 180) < 1e-9);
      assert(Math.abs(p.altitude - 78.44) < 1e-9);
    });

    it('puts the morning sun in the east, mirroring the afternoon', function () {
      var am = internal.getSunPosition(35, 10, -45);
      var pm = internal.getSunPosition(35, 10, 45);
      assert(am.azimuth > 90 && am.azimuth < 180);
      assert(Math.abs(am.azimuth + pm.azimuth - 360) < 1e-9);
      assert(Math.abs(am.altitude - pm.altitude) < 1e-9);
      assert(am.altitude > 20 && am.altitude < 78.44);
    });

    it('puts the noon sun due north south of the tropics', function () {
      var p = internal.getSunPosition(-35, 0, 0);
      assert(Math.abs(p.azimuth % 360) < 1e-9);
      assert(Math.abs(p.altitude - 55) < 1e-9);
    });
  });

  describe('fitSunPosition()', function () {
    it('finds the time of day along the sun\'s path', function () {
      var w = 150, h = 150;
      var Z = flatGrid(w, h, mesas);
      var path = {latitude: 35, declination: -8};
      var pos = internal.getSunPosition(35, -8, -35);
      var shadow = internal.castTerrainShadow(Z, w, h, 1, 1,
        {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      var fit = internal.fitSunPosition(Z, Float32Array.from(shadow), w, h, 1, 1,
        {x0: 0, y0: 0, x1: w, y1: h}, null, path);
      assert(Math.abs(fit.hour + 35) < 2, 'hour ' + fit.hour);
      assert(Math.abs(fit.azimuth / deg - pos.azimuth) < 3);
      assert(fit.score > 0.8);
    });

    it('searches a range of declinations', function () {
      var w = 150, h = 150;
      var Z = flatGrid(w, h, mesas);
      var pos = internal.getSunPosition(35, 12, -35);
      var shadow = internal.castTerrainShadow(Z, w, h, 1, 1,
        {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      var fit = internal.fitSunPosition(Z, Float32Array.from(shadow), w, h, 1, 1,
        {x0: 0, y0: 0, x1: w, y1: h}, null, {latitude: 35, declinations: [0, 20]});
      assert(fit.declination >= 0 && fit.declination <= 20);
      assert(Math.abs(fit.azimuth / deg - pos.azimuth) < 3, 'azimuth ' + fit.azimuth / deg);
      assert(Math.abs(fit.altitude / deg - pos.altitude) < 3, 'altitude ' + fit.altitude / deg);
    });

    it('finds the sun position of shadows', function () {
      var w = 150, h = 150;
      var Z = flatGrid(w, h, mesas);
      var sun = {azimuth: 150 * deg, altitude: 35 * deg};
      var shadow = internal.castTerrainShadow(Z, w, h, 1, 1, sun);
      var darkness = Float32Array.from(shadow);
      var fit = internal.fitSunPosition(Z, darkness, w, h, 1, 1, {x0: 0, y0: 0, x1: w, y1: h});
      assert(Math.abs(fit.azimuth / deg - 150) < 4, 'azimuth ' + fit.azimuth / deg);
      assert(Math.abs(fit.altitude / deg - 35) < 4, 'altitude ' + fit.altitude / deg);
      assert(fit.score > 0.8);
    });

    it('scores -1 when the terrain casts no shadows', function () {
      var w = 40, h = 40;
      var fit = internal.fitSunPosition(flatGrid(w, h), new Float32Array(w * h).fill(1), w, h, 1, 1,
        {x0: 0, y0: 0, x1: w, y1: h});
      assert.equal(fit.score, -1);
    });
  });

  describe('lowerSunAltitude()', function () {
    var w = 150, h = 150, region = {x0: 0, y0: 0, x1: w, y1: h};
    var sun = {azimuth: 150 * deg, altitude: 45 * deg};
    function darkAt(altitude) {
      var Z = flatGrid(w, h, mesas);
      return Float32Array.from(internal.castTerrainShadow(Z, w, h, 1, 1,
        {azimuth: sun.azimuth, altitude: altitude * deg}));
    }

    it('lowers the sun to the extent of the dark areas', function () {
      var Z = flatGrid(w, h, mesas);
      var out = internal.lowerSunAltitude(Z, darkAt(35), w, h, 1, 1, region, sun);
      assert(Math.abs(out.altitude / deg - 35) <= 1, 'altitude ' + out.altitude / deg);
      assert.equal(out.azimuth, sun.azimuth);
    });

    it('keeps the sun when the shadows beyond its own are lit', function () {
      var Z = flatGrid(w, h, mesas);
      var out = internal.lowerSunAltitude(Z, darkAt(45), w, h, 1, 1, region, sun);
      assert(Math.abs(out.altitude / deg - 45) < 1e-9, 'altitude ' + out.altitude / deg);
    });
  });

  describe('getShadowMask()', function () {
    // 0.6 m pixels: a 60 x 60 px shadow in the DEM's shadow, with 4 x 4 px
    // dark spots (tree shadows) next to it
    var W = 200, H = 160;
    function scene(darkFn) {
      var L = new Float32Array(W * H), predicted = new Uint8Array(W * H);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var i = y * W + x;
        predicted[i] = x >= 40 && x < 100 && y >= 50 && y < 110 ? 1 : 0;
        L[i] = darkFn(x, y) ? 30 : 120;
      }
      return {L: L, predicted: predicted, valid: new Uint8Array(W * H).fill(1)};
    }
    function treeSpot(x, y) { return x >= 110 && x < 114 && (y % 12) < 4; }
    function bigShadow(x, y) { return x >= 40 && x < 100 && y >= 50 && y < 110; }

    it('keeps terrain shadows and leaves out tree shadows', function () {
      var s = scene(function(x, y) { return bigShadow(x, y) || treeSpot(x, y); });
      var mask = internal.getShadowMask(s.L, null, s.valid, s.predicted, W, H, 0.6, 24);
      assert.equal(mask.hard[80 * W + 70], 1);
      assert.equal(mask.hard[52 * W + 42], 1);
      assert.equal(mask.hard[50 * W + 111], 0);
      assert.equal(mask.hard[61 * W + 112], 0);
    });

    it('leaves out dark areas that are bright in near-infrared', function () {
      var s = scene(bigShadow);
      var nir = new Float32Array(W * H).fill(140);
      var mask = internal.getShadowMask(s.L, nir, s.valid, s.predicted, W, H, 0.6, 24);
      assert.equal(mask.count, 0);
      for (var i = 0; i < nir.length; i++) if (s.L[i] < 100) nir[i] = 15;
      mask = internal.getShadowMask(s.L, nir, s.valid, s.predicted, W, H, 0.6, 24);
      assert.equal(mask.hard[80 * W + 70], 1);
    });
  });

  describe('removeUnmatchedAreas()', function () {
    it('removes areas mostly outside the DEM\'s shadows', function () {
      var W = 20, H = 5;
      var mask = new Uint8Array(W * H), predicted = new Uint8Array(W * H);
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < 4; x++) mask[y * W + x] = predicted[y * W + x] = 1;
        for (x = 10; x < 14; x++) mask[y * W + x] = 1;
      }
      predicted[10] = 1;
      internal.removeUnmatchedAreas(mask, predicted, W, H, 0);
      assert.equal(mask[0], 1);
      assert.equal(mask[2 * W + 3], 1);
      assert.equal(mask[2 * W + 12], 0);
    });
  });

  describe('isCoarseTerrain()', function () {
    var W = 120, H = 120;
    // bilinear interpolation of fn's values at every fx-th column and fy-th row
    function stretch(fn, fx, fy) {
      return function(x, y) {
        var u = x / fx, v = y / fy, x0 = Math.floor(u), y0 = Math.floor(v), s = u - x0, t = v - y0;
        return (fn(x0, y0) * (1 - s) + fn(x0 + 1, y0) * s) * (1 - t) +
          (fn(x0, y0 + 1) * (1 - s) + fn(x0 + 1, y0 + 1) * s) * t;
      };
    }
    // noise at several scales, with relief growing with scale as in real terrain
    function terrain(x, y) {
      return [1, 2, 4, 8, 16, 32].reduce(function(z, scale) {
        return z + Math.pow(scale, 1.5) * stretch(function(i, j) { return noise(j * 1000 + i + 7); }, scale, scale)(x + 50, y + 50);
      }, 0);
    }
    function isCoarse(fn) {
      return internal.isCoarseTerrain({Z: flatGrid(W, H, fn), width: W, height: H});
    }

    it('is false for a DEM with detail at the scale of its cells', function () {
      assert.equal(isCoarse(terrain), false);
    });

    it('is true for a DEM resampled from larger cells', function () {
      assert.equal(isCoarse(stretch(terrain, 3, 3)), true);
    });

    it('is true for a DEM with rows repeated by nearest-neighbor resampling', function () {
      var rowsRepeated = stretch(terrain, 3, 1);
      assert.equal(isCoarse(function(x, y) { return rowsRepeated(x, Math.floor(y / 3)); }), true);
    });
  });

  describe('-deshadow', function () {
    var sun = {azimuth: 135 * deg, altitude: 40 * deg};

    it('brightens terrain shadows to the color of sunlit ground', async function () {
      var dataset = makeDataset(150, 150, mesas, sun);
      var shadow = dataset.shadow;
      var src = dataset.layers[1].raster.grid.samples.slice();
      var catalog = await run(dataset, '-deshadow elev target=img');
      var out = findLayer(catalog, 'img').raster;
      var samples = out.grid.samples;
      var lit = meanColor(src, function(i) { return !shadow[i]; });
      var before = meanColor(src, function(i) { return shadow[i]; });
      var after = meanColor(samples, function(i) { return shadow[i]; });
      for (var k = 0; k < 3; k++) {
        assert(before[k] < lit[k] * 0.6);
        assert(Math.abs(after[k] - lit[k]) < lit[k] * 0.15, 'band ' + k + ': ' + after[k] + ' vs ' + lit[k]);
      }
      assert.equal(out.derivation.type, 'deshadow');
      assert(Math.abs(out.derivation.sun_azimuth - 135) < 6);
      assert(Math.abs(out.derivation.sun_altitude - 40) < 6);
    });

    it('date= fits the sun along its path that day', async function () {
      // the test grid is on the equator
      var pos = internal.getSunPosition(0, internal.getSolarDeclination(172), -40);
      var dataset = makeDataset(150, 150, mesas, {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      var shadow = dataset.shadow;
      var src = dataset.layers[1].raster.grid.samples.slice();
      var catalog = await run(dataset, '-deshadow elev target=img date=2023-06-21');
      var out = findLayer(catalog, 'img').raster;
      var lit = meanColor(src, function(i) { return !shadow[i]; });
      var after = meanColor(out.grid.samples, function(i) { return shadow[i]; });
      assert.equal(out.derivation.date, '2023-06-21');
      assert(Math.abs(out.derivation.sun_azimuth - pos.azimuth) < 4);
      assert(Math.abs(out.derivation.sun_altitude - pos.altitude) < 4);
      for (var k = 0; k < 3; k++) {
        assert(Math.abs(after[k] - lit[k]) < lit[k] * 0.15, 'band ' + k + ': ' + after[k] + ' vs ' + lit[k]);
      }
    });

    it('uses the date of imagery from -fetch', async function () {
      var pos = internal.getSunPosition(0, internal.getSolarDeclination(172), -40);
      var dataset = makeDataset(150, 150, mesas, {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      dataset.info.raster_sources = [{id: 'naip', acquisitions: {type: 'states', complete: true,
        groups: [{state: 'AZ', year: 2023, start: '2023-06-20', end: '2023-06-22', images: 2}]}}];
      var catalog = await run(dataset, '-deshadow elev target=img');
      assert.equal(findLayer(catalog, 'img').raster.derivation.date, '2023-06-20/2023-06-22');
    });

    it('fits the sun to imagery taken over several weeks', async function () {
      var pos = internal.getSunPosition(0, internal.getSolarDeclination(240), -40);
      var dataset = makeDataset(150, 150, mesas, {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      dataset.info.raster_sources = [{id: 'naip', acquisitions: {type: 'states', complete: true,
        groups: [{state: 'WA', year: 2013, start: '2013-08-06', end: '2013-09-14', images: 30}]}}];
      var catalog = await run(dataset, '-deshadow elev target=img');
      var out = findLayer(catalog, 'img').raster;
      assert.equal(out.derivation.date, '2013-08-06/2013-09-14');
      assert(Math.abs(out.derivation.sun_azimuth - pos.azimuth) < 4);
      assert(Math.abs(out.derivation.sun_altitude - pos.altitude) < 4);
    });

    it('brightens shadows on each kind of ground by its own amount', async function () {
      // shadows darken the green ground on the right less than the bare
      // ground on the left (11 m pixels, as in NAIP map tiles); the ground
      // changes away from the far edges of the shadows, where shadows are
      // compared with the sunlit ground beyond them
      var left = {lit: [150, 120, 90], gains: [3.5, 2.8, 2]};
      var right = {lit: [80, 110, 70], gains: [2.6, 2.3, 1.9]};
      var dataset = makeDataset(150, 150, function(x, y) { return mesas(x, y) * 10; }, sun, null,
        function(x) { return x < 70 ? left : right; }, 0.0001);
      var shadow = dataset.shadow;
      var src = dataset.layers[1].raster.grid.samples.slice();
      var catalog = await run(dataset, '-deshadow elev target=img');
      var samples = findLayer(catalog, 'img').raster.grid.samples;
      [function(i) { return i % 150 < 70; }, function(i) { return i % 150 >= 80; }].forEach(function(side) {
        var lit = meanColor(src, function(i) { return side(i) && !shadow[i]; });
        var after = meanColor(samples, function(i) { return side(i) && shadow[i]; });
        for (var k = 0; k < 3; k++) {
          assert(Math.abs(after[k] - lit[k]) < lit[k] * 0.08, 'band ' + k + ': ' + after[k] + ' vs ' + lit[k]);
        }
      });
    });

    it('rejects a malformed date=', async function () {
      var dataset = makeDataset(30, 30, null, null);
      await assert.rejects(run(dataset, '-deshadow elev target=img date=6/21/2023'), /date=/);
    });

    it('leaves dark areas unchanged if they aren\'t colored like shadows', async function () {
      // brightening them would take more blue than red
      var dataset = makeDataset(150, 150, mesas, sun, [2, 2.4, 3]);
      var src = dataset.layers[1].raster.grid.samples.slice();
      var catalog = await run(dataset, '-deshadow elev target=img');
      assert.deepEqual(Array.from(findLayer(catalog, 'img').raster.grid.samples), Array.from(src));
    });

    it('leaves sunlit pixels away from shadows unchanged', async function () {
      var dataset = makeDataset(150, 150, mesas, sun);
      var src = dataset.layers[1].raster.grid.samples.slice();
      var catalog = await run(dataset, '-deshadow elev target=img');
      var samples = findLayer(catalog, 'img').raster.grid.samples;
      // the far corner is lit ground, away from the shadows
      for (var y = 0; y < 15; y++) for (var x = 135; x < 150; x++) {
        var i = (y * 150 + x) * 3;
        assert.deepEqual(Array.from(samples.subarray(i, i + 3)), Array.from(src.subarray(i, i + 3)));
      }
    });

    it('leaves the image layer in place when the terrain is flat', async function () {
      var dataset = makeDataset(60, 60, null, null);
      var img = dataset.layers[1];
      var catalog = await run(dataset, '-deshadow elev target=img name=fixed');
      assert.strictEqual(findLayer(catalog, 'img'), img);
      assert(!findLayer(catalog, 'fixed'));
      assert.notEqual(img.raster.derivation && img.raster.derivation.type, 'deshadow');
    });

    it('+ adds no layer when the image can\'t be relit', async function () {
      var dataset = makeDataset(60, 60, null, null);
      var catalog = await run(dataset, '-deshadow elev target=img + name=fixed');
      assert(findLayer(catalog, 'img'));
      assert(!findLayer(catalog, 'fixed'));
    });

    it('+ name= keeps the original layer', async function () {
      var dataset = makeDataset(150, 150, mesas, sun);
      var catalog = await run(dataset, '-deshadow elev target=img + name=fixed');
      assert(findLayer(catalog, 'img'));
      assert.equal(findLayer(catalog, 'fixed').raster.derivation.type, 'deshadow');
    });

    it('requires an elevation layer', async function () {
      var dataset = makeDataset(30, 30, null, null);
      await assert.rejects(run(dataset, '-deshadow target=img'), /elevation layer/);
    });
  });
});
