import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var deg = Math.PI / 180;
var TEST_LATITUDE = 40;

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
  var dataset = gridDataset(w, h, Z, img, cell);
  dataset.shadow = shadow;
  return dataset;
}

// bilinear interpolation of fn's values at every fx-th column and fy-th row
function stretch(fn, fx, fy) {
  return function(x, y) {
    var u = x / fx, v = y / fy, x0 = Math.floor(u), y0 = Math.floor(v), s = u - x0, t = v - y0;
    return (fn(x0, y0) * (1 - s) + fn(x0 + 1, y0) * s) * (1 - t) +
      (fn(x0, y0 + 1) * (1 - s) + fn(x0 + 1, y0 + 1) * s) * t;
  };
}

// noise at several scales, with relief growing with scale as in real terrain
function hills(x, y) {
  return [2, 4, 8, 16].reduce(function(z, scale) {
    return z + 60 * scale * stretch(function(i, j) { return noise(j * 1000 + i + 7 * scale); }, scale, scale)(x, y);
  }, 0);
}

// Hills lit by the sun of @sunFn(x, y), with the image's brightness following
// the model in mapshaper-deshadow.mjs (c of 0.35, 0.45, 0.6), on @cell degree
// pixels, with the hills' heights multiplied by @relief (default 1)
function makeLitDataset(w, h, sunFn, cell, relief) {
  var Z = flatGrid(w, h, function(x, y) { return hills(x, y) * (relief || 1); });
  var cellM = cell * 6371008.8 * Math.PI / 180;
  var nrm = internal.getNormals(Z, w, h, cellM, cellM);
  var shadows = new Map();
  var img = new Uint8Array(w * h * 3), lit = [0.3, 0.25, 0.2], c = [0.35, 0.45, 0.6];
  for (var i = 0; i < w * h; i++) {
    var sun = sunFn(i % w, Math.floor(i / w));
    if (!shadows.has(sun)) shadows.set(sun, internal.castTerrainShadow(Z, w, h, cellM, cellM, sun));
    var I = shadows.get(sun)[i] ? 0 : Math.max(0, nrm.x[i] * Math.sin(sun.azimuth) * Math.cos(sun.altitude) +
      nrm.y[i] * Math.cos(sun.azimuth) * Math.cos(sun.altitude) + nrm.z[i] * Math.sin(sun.altitude));
    if (I !== I) I = Math.sin(sun.altitude);
    for (var k = 0; k < 3; k++) {
      var v = lit[k] * (I + c[k]) / (Math.sin(sun.altitude) + c[k]) * (1 + 0.1 * noise(i * 3 + k));
      img[i * 3 + k] = Math.round(255 * Math.min(1, Math.pow(v, 1 / 2.2)));
    }
  }
  return gridDataset(w, h, Z, img, cell);
}

// Rolling hills on 4 m pixels, with a 30-50 m high block every 160 m, lit by
// @sun; the ground is darker on slopes facing away from the sun (as forest
// often is), which brightness scores match better with a lower sun
function makeAspectDataset(w, h, sun) {
  var cellM = 4, cell = cellM / (6371008.8 * deg);
  var Z = flatGrid(w, h, function(x, y) {
    var z = [8, 16, 32].reduce(function(z, scale) {
      return z + scale * stretch(function(i, j) { return noise(j * 1000 + i + 7 * scale); }, scale, scale)(x, y);
    }, 0);
    var k = Math.floor(y / 40) * 100 + Math.floor(x / 40);
    var s = 12 + 6 * (1 + noise(k * 5 + 1)), ox = 8 + 5 * (1 + noise(k * 5 + 2)), oy = 8 + 5 * (1 + noise(k * 5 + 3));
    var block = x % 40 >= ox && x % 40 < ox + s && y % 40 >= oy && y % 40 < oy + s;
    return block ? z + 40 + 10 * noise(k * 5 + 4) : z;
  });
  var nrm = internal.getNormals(Z, w, h, cellM, cellM);
  var shadow = internal.castTerrainShadow(Z, w, h, cellM, cellM, sun);
  var sx = Math.sin(sun.azimuth), sy = Math.cos(sun.azimuth);
  var img = new Uint8Array(w * h * 3), lit = [0.3, 0.25, 0.2], c = [0.35, 0.45, 0.6];
  for (var i = 0; i < w * h; i++) {
    var facing = nrm.x[i] * sx + nrm.y[i] * sy;
    var I = shadow[i] ? 0 : Math.max(0, facing * Math.cos(sun.altitude) + nrm.z[i] * Math.sin(sun.altitude));
    if (I !== I) {
      I = Math.sin(sun.altitude);
      facing = 0;
    }
    var albedo = Math.exp(1.2 * Math.max(-1, Math.min(1, facing * 3)));
    for (var k = 0; k < 3; k++) {
      var v = albedo * lit[k] * (I + c[k]) / (Math.sin(sun.altitude) + c[k]) * (1 + 0.1 * noise(i * 3 + k));
      img[i * 3 + k] = Math.round(255 * Math.min(1, Math.pow(v, 1 / 2.2)));
    }
  }
  return gridDataset(w, h, Z, img, cell);
}

// A lat-long dataset with an elevation layer and an RGB image of the same
// grid, at TEST_LATITUDE (where the tests' suns can be), with square cells
function gridDataset(w, h, Z, img, cell) {
  var cellX = cell / Math.cos(TEST_LATITUDE * deg);
  var bbox = [0, TEST_LATITUDE, w * cellX, TEST_LATITUDE + h * cell];
  var transform = [cellX, 0, 0, 0, -cell, bbox[3]];
  return {
    info: {crs_string: 'wgs84'},
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

// Brightness of sunlit and shadowed cells (shadows lit by the sky), with noise
function shadowBrightness(shadow) {
  return Float32Array.from(shadow, function(s, i) { return (s ? 0.2 : 1) * (1 + 0.1 * noise(i)); });
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
      var fit = internal.fitSunPosition(Z, shadowBrightness(shadow), w, h, 1, 1,
        {x0: 0, y0: 0, x1: w, y1: h}, null, path);
      assert(Math.abs(fit.hour + 35) < 2, 'hour ' + fit.hour);
      assert(Math.abs(fit.azimuth / deg - pos.azimuth) < 3);
      assert(fit.score > 0.6, 'score ' + fit.score);
    });

    it('searches a range of declinations', function () {
      var w = 150, h = 150;
      var Z = flatGrid(w, h, mesas);
      var pos = internal.getSunPosition(35, 12, -35);
      var shadow = internal.castTerrainShadow(Z, w, h, 1, 1,
        {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      var fit = internal.fitSunPosition(Z, shadowBrightness(shadow), w, h, 1, 1,
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
      var fit = internal.fitSunPosition(Z, shadowBrightness(shadow), w, h, 1, 1, {x0: 0, y0: 0, x1: w, y1: h});
      assert(Math.abs(fit.azimuth / deg - 150) < 4, 'azimuth ' + fit.azimuth / deg);
      assert(Math.abs(fit.altitude / deg - 35) < 4, 'altitude ' + fit.altitude / deg);
      assert(fit.score > 0.6, 'score ' + fit.score);
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

  describe('getEdgeAltitude()', function () {
    var w = 150, h = 150, region = {x0: 0, y0: 0, x1: w, y1: h}, azimuth = 150 * deg;
    function edgeAltitude(Z, altitude) {
      var shadow = internal.castTerrainShadow(Z, w, h, 1, 1, {azimuth: azimuth, altitude: altitude * deg});
      var level = internal.getFitLevel(Z, shadowBrightness(shadow), w, h, 1, 1, region, w * h, 60);
      return internal.getEdgeAltitude(level, azimuth);
    }

    it('finds the altitude at which the edges of cast shadows are the most distinct', function () {
      var Z = flatGrid(w, h, mesas);
      assert.equal(edgeAltitude(Z, 35), 35);
      assert.equal(edgeAltitude(Z, 50), 50);
    });

    it('is null when the terrain casts no shadows', function () {
      assert.strictEqual(edgeAltitude(flatGrid(w, h), 35), null);
    });
  });

  describe('getFitLevel()', function () {
    it('divides the region into about the same number of tiles whatever its cell size', function () {
      var w = 400, h = 400, Z = new Float32Array(w * h), region = {x0: 0, y0: 0, x1: w, y1: h};
      [0.5, 5, 30].forEach(function(cell) {
        var level = internal.getFitLevel(Z, Z, w, h, cell, cell, region, w * h, 60);
        var tiles = Math.ceil(level.w / level.tile) * Math.ceil(level.h / level.tile);
        assert(tiles > 150 && tiles < 350, 'tiles ' + tiles);
      });
    });
  });

  describe('getPairedZ()', function () {
    var base = Float32Array.from({length: 20}, function(v, t) { return 0.5 + 0.1 * noise(t); });
    function offset(d, spread) {
      return base.map(function(v, t) { return v + d + spread * noise(t + 100); });
    }

    it('is large when one set of scores is consistently higher', function () {
      assert(internal.getPairedZ(offset(0.02, 0.01), base) > 5);
      assert(internal.getPairedZ(base, offset(0.02, 0.01)) < -5);
    });

    it('is small when the differences are mostly noise', function () {
      assert(Math.abs(internal.getPairedZ(offset(0.002, 0.05), base)) < 2);
    });

    it('pairs only the given tiles, and skips tiles not scored in both', function () {
      var a = offset(0.02, 0.01), b = base.slice();
      for (var t = 0; t < 10; t++) a[t] = 0;
      b[10] = a[11] = NaN;
      var tiles = [10, 11, 12, 13, 14, 15];
      assert(internal.getPairedZ(a, b, tiles) > 5);
      assert.equal(internal.getPairedZ(a, b, [10, 11, 12, 13, 14]), -Infinity);
    });
  });

  describe('mergeAreaLabels()', function () {
    // 6 x 6 tiles, with vertical strips of 2 or 3 tiles labeled 0, 1 (and 2)
    var tw = 6, th = 6;
    function strips(n) {
      return Array.from({length: tw * th}, function(v, t) { return Math.floor((t % tw) * n / tw); });
    }
    // each sun's scores have their own noise
    function scores(k, fn) {
      return Float32Array.from({length: tw * th}, function(v, t) { return fn(t % tw) + 0.02 * noise(k * 100 + t); });
    }

    it('gives an area the sun of a neighboring area that matches it about as well', function () {
      var tileR = [scores(0, function() { return 0.5; }), scores(1, function(x) { return x < 3 ? 0.3 : 0.5; })];
      assert.deepEqual(Array.from(internal.mergeAreaLabels(strips(2), tw, th, tileR)), new Array(tw * th).fill(0));
    });

    it('keeps the areas whose suns match them significantly better', function () {
      var tileR = [scores(0, function(x) { return x < 3 ? 0.5 : 0.4; }),
        scores(1, function(x) { return x < 3 ? 0.4 : 0.5; })];
      assert.deepEqual(Array.from(internal.mergeAreaLabels(strips(2), tw, th, tileR)), strips(2));
    });

    it('takes the sun of the neighbor that matches the area best', function () {
      // the middle strip matches all three suns about as well, the third best
      var tileR = [
        scores(0, function(x) { return x < 2 ? 0.6 : x < 4 ? 0.49 : 0.3; }),
        scores(1, function(x) { return x < 2 ? 0.3 : x < 4 ? 0.5 : 0.3; }),
        scores(2, function(x) { return x < 2 ? 0.3 : x < 4 ? 0.51 : 0.6; })];
      var labels = internal.mergeAreaLabels(strips(3), tw, th, tileR);
      assert.deepEqual(Array.from(labels), strips(3).map(function(k) { return k == 0 ? 0 : 2; }));
    });
  });

  describe('labelTiles()', function () {
    // 6 x 6 tiles: the second sun matches the left half slightly better than
    // the first sun, and the right half slightly worse
    var tw = 6, th = 6;
    function tileScores(left, right) {
      return Float32Array.from({length: tw * th}, function(v, t) { return t % tw < 3 ? left : right; });
    }

    it('keeps the first sun unless another matches by the margin', function () {
      var tileR = [tileScores(0.5, 0.5), tileScores(0.52, 0.48)];
      assert.deepEqual(Array.from(internal.labelTiles(tileR, tw, th)), new Array(tw * th).fill(0));
    });

    it('gives each tile the best-matching sun with a margin of 0', function () {
      var tileR = [tileScores(0.5, 0.5), tileScores(0.52, 0.48)];
      var labels = internal.labelTiles(tileR, tw, th, 0);
      assert.deepEqual(Array.from(labels), Array.from(tileScores(1, 0)));
    });

    it('gives a small area the label of the tiles around it', function () {
      var tileR = [tileScores(0.5, 0.5), tileScores(0.4, 0.4)];
      tileR[1][2 * tw + 2] = tileR[1][2 * tw + 3] = 0.9;
      assert.deepEqual(Array.from(internal.labelTiles(tileR, tw, th, 0)), new Array(tw * th).fill(0));
    });
  });

  describe('addDemShadows()', function () {
    // the DEM's shadow is a 60 x 60 square; the mask misses its outer 3
    // pixels (the DEM's shadows are a few pixels off) and a bright patch
    // inside it (e.g. snow)
    var W = 100, H = 100;
    function scene() {
      var predicted = new Uint8Array(W * H), hard = new Uint8Array(W * H);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var i = y * W + x;
        predicted[i] = x >= 20 && x < 80 && y >= 20 && y < 80 ? 1 : 0;
        hard[i] = x >= 23 && x < 77 && y >= 23 && y < 77 && !(x >= 45 && x < 55 && y >= 45 && y < 55) ? 1 : 0;
      }
      return {predicted: predicted, mask: {hard: hard}, valid: new Uint8Array(W * H).fill(1)};
    }

    it('adds the DEM\'s shadows away from their edges', function () {
      var s = scene();
      internal.addDemShadows(s.mask, s.predicted, s.valid, W, H);
      assert.equal(s.mask.hard[50 * W + 50], 1);
      assert.equal(s.mask.dem[50 * W + 50], 1);
      assert.equal(s.mask.dem[50 * W + 30], 0);
    });

    it('marks the DEM\'s shadows near their edges as uncertain', function () {
      var s = scene();
      internal.addDemShadows(s.mask, s.predicted, s.valid, W, H);
      assert.equal(s.mask.hard[50 * W + 21], 0);
      assert.equal(s.mask.uncertain[50 * W + 21], 1);
      assert.equal(s.mask.uncertain[50 * W + 10], 0);
    });

    it('adds nothing when the mask mostly misses the DEM\'s shadows', function () {
      var s = scene();
      s.mask.hard.fill(0);
      for (var x = 23; x < 77; x++) s.mask.hard[50 * W + x] = 1;
      internal.addDemShadows(s.mask, s.predicted, s.valid, W, H);
      assert(!s.mask.dem);
      assert.equal(s.mask.hard[40 * W + 40], 0);
    });
  });

  describe('raiseEdgeLighting()', function () {
    // a shadow in the left half; the DEM's slopes face away from the sun in
    // the 4 sunlit columns next to it (lit at 0.15, not 0.6), where the image
    // shows sunlit ground, except in one column of darker ground
    var W = 60, H = 30, r = 4;
    var decode = Float32Array.from({length: 256}, function(v, k) { return Math.pow(k / 255, 2.2); });
    function scene() {
      var samples = new Uint8Array(W * H * 3), hard = new Uint8Array(W * H), litI = new Float32Array(W * H);
      for (var i = 0; i < W * H; i++) {
        var x = i % W, v = x < 30 ? 50 : x == 32 ? 90 : 170;
        hard[i] = x < 30 ? 1 : 0;
        litI[i] = x < 30 ? 0 : x < 34 ? 0.15 : 0.6;
        samples.fill(v, i * 3, i * 3 + 3);
      }
      return {lin: {samples: samples, bands: 3, decode: decode}, hard: hard, litI: litI};
    }

    it('lights sunlit ground next to the shadows as its luma shows', function () {
      var s = scene(), row = 15 * W;
      internal.raiseEdgeLighting(s.lin, new Uint8Array(W * H).fill(1), s.hard, s.litI, W, H, r);
      [30, 31, 33].forEach(function(x) {
        assert(Math.abs(s.litI[row + x] - 0.6) < 0.01, 'x ' + x + ': ' + s.litI[row + x]);
      });
      assert.equal(s.litI[row + 40], Math.fround(0.6));
      assert.equal(s.litI[row + 10], 0);
    });

    it('keeps the DEM\'s lighting of ground darker than the sunlit ground around it', function () {
      var s = scene();
      internal.raiseEdgeLighting(s.lin, new Uint8Array(W * H).fill(1), s.hard, s.litI, W, H, r);
      assert.equal(s.litI[15 * W + 32], Math.fround(0.15));
    });
  });

  describe('getBareShadowLightness()', function () {
    // shadow cores of three classes: dark rock (luma 30), snow (luma 80,
    // and 20 where there's vegetation nearby) and a class with few pixels
    var N = 1000;
    function scene() {
      var L = new Float32Array(N), cls = new Int8Array(N), bare = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        cls[i] = i < 500 ? 0 : i < 990 ? 1 : 2;
        bare[i] = i >= 700 && i < 900 ? 0 : 1;
        L[i] = cls[i] === 0 ? 30 : cls[i] === 1 ? (bare[i] ? 80 : 20) : 60;
      }
      return {L: L, cls: cls, bare: bare, valid: new Uint8Array(N).fill(1),
        edge: new Float32Array(N).fill(1), hard: new Uint8Array(N).fill(1)};
    }

    it('takes the median of each class\'s cores where they aren\'t near vegetation', function () {
      var s = scene(), classes = {cls: s.cls, lo: Float32Array.from([1, 2, 3])};
      var lo = internal.getBareShadowLightness(s.L, s.valid, s.edge, s.hard, classes, s.bare);
      assert.deepEqual(Array.from(lo), [30, 80, 3]);
    });
  });

  describe('excludeUncertain()', function () {
    it('sets uncertain sunlit and shadow samples between them', function () {
      var gap = Float32Array.from([0, 1, 0.3, 0, 1]);
      var out = internal.excludeUncertain(gap, Uint8Array.from([1, 1, 1, 0, 0]));
      assert.deepEqual(Array.from(out), [0.5, 0.5, Math.fround(0.3), 0, 1]);
      assert.equal(gap[0], 0);
    });
  });

  describe('fitGaussianMixture()', function () {
    var d = 3, n = 1000, X = new Float32Array(2 * n * d), A = [], B = [];
    for (var i = 0; i < 2 * n; i++) {
      for (var k = 0; k < d; k++) X[i * d + k] = (i < n ? 0 : 3) + 0.3 * noise(i * d + k);
      (i < n ? A : B).push(i);
    }

    it('scores rows higher under the mixture fitted to their own cluster', function () {
      var a = internal.getMixtureScorer(internal.fitGaussianMixture(X, d, A, 2), d);
      var b = internal.getMixtureScorer(internal.fitGaussianMixture(X, d, B, 2), d);
      assert(A.every(function(i) { return a(X, i) > b(X, i); }));
      assert(B.every(function(i) { return b(X, i) > a(X, i); }));
    });

    it('is deterministic', function () {
      assert.deepEqual(internal.fitGaussianMixture(X, d, A, 3), internal.fitGaussianMixture(X, d, A, 3));
    });
  });

  // 10 m walls running north-south at @walls (x); 1 m cells
  function wallTerrain(w, h, walls) {
    return {Z: flatGrid(w, h, function(x) { return walls.indexOf(x) > -1 ? 10 : 0; }),
      width: w, height: h, cellWidth: 1, cellHeight: 1};
  }

  describe('getPlausibleShadows()', function () {
    it('includes ground shadowed only by a lower sun, and no farther', function () {
      var w = 100, h = 40, t = wallTerrain(w, h, [60]), region = {x0: 0, y0: 0, x1: w, y1: h};
      // at 45 degrees the shadow is 10 m long; down to 30 degrees, 17 m
      var P = internal.getPlausibleShadows(t, region, [{azimuth: 90 * deg, altitude: 45 * deg}]);
      var row = 20 * w;
      assert.equal(P[row + 52], 1);
      assert.equal(P[row + 45], 1);
      assert.equal(P[row + 35], 0);
      assert.equal(P[row + 70], 0);
    });
  });

  describe('addSignatureShadows()', function () {
    // walls whose shadows at the fitted sun are in the mask; the two eastern
    // walls' shadows are longer, as if that part of the image were taken at a
    // lower sun
    var w = 240, h = 120, N = w * h, walls = [60, 120, 180, 230];
    var fitted = {azimuth: 90 * deg, altitude: 45 * deg}, lower = {azimuth: 90 * deg, altitude: 32 * deg};
    var t = wallTerrain(w, h, walls), region = {x0: 0, y0: 0, x1: w, y1: h};
    var predicted = internal.castTerrainShadow(t.Z, w, h, 1, 1, fitted);
    var low = internal.castTerrainShadow(t.Z, w, h, 1, 1, lower);
    var lit = [150, 120, 90], shade = [43, 43, 45], forest = [40, 62, 34];
    var missed = new Uint8Array(N), decoy = new Uint8Array(N), woods = new Uint8Array(N);
    var samples = new Uint8Array(N * 3), cells = new Int32Array(N), valid = new Uint8Array(N).fill(1);
    for (var i = 0; i < N; i++) {
      var x = i % w, y = Math.floor(i / w), c = lit;
      cells[i] = i;
      missed[i] = x > 150 && low[i] && !predicted[i] ? 1 : 0;
      // shadow-colored ground that no plausible sun shadows
      decoy[i] = x >= 85 && x < 100 && y >= 40 && y < 80 ? 1 : 0;
      // forest in the sun, both where no plausible sun shadows it and where one could
      woods[i] = x >= 104 && x < 108 && y >= 30 && y < 90 ? 1 : 0;
      if (predicted[i] || missed[i] || decoy[i]) c = shade;
      else if (woods[i] || x < 30) c = forest;
      for (var k = 0; k < 3; k++) samples[i * 3 + k] = Math.round(c[k] * (1 + 0.1 * noise(i * 3 + k)));
    }
    var image = {samples: samples, bands: 3, width: w, height: h};

    it('adds shadows a plausible sun explains, and not dark ground it doesn\'t', function () {
      var mask = {hard: predicted.slice()};
      var added = internal.addSignatureShadows(mask, image, valid, predicted, cells, t, region, [fitted],
        w, h, 4);
      var nMissed = 0, nFound = 0, wrong = 0;
      for (var i = 0; i < N; i++) {
        if (missed[i]) nMissed++;
        if (missed[i] && mask.hard[i]) nFound++;
        if (!missed[i] && !predicted[i] && mask.hard[i]) wrong++;
      }
      assert(nFound >= nMissed * 0.9, nFound + ' of ' + nMissed);
      assert(decoy.every(function(v, i) { return !v || !mask.hard[i]; }));
      assert(woods.every(function(v, i) { return !v || !mask.hard[i]; }));
      assert(wrong <= added * 0.05, wrong + ' of ' + added);
    });

    it('adds nothing without enough sunlit ground to learn from', function () {
      var mask = {hard: predicted.slice()};
      var allValid = valid.map(function(v, i) { return i % w < 150 ? 0 : 1; });
      assert.equal(internal.addSignatureShadows(mask, image, allValid, predicted, cells, t, region, [fitted],
        w, h, 40), 0);
    });
  });

  describe('fillEmptyCells()', function () {
    it('fills empty cells outward from the cells that have values', function () {
      var grid = Float32Array.from([2, NaN, NaN, NaN, NaN, NaN]);
      internal.fillEmptyCells(grid, 3, 2, 0);
      assert.deepEqual(Array.from(grid), [2, 2, 2, 2, 2, 2]);
      grid = Float32Array.from([1, NaN, 3]);
      internal.fillEmptyCells(grid, 3, 1, 0);
      assert.deepEqual(Array.from(grid), [1, 2, 3]);
    });

    it('uses the fallback when no cell has a value', function () {
      var grid = new Float32Array(4).fill(NaN);
      internal.fillEmptyCells(grid, 2, 2, 7);
      assert.deepEqual(Array.from(grid), [7, 7, 7, 7]);
    });
  });

  describe('isPossibleSun()', function () {
    it('allows the sun only where it can be on some day of the year', function () {
      assert(internal.isPossibleSun(40, 180 * deg, 50 * deg));
      assert(internal.isPossibleSun(40, 180 * deg, 74 * deg));
      assert(!internal.isPossibleSun(40, 180 * deg, 76 * deg));
      assert(internal.isPossibleSun(40, 90 * deg, 20 * deg));
      assert(!internal.isPossibleSun(40, 0, 30 * deg));
      assert(internal.isPossibleSun(-40, 0, 50 * deg));
    });
  });

  describe('getAgreementThreshold()', function () {
    // luma of shadowed pixels spread evenly over @shadow, of sunlit ones over
    // @lit: [min, max, step]
    function threshold(shadow, lit, balanced) {
      var L = [], predicted = [], v;
      for (v = shadow[0]; v < shadow[1]; v += shadow[2]) { L.push(v); predicted.push(1); }
      for (v = lit[0]; v < lit[1]; v += lit[2]) { L.push(v); predicted.push(0); }
      return internal.getAgreementThreshold(Float32Array.from(L), Uint8Array.from(predicted),
        new Uint8Array(L.length).fill(1), balanced);
    }

    it('misclassifies the fewest pixels, or with balanced, the smallest shares', function () {
      // 900 shadowed pixels from 20 to 170, 100 sunlit ones from 150 to 200
      assert.equal(threshold([20, 170, 1 / 6], [150, 200, 0.5]), 170.5);
      assert.equal(threshold([20, 170, 1 / 6], [150, 200, 0.5], true), 149.5);
    });

    it('is balanced if counting would put most sunlit pixels in shadow', function () {
      assert.equal(threshold([20, 220, 0.2], [150, 200, 0.5]), 149.5);
    });
  });

  describe('getDataSpacing()', function () {
    // terrain with detail at every scale
    function terrain(x, y) {
      return [1, 2, 4, 8, 16, 32].reduce(function(z, scale) {
        return z + 20 * Math.pow(scale, 1.25) *
          stretch(function(i, j) { return noise(j * 1000 + i + 7 * scale); }, scale, scale)(x, y);
      }, 0);
    }
    function grid(fn) {
      return {samples: flatGrid(300, 300, fn), bands: 1, width: 300, height: 300, nodata: null};
    }

    it('is 1 for a grid with detail at its own cells', function () {
      assert.equal(internal.getDataSpacing(grid(terrain)), 1);
      assert.equal(internal.getDataSpacing(grid(function() { return 5; })), 1);
    });

    it('is about the spacing of the data that a grid was interpolated from', function () {
      [2, 4, 8, 16].forEach(function(f) {
        var spacing = internal.getDataSpacing(grid(stretch(terrain, f, f)));
        assert(spacing > f * 0.75 && spacing < f * 1.25, f + ': ' + spacing);
      });
    });

    it('skips nodata', function () {
      var g = grid(stretch(terrain, 8, 8));
      for (var i = 0; i < g.samples.length; i++) if (i % 300 < 100) g.samples[i] = -9999;
      g.nodata = -9999;
      var spacing = internal.getDataSpacing(g);
      assert(spacing > 6 && spacing < 10, String(spacing));
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

    it('fits the sun\'s altitude to the edges of cast shadows where the ground varies with the terrain', async function () {
      // the image is larger than the level that brightness is scored on, so
      // shadow edges are measured on a finer grid
      var dataset = makeAspectDataset(400, 400, {azimuth: 150 * deg, altitude: 50 * deg});
      var catalog = await run(dataset, '-deshadow elev target=img');
      var out = findLayer(catalog, 'img').raster.derivation;
      assert(Math.abs(out.sun_azimuth - 150) < 4, 'azimuth ' + out.sun_azimuth);
      assert(Math.abs(out.sun_altitude - 50) < 3, 'altitude ' + out.sun_altitude);
    });

    it('date= fits the sun along its path that day', async function () {
      var pos = internal.getSunPosition(TEST_LATITUDE, internal.getSolarDeclination(172), -40);
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
      var pos = internal.getSunPosition(TEST_LATITUDE, internal.getSolarDeclination(172), -40);
      var dataset = makeDataset(150, 150, mesas, {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      dataset.info.raster_sources = [{id: 'naip', acquisitions: {type: 'states', complete: true,
        groups: [{state: 'AZ', year: 2023, start: '2023-06-20', end: '2023-06-22', images: 2}]}}];
      var catalog = await run(dataset, '-deshadow elev target=img');
      assert.equal(findLayer(catalog, 'img').raster.derivation.date, '2023-06-20/2023-06-22');
    });

    it('fits the sun to imagery taken over several weeks', async function () {
      var pos = internal.getSunPosition(TEST_LATITUDE, internal.getSolarDeclination(240), -40);
      var dataset = makeDataset(150, 150, mesas, {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg});
      dataset.info.raster_sources = [{id: 'naip', acquisitions: {type: 'states', complete: true,
        groups: [{state: 'WA', year: 2013, start: '2013-08-06', end: '2013-09-14', images: 30}]}}];
      var catalog = await run(dataset, '-deshadow elev target=img');
      var out = findLayer(catalog, 'img').raster;
      assert.equal(out.derivation.date, '2013-08-06/2013-09-14');
      assert(Math.abs(out.derivation.sun_azimuth - pos.azimuth) < 4, out.derivation.sun_azimuth + ' vs ' + pos.azimuth);
      assert(Math.abs(out.derivation.sun_altitude - pos.altitude) < 4, out.derivation.sun_altitude + ' vs ' + pos.altitude);
    });

    describe('mosaics', function () {
      // 40 km of hills on 250 m pixels, enough tiles to be fitted in regions
      var w = 160, h = 160, cell = 0.00225;
      var east = {azimuth: 120 * deg, altitude: 40 * deg}, west = {azimuth: 220 * deg, altitude: 40 * deg};

      it('fits the sun of each region of an image taken at different times', async function () {
        var dataset = makeLitDataset(w, h, function(x) { return x < w / 2 ? east : west; }, cell);
        var catalog = await run(dataset, '-deshadow elev target=img');
        var suns = findLayer(catalog, 'img').raster.derivation.region_suns;
        assert.equal(suns.length, 2);
        suns.sort(function(a, b) { return a.sun_azimuth - b.sun_azimuth; });
        // tiles next to the seam are labeled from their neighbors too
        assert(Math.abs(suns[0].sun_azimuth - 120) < 10, 'azimuth ' + suns[0].sun_azimuth);
        assert(Math.abs(suns[1].sun_azimuth - 220) < 10, 'azimuth ' + suns[1].sun_azimuth);
        suns.forEach(function(s) {
          assert(Math.abs(s.sun_altitude - 40) < 5, 'altitude ' + s.sun_altitude);
          assert(Math.abs(s.share - 0.5) < 0.1, 'share ' + s.share);
        });
      });

      it('fits one sun to an image lit by one sun', async function () {
        var dataset = makeLitDataset(w, h, function() { return east; }, cell);
        var catalog = await run(dataset, '-deshadow elev target=img');
        var out = findLayer(catalog, 'img').raster.derivation;
        assert(!out.region_suns);
        assert(Math.abs(out.sun_azimuth - 120) < 3, 'azimuth ' + out.sun_azimuth);
      });

      it('fits the regions of a small image too', async function () {
        // 4 km on 25 m pixels: tiles are sized to the image, not to a distance
        var dataset = makeLitDataset(w, h, function(x) { return x < w / 2 ? east : west; }, cell / 10);
        var catalog = await run(dataset, '-deshadow elev target=img');
        var suns = findLayer(catalog, 'img').raster.derivation.region_suns;
        assert(suns && suns.length == 2, 'region_suns ' + JSON.stringify(suns));
        suns.sort(function(a, b) { return a.sun_azimuth - b.sun_azimuth; });
        assert(Math.abs(suns[0].sun_azimuth - 120) < 10, 'azimuth ' + suns[0].sun_azimuth);
        assert(Math.abs(suns[1].sun_azimuth - 220) < 10, 'azimuth ' + suns[1].sun_azimuth);
      });

      it('fits one sun to a small image lit by one sun', async function () {
        var dataset = makeLitDataset(w, h, function() { return west; }, cell / 10);
        var catalog = await run(dataset, '-deshadow elev target=img');
        var out = findLayer(catalog, 'img').raster.derivation;
        assert(!out.region_suns, 'region_suns ' + JSON.stringify(out.region_suns));
        assert(Math.abs(out.sun_azimuth - 220) < 3, 'azimuth ' + out.sun_azimuth);
      });
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

    it('leaves black pixels out, and unchanged', async function () {
      var dataset = makeDataset(150, 150, mesas, sun);
      var shadow = dataset.shadow;
      var src = dataset.layers[1].raster.grid.samples;
      for (var i = 0; i < 150 * 150; i++) if (i % 150 < 25) src.fill(0, i * 3, i * 3 + 3);
      var lit = meanColor(src, function(i) { return i % 150 >= 25 && !shadow[i]; });
      var catalog = await run(dataset, '-deshadow elev target=img');
      var samples = findLayer(catalog, 'img').raster.grid.samples;
      var after = meanColor(samples, function(i) { return i % 150 >= 25 && shadow[i]; });
      for (var k = 0; k < 3; k++) {
        assert(Math.abs(after[k] - lit[k]) < lit[k] * 0.15, 'band ' + k + ': ' + after[k] + ' vs ' + lit[k]);
      }
      assert.deepEqual(meanColor(samples, function(i) { return i % 150 < 25; }), [0, 0, 0]);
    });

    it('leaves an image with no data in place', async function () {
      var dataset = makeDataset(150, 150, mesas, sun);
      var img = dataset.layers[1];
      img.raster.grid.samples.fill(0);
      var catalog = await run(dataset, '-deshadow elev target=img');
      assert.strictEqual(findLayer(catalog, 'img'), img);
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
