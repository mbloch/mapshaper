import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

var internal = api.internal;

function square(x0, y0, x1, y1) {
  return [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];
}

function importPolygons(coordinates, crs) {
  var dataset = internal.importGeoJSON({
    type: 'FeatureCollection',
    features: coordinates.map(function(coords) {
      return {type: 'Feature', properties: null, geometry: {type: 'Polygon', coordinates: coords}};
    })
  }, {});
  dataset.layers[0].name = 'shape';
  dataset.info.crs_string = crs || 'wgs84';
  return dataset;
}

// A raster layer named "raster" with 1-unit pixels and its top-left corner at
// 0,height. Pixel i (in row-major order from the top) has value values[i].
function makeRasterDataset(width, height, samples, gridProps) {
  var bands = samples.length / (width * height);
  return {
    info: {crs_string: 'wgs84'},
    layers: [{
      name: 'raster',
      raster_type: 'grid',
      raster: {
        sourceId: 'raster',
        interpretation: 'continuous',
        grid: Object.assign({
          width: width,
          height: height,
          bands: bands,
          pixelType: 'float32',
          samples: samples,
          sampleBands: bands == 1 ? [0] : [0, 1, 2],
          nodata: null,
          bbox: [0, 0, width, height],
          transform: [1, 0, 0, 0, -1, height]
        }, gridProps)
      }
    }]
  };
}

// 4x4 raster with values 1-16
function makeSequenceRaster(gridProps) {
  var samples = new Float32Array(16).map(function(_, i) { return i + 1; });
  return makeRasterDataset(4, 4, samples, gridProps);
}

async function join(rasterDataset, shapes, opts) {
  var catalog = new internal.Catalog();
  catalog.addDataset(rasterDataset);
  catalog.addDataset(importPolygons(shapes));
  await internal.runParsedCommands(
    internal.parseCommands('-join raster target=shape ' + opts),
    new internal.Job(catalog));
  return catalog.getLayers().find(function(o) { return o.layer.name == 'shape'; }).layer.data.getRecords();
}

var tmpFileCount = 0;

async function withFile(bytes, fn) {
  var file = path.join(os.tmpdir(), 'mapshaper-join-raster-' + process.pid + '-' + (++tmpFileCount) + '.tif');
  fs.writeFileSync(file, bytes);
  try {
    return await fn(file);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

async function importRasterLayer(file, importOpts) {
  var raster = await internal.importFileAsync(file, importOpts);
  raster.layers[0].name = 'raster';
  raster.info.crs_string = 'wgs84';
  return raster;
}

// Joins a raster layer imported from @file, after @edit(raster) if given
async function joinImportedFile(file, shapes, calc, importOpts, edit) {
  var raster = await importRasterLayer(file, importOpts || {});
  if (edit) edit(raster.layers[0].raster);
  return join(raster, shapes, 'calc="' + calc + '"');
}

// An edit the way raster commands make them, with a new sample array
function timesTen(raster) {
  raster.grid = Object.assign({}, raster.grid, {
    samples: raster.grid.samples.map(function(val) { return val * 10; })
  });
}

function ringArea(ring) {
  var sum = 0;
  for (var i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

function assertClose(a, b) {
  assert(Math.abs(a - b) < 1e-9, a + ' != ' + b);
}

// Two polygons that divide the 4x4 raster along a zigzag
var ZIGZAG_LEFT = [[0, 0], [0, 4], [1.3, 4], [2.7, 2.2], [1.1, 1.4], [2.9, 0], [0, 0]];
var ZIGZAG_RIGHT = [[2.9, 0], [1.1, 1.4], [2.7, 2.2], [1.3, 4], [4, 4], [4, 0], [2.9, 0]];

describe('-join with a raster source', function () {

  describe('area weighting (default)', function () {
    it('weights pixels by the fraction inside the polygon', async function () {
      // covers half of each edge pixel and a quarter of each corner pixel
      // around the pixel with value 10
      var records = await join(makeSequenceRaster(), [[square(0.5, 0.5, 2.5, 2.5)]],
        'calc="total = sum(band1), avg = mean(band1), n = count(), lo = min(band1), hi = max(band1)"');
      assert.deepEqual(records, [{total: 40, avg: 10, n: 4, lo: 5, hi: 15}]);
    });

    it('matches point-method for a polygon aligned with the pixels', async function () {
      var records = await join(makeSequenceRaster(), [[square(1, 1, 3, 3)]],
        'calc="total = sum(band1), n = count(), mid = median(band1)"');
      assert.deepEqual(records, [{total: 34, n: 4, mid: 8.5}]);
    });

    it('joins a polygon smaller than a pixel', async function () {
      // inside the bottom-left pixel, which has value 13
      var records = await join(makeSequenceRaster(), [[square(0.1, 0.1, 0.4, 0.4)]],
        'calc="total = sum(band1), avg = mean(band1), n = count()"');
      assertClose(records[0].total, 13 * 0.09);
      assertClose(records[0].avg, 13);
      assertClose(records[0].n, 0.09);
    });

    it('excludes holes', async function () {
      var records = await join(makeSequenceRaster(), [[square(0, 0, 4, 4), square(0.5, 0.5, 2.5, 2.5)]],
        'calc="total = sum(band1), n = count()"');
      assert.deepEqual(records, [{total: 136 - 40, n: 12}]);
    });

    it('ignores the parts of a polygon outside the raster', async function () {
      var records = await join(makeSequenceRaster(), [[square(-2.5, -3, 6.2, 7)]],
        'calc="total = sum(band1), n = count()"');
      assert.deepEqual(records, [{total: 136, n: 16}]);
    });

    it('gives an irregular polygon a total weight equal to its area', async function () {
      var ring = [[0.3, 0.2], [0.9, 2.5], [2.2, 3.9], [3.7, 1.1], [0.3, 0.2]];
      var records = await join(makeSequenceRaster(), [[ring]], 'calc="n = count()"');
      assertClose(records[0].n, ringArea(ring));
    });

    it('divides the raster between polygons that share a boundary', async function () {
      var records = await join(makeSequenceRaster(), [[ZIGZAG_LEFT], [ZIGZAG_RIGHT]],
        'calc="total = sum(band1), n = count()"');
      assertClose(records[0].n, ringArea(ZIGZAG_LEFT));
      assertClose(records[1].n, ringArea(ZIGZAG_RIGHT));
      assertClose(records[0].total + records[1].total, 136);
    });

    it('caps the coverage of overlapping parts of a feature at 1', async function () {
      var catalog = new internal.Catalog();
      var shapes = internal.importGeoJSON({
        type: 'Feature', properties: null,
        geometry: {type: 'MultiPolygon', coordinates: [[square(0, 0, 2, 2)], [square(1, 0, 3, 2)]]}
      }, {});
      shapes.layers[0].name = 'shape';
      shapes.info.crs_string = 'wgs84';
      catalog.addDataset(makeSequenceRaster());
      catalog.addDataset(shapes);
      await internal.runParsedCommands(
        internal.parseCommands('-join raster target=shape calc="n = count()"'),
        new internal.Job(catalog));
      assert.deepEqual(shapes.layers[0].data.getRecords(), [{n: 6}]);
    });

    it('exposes the weight as "coverage"', async function () {
      var records = await join(makeSequenceRaster(), [[square(0.5, 0.5, 2.5, 2.5)]],
        'where="coverage == 1" calc="total = sum(band1), weights = collect(coverage)"');
      assert.deepEqual(records, [{total: 10, weights: [1]}]);
    });

    it('uses weighted quantiles and modes', async function () {
      var samples = new Float32Array([1, 2, 3, 3]);
      var records = await join(makeRasterDataset(4, 1, samples), [[square(0, 0, 1.5, 1)], [square(1.5, 0, 2.5, 1)]],
        'calc="mid = median(band1), cls = mode(band1)"');
      // all of the 1 pixel and half of the 2 pixel: 1 is at 1/3 of the total
      // weight and 2 is at 5/6
      assertClose(records[0].mid, 1 + 1/3);
      assert.equal(records[0].cls, 1);
      // equal halves of 2 and 3: the tied mode goes to the first
      assert.deepEqual(records[1], {mid: 2.5, cls: 2});
    });
  });

  describe('getShapePixelCoverage()', function () {
    it('computes fractions within a window of pixels', function () {
      var grid = {width: 4, height: 4, bbox: [0, 0, 4, 4]};
      var shapes = importPolygons([[square(0.5, 0.5, 2.5, 2.5)]]);
      var win = {x: 0, y: 1, width: 3, height: 3};
      var coverage = internal.getShapePixelCoverage(grid, shapes.layers[0].shapes[0], shapes.arcs, win);
      assert.deepEqual(Array.from(coverage), [
        0.25, 0.5, 0.25,
        0.5, 1, 0.5,
        0.25, 0.5, 0.25
      ]);
    });
  });

  describe('point-method', function () {
    it('aggregates the pixels whose centers are inside each polygon', async function () {
      // the middle 2x2 pixels hold 6, 7, 10, 11
      var records = await join(makeSequenceRaster(), [[square(1, 1, 3, 3)]],
        'point-method calc="total = sum(band1), avg = mean(band1), n = count(), lo = min(band1), hi = max(band1), mid = median(band1)"');
      assert.deepEqual(records, [{total: 34, avg: 8.5, n: 4, lo: 6, hi: 11, mid: 8.5}]);
    });

    it('calculates quantiles like the calc= option of other joins', async function () {
      var records = await join(makeSequenceRaster(), [[square(1, 1, 3, 3)]],
        'point-method calc="q1 = quartile1(band1), q3 = quantile(band1, 0.75)"');
      assert.deepEqual(records, [{
        q1: api.utils.findQuantile([6, 7, 10, 11], 0.25),
        q3: api.utils.findQuantile([6, 7, 10, 11], 0.75)
      }]);
    });

    it('excludes holes', async function () {
      var records = await join(makeSequenceRaster(), [[square(0, 0, 4, 4), square(1, 1, 3, 3)]],
        'point-method calc="total = sum(band1), n = count()"');
      assert.deepEqual(records, [{total: 136 - 34, n: 12}]);
    });

    it('counts a pixel center on a boundary between two polygons once', async function () {
      // boundaries run through pixel centers at x=1.5 and y=2.5
      var records = await join(makeSequenceRaster(), [
        [square(0, 0, 1.5, 2.5)],
        [square(1.5, 0, 4, 2.5)],
        [square(0, 2.5, 1.5, 4)],
        [square(1.5, 2.5, 4, 4)]
      ], 'point-method calc="n = count(), total = sum(band1)"');
      assert.deepEqual(records.map(function(rec) { return rec.n; }), [3, 9, 1, 3]);
      assert.equal(records.reduce(function(memo, rec) { return memo + rec.total; }, 0), 136);
    });

    it('counts a pixel center on a shared diagonal edge once', async function () {
      // the diagonal passes through the centers of the four pixels on the
      // anti-diagonal
      var records = await join(makeSequenceRaster(), [
        [[[0, 0], [0, 4], [4, 0], [0, 0]]],
        [[[4, 0], [0, 4], [4, 4], [4, 0]]]
      ], 'point-method calc="n = count()"');
      assert.equal(records[0].n + records[1].n, 16);
    });

    it('joins a pixel to overlapping polygons that both contain it', async function () {
      var records = await join(makeSequenceRaster(), [[square(0, 3, 1, 4)], [square(0, 3, 2, 4)]],
        'point-method calc="total = sum(band1)"');
      assert.deepEqual(records, [{total: 1}, {total: 3}]);
    });

    it('gives a polygon without any pixel centers a sum of 0 and a null mean', async function () {
      var records = await join(makeSequenceRaster(), [[square(0.1, 0.1, 0.4, 0.4)]],
        'point-method calc="total = sum(band1), avg = mean(band1), n = count()"');
      assert.deepEqual(records, [{total: 0, avg: null, n: 0}]);
    });

    it('skips nodata pixels and NaN samples', async function () {
      var raster = makeSequenceRaster({nodata: 6});
      raster.layers[0].raster.grid.samples[6] = NaN; // value 7
      var records = await join(raster, [[square(1, 1, 3, 3)]],
        'point-method calc="total = sum(band1), n = count()"');
      assert.deepEqual(records, [{total: 21, n: 2}]);
    });

    it('treats nodata band by band', async function () {
      // two bands; band2 is nodata in the top-right pixel, both bands in the bottom-right
      var samples = new Float32Array([1, 10, 2, -1, 3, 30, -1, -1]);
      var raster = makeRasterDataset(2, 2, samples, {nodata: -1, sampleBands: [0, 1]});
      var records = await join(raster, [[square(0, 0, 2, 2)], [square(1, 1, 2, 2)]],
        'point-method calc="a = sum(band1), b = sum(band2), m = mean(band2), ' +
        'md = median(band2), mo = mode(band2), n = count()"');
      assert.deepEqual(records, [
        {a: 6, b: 40, m: 20, md: 20, mo: 10, n: 3},
        {a: 2, b: 0, m: null, md: null, mo: null, n: 1}
      ]);
    });

    it('skips pixels outside the coverage mask', async function () {
      var coverage = new Uint8Array(16).fill(255);
      coverage[5] = 0; // value 6
      var records = await join(makeSequenceRaster({coverage: coverage}), [[square(1, 1, 3, 3)]],
        'point-method calc="total = sum(band1)"');
      assert.deepEqual(records, [{total: 28}]);
    });

    it('filters pixels with where=', async function () {
      var records = await join(makeSequenceRaster(), [[square(1, 1, 3, 3)]],
        'point-method where="band1 > 7" calc="total = sum(band1)"');
      assert.deepEqual(records, [{total: 21}]);
    });

    it('exposes the target record to where= expressions', async function () {
      var raster = makeSequenceRaster();
      var catalog = new internal.Catalog();
      var shapes = importPolygons([[square(1, 1, 3, 3)], [square(1, 1, 3, 3)]]);
      shapes.layers[0].data = new internal.DataTable([{min: 7}, {min: 10}]);
      catalog.addDataset(raster);
      catalog.addDataset(shapes);
      await internal.runParsedCommands(
        internal.parseCommands('-join raster target=shape point-method where="band1 >= target.min" calc="total = sum(band1)"'),
        new internal.Job(catalog));
      assert.deepEqual(shapes.layers[0].data.getRecords(), [{min: 7, total: 28}, {min: 10, total: 21}]);
    });

    it('names band variables after the source bands', async function () {
      var samples = new Float32Array(12);
      for (var i = 0; i < 4; i++) {
        samples[i * 3] = 1;
        samples[i * 3 + 1] = 10;
        samples[i * 3 + 2] = 100;
      }
      var raster = makeRasterDataset(2, 2, samples, {sampleBands: [2, 3, 4]});
      var records = await join(raster, [[square(0, 0, 2, 2)]],
        'point-method calc="a = sum(band3), b = sum(band4), c = sum(band5)"');
      assert.deepEqual(records, [{a: 4, b: 40, c: 400}]);
    });

    it('supports mode() and fractions of categorical pixels', async function () {
      var samples = new Float32Array([41, 41, 41, 82]);
      var records = await join(makeRasterDataset(2, 2, samples), [[square(0, 0, 2, 2)]],
        'point-method calc="cls = mode(band1), forest = sum(band1 == 41) / count()"');
      assert.deepEqual(records, [{cls: 41, forest: 0.75}]);
    });

    it('saves unmatched polygons with the unmatched flag', async function () {
      var catalog = new internal.Catalog();
      catalog.addDataset(makeSequenceRaster());
      catalog.addDataset(importPolygons([[square(1, 1, 3, 3)], [square(0.1, 0.1, 0.4, 0.4)]]));
      await internal.runParsedCommands(
        internal.parseCommands('-join raster target=shape point-method unmatched calc="total = sum(band1)"'),
        new internal.Job(catalog));
      var unmatched = catalog.getLayers().find(function(o) { return o.layer.name == 'unmatched'; }).layer;
      assert.deepEqual(unmatched.data.getRecords(), [{total: 0}]);
    });
  });

  describe('resolution', function () {
    // 40x20 pixels of value 1, in the lat-long range
    function makeGeoTIFF() {
      return Buffer.from(internal.encodeGeoTIFF({
        width: 40, height: 20, bands: 1, pixelType: 'uint8',
        samples: new Uint8Array(800).fill(1), nodata: null,
        bbox: [0, 0, 40, 20], transform: [1, 0, 0, 0, -1, 20]
      }, {}));
    }

    it('imports a raster file named in -join at full resolution', async function () {
      var file = path.join(os.tmpdir(), 'mapshaper-join-raster-test.tif');
      var catalog = new internal.Catalog();
      var shapes = importPolygons([[square(0, 0, 40, 20)]]);
      var commands = internal.parseCommands('-join "' + file + '" target=shape calc="n = sum(band1)"');
      // without resolution=full, a limit this low would shrink the raster
      commands[0].options.raster_max_pixels = 100;
      fs.writeFileSync(file, makeGeoTIFF());
      catalog.addDataset(shapes);
      try {
        await internal.runParsedCommands(commands, new internal.Job(catalog));
      } finally {
        fs.unlinkSync(file);
      }
      assert.deepEqual(shapes.layers[0].data.getRecords(), [{n: 800}]);
    });

    it('reads a layer imported at reduced resolution from its source file', async function () {
      var records = await withFile(makeGeoTIFF(), function(file) {
        return joinImportedFile(file, [[square(0, 0, 40, 20)]], 'n = sum(band1)', {resolution: 10});
      });
      assert.deepEqual(records, [{n: 800}]);
    });

    it('rejects an edited layer imported at reduced resolution', async function () {
      await withFile(makeGeoTIFF(), async function(file) {
        await assert.rejects(
          joinImportedFile(file, [[square(0, 0, 40, 20)]], 'n = sum(band1)', {resolution: 10}, timesTen),
          /\[raster\] was imported at reduced resolution, and it has been edited since then.*resolution=full/);
      });
    });

    it('records when a raster was imported at reduced resolution', async function () {
      var reduced = await internal.importFileAsync('r.tif', {input: {'r.tif': makeGeoTIFF()}, resolution: 10});
      var full = await internal.importFileAsync('r.tif', {input: {'r.tif': makeGeoTIFF()}});
      assert.deepEqual(reduced.layers[0].raster.reducedResolution,
        {width: 10, height: 5, sourceWidth: 40, sourceHeight: 20});
      assert.equal('reducedResolution' in full.layers[0].raster, false);
    });
  });

  describe('bands', function () {
    // @size x @size pixels; every pixel of band k has the value k
    function makeGeoTIFF(bands, size) {
      size = size || 2;
      var samples = new Uint8Array(size * size * bands).map(function(_, i) { return i % bands + 1; });
      return Buffer.from(internal.encodeGeoTIFF({
        width: size, height: size, bands: bands, pixelType: 'uint8',
        samples: samples, nodata: null,
        bbox: [0, 0, size, size], transform: [1, 0, 0, 0, -1, size]
      }, {}));
    }

    async function joinFile(bands, calc) {
      return withFile(makeGeoTIFF(bands), async function(file) {
        var catalog = new internal.Catalog();
        var shapes = importPolygons([[square(0, 0, 2, 2)]]);
        catalog.addDataset(shapes);
        await internal.runParsedCommands(
          internal.parseCommands('-join "' + file + '" target=shape calc="' + calc + '"'),
          new internal.Job(catalog));
        return shapes.layers[0].data.getRecords();
      });
    }

    // a layer imported without a file to read again
    async function joinLayer(bands, calc) {
      var raster = await internal.importFileAsync('r.tif', {input: {'r.tif': makeGeoTIFF(bands)}});
      raster.layers[0].name = 'raster';
      raster.info.crs_string = 'wgs84';
      return join(raster, [[square(0, 0, 2, 2)]], 'calc="' + calc + '"');
    }

    it('reads the bands of a raster file named in -join', async function () {
      assert.deepEqual(await joinFile(2, 'a = sum(band1), b = sum(band2)'), [{a: 4, b: 8}]);
      assert.deepEqual(await joinFile(5, 'b = sum(band2), e = sum(band5)'), [{b: 8, e: 20}]);
    });

    it('joins the display bands of a raster layer', async function () {
      assert.deepEqual(await joinLayer(5, 'c = sum(band3)'), [{c: 12}]);
    });

    it('reads a band that a raster layer lacks from its source file', async function () {
      var records = await withFile(makeGeoTIFF(5), function(file) {
        return joinImportedFile(file, [[square(0, 0, 2, 2)]], 'a = sum(band1), e = sum(band5)');
      });
      assert.deepEqual(records, [{a: 4, e: 20}]);
    });

    it('joins the samples of an edited layer that has the bands', async function () {
      var records = await withFile(makeGeoTIFF(5), function(file) {
        return joinImportedFile(file, [[square(0, 0, 2, 2)]], 'a = sum(band1)', {}, timesTen);
      });
      assert.deepEqual(records, [{a: 40}]);
    });

    it('rejects an edited layer that lacks a band', async function () {
      await withFile(makeGeoTIFF(5), async function(file) {
        await assert.rejects(joinImportedFile(file, [[square(0, 0, 2, 2)]], 'e = sum(band5)', {}, timesTen),
          /was imported without band5, and it has been edited since then.*name the raster file in the command/);
      });
    });

    it('rejects a source file that changed after the layer was imported', async function () {
      await withFile(makeGeoTIFF(5), async function(file) {
        var raster = await importRasterLayer(file, {});
        fs.writeFileSync(file, makeGeoTIFF(5, 4));
        await assert.rejects(join(raster, [[square(0, 0, 2, 2)]], 'calc="e = sum(band5)"'),
          /The source file of raster layer \[raster\] .*has changed since it was imported/);
      });
    });

    it('rejects a layer whose source file can\'t be read', async function () {
      await assert.rejects(joinLayer(5, 'e = sum(band5)'),
        /Unable to read the source file of raster layer \[raster\]/);
    });

    it('rejects a band that the raster does not have', async function () {
      await assert.rejects(joinLayer(2, 'c = sum(band3)'), /The raster has no band3 \(available: band1\)/);
      await assert.rejects(joinFile(2, 'c = sum(band3)'), /The raster has no band3 \(available: band1\)/);
    });

    it('treats copies of imported samples as unedited', async function () {
      var raster = await internal.importFileAsync('r.tif', {input: {'r.tif': makeGeoTIFF(1)}});
      var grid = raster.layers[0].raster.grid;
      assert.equal(internal.rasterSamplesAreFromSource(grid), true);
      assert.equal(internal.rasterSamplesAreFromSource(internal.copyRasterGrid(grid)), true);
      assert.equal(internal.rasterSamplesAreFromSource(Object.assign({}, grid, {samples: grid.samples.slice()})), false);
    });
  });

  describe('errors', function () {
    async function joinError(opts, shapes) {
      await assert.rejects(join(makeSequenceRaster(), shapes || [[square(1, 1, 3, 3)]], opts));
    }

    it('requires calc=', async function () {
      await joinError('point-method');
    });

    it('rejects options that apply to joining records', async function () {
      await joinError('point-method keys=a,b calc="n = count()"');
      await joinError('point-method fields=a calc="n = count()"');
    });

    it('rejects a condition that skips an aggregate function', async function () {
      await joinError('point-method calc="n = band1 > 7 ? sum(band1) : 0"');
    });

    it('rejects a raster in a different projection', async function () {
      var catalog = new internal.Catalog();
      var raster = makeSequenceRaster();
      raster.info.crs_string = '+proj=merc';
      catalog.addDataset(raster);
      catalog.addDataset(importPolygons([[square(1, 1, 3, 3)]], '+proj=robin'));
      await assert.rejects(internal.runParsedCommands(
        internal.parseCommands('-join raster target=shape point-method calc="n = count()"'),
        new internal.Job(catalog)));
    });

    it('rejects a rotated raster', async function () {
      var catalog = new internal.Catalog();
      catalog.addDataset(makeSequenceRaster({transform: [1, 0.1, 0, 0, -1, 4]}));
      catalog.addDataset(importPolygons([[square(1, 1, 3, 3)]]));
      await assert.rejects(internal.runParsedCommands(
        internal.parseCommands('-join raster target=shape point-method calc="n = count()"'),
        new internal.Job(catalog)));
    });
  });

  describe('findWeightedQuantile()', function () {
    var find = internal.findWeightedQuantile;

    it('matches utils.findMedian() when weights are equal', function () {
      assert.equal(find([1, 2, 4, 8, 16], [0.5, 0.5, 0.5, 0.5, 0.5], 0.5), 4);
      assert.equal(find([1, 2, 4, 8], [0.5, 0.5, 0.5, 0.5], 0.5), 3);
    });

    it('places each value at the middle of its share of the weight', function () {
      // positions 0.125, 0.375, 0.625, 0.875
      assert.equal(find([1, 2, 4, 8], [1, 1, 1, 1], 0.25), 1.5);
      // positions 0.1, 0.6
      assert.equal(find([10, 20], [1, 4], 0.35), 15);
    });

    it('clamps to the smallest and largest values', function () {
      assert.equal(find([1, 2, 4, 8], [1, 1, 1, 1], 0), 1);
      assert.equal(find([1, 2, 4, 8], [1, 1, 1, 1], 1), 8);
      assert.equal(find([5], [0.2], 0.5), 5);
    });

    it('moves toward heavily weighted values', function () {
      assert.equal(find([1, 2, 3], [1, 1, 1], 0.5), 2);
      assert(find([1, 2, 3], [1, 1, 4], 0.5) > 2);
    });
  });

  describe('reading a band of rows at a time', function () {
    // 160x100 float32 pixels of 0.01 degrees, in 32-row strips
    var FILE = 'test/data/geotiff/lzw-float32-predictor-strips.tif';
    var TARGETS = [
      [[[0.05, 0.02], [1.5, 0.5], [0.3, 0.97], [0.05, 0.02]]],
      [square(0.703, 0.401, 0.957, 0.433)],
      [square(0.1, 0.1, 0.9, 0.9), square(0.3, 0.3, 0.6, 0.6).reverse()],
      [square(0.5, 0.05, 1.55, 0.95)],
      [square(2, 2, 3, 3)]
    ];
    var CALC = 'n = count(), s = sum(band1), m = mean(band1), med = median(band1), lo = min(band1), hi = max(band1)';

    async function joinFile(cmd) {
      var catalog = new internal.Catalog();
      var shapes = importPolygons(TARGETS);
      shapes.info.crs_string = 'wgs84';
      catalog.addDataset(shapes);
      await internal.runParsedCommands(internal.parseCommands('-join "' + FILE + '" target=shape ' + cmd),
        new internal.Job(catalog));
      return shapes.layers[0].data.getRecords();
    }

    async function joinLayer(cmd) {
      var raster = await importRasterLayer(FILE, {resolution: 'full'});
      return join(raster, TARGETS, cmd);
    }

    async function withBandPixels(n, fn) {
      var prev = internal.setRasterJoinBandPixels(n);
      try {
        return await fn();
      } finally {
        internal.setRasterJoinBandPixels(prev);
      }
    }

    ['calc="' + CALC + '"', 'point-method calc="' + CALC + '"'].forEach(function(cmd) {
      it('gets the same results in one pass and three rows at a time: ' + cmd.split(' ')[0], async function () {
        var expected = await joinLayer(cmd);
        assert.equal(expected[4].n, 0);
        assert(expected.slice(0, 4).every(function(rec) { return rec.n > 0; }));
        assert.deepEqual(await joinFile(cmd), expected);
        assert.deepEqual(await withBandPixels(160 * 3, function() { return joinLayer(cmd); }), expected);
        assert.deepEqual(await withBandPixels(160 * 3, function() { return joinFile(cmd); }), expected);
      });
    });

    it('reads only the blocks of rows under the targets', async function () {
      var raster = await importRasterLayer(FILE, {resolution: 'full', source_bands: [0], row_reader: true});
      var lyr = raster.layers[0];
      var shapes = importPolygons([[square(0.2, 0.4, 0.4, 0.6)]]);
      var reader = lyr.raster.rowReader;
      var reads = [];
      var readRows = reader.readRows;
      assert.equal(lyr.raster.grid.samples, null);
      reader.readRows = function(r0, r1) {
        reads.push([r0, r1]);
        return readRows(r0, r1);
      };
      await withBandPixels(160 * 3, function() {
        return internal.joinRasterToPolygons(shapes.layers[0], shapes, {layer: lyr, dataset: raster},
          {calc: 'n = count()'});
      });
      assert.deepEqual(reads, [[32, 64]]);
      assert.deepEqual(shapes.layers[0].data.getRecords(), [{n: 400}]);
    });
  });
});
