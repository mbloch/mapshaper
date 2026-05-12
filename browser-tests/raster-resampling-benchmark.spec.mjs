import { expect, test } from '@playwright/test';

var RUN_BENCHMARKS = !!process.env.MAPSHAPER_RUN_BENCHMARKS;

test.describe('raster resampling benchmarks', function() {
  test.skip(!RUN_BENCHMARKS, 'Set MAPSHAPER_RUN_BENCHMARKS=1 to run raster resampling benchmarks.');

  test('compares JS preview rendering and browser-native canvas resizing', async function({page}) {
    var report;
    await page.goto('/');
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.internal &&
        window.mapshaper.internal.renderRasterPreview;
    });

    report = await page.evaluate(runRasterResamplingBenchmarks);
    console.log('\nRaster resampling benchmark\n' + JSON.stringify(report, null, 2));

    expect(report.supports.canvas2d).toBe(true);
    expect(report.cases.length).toBeGreaterThan(0);
  });
});

function runRasterResamplingBenchmarks() {
  var internal = window.mapshaper.internal;
  var supports = {
    canvas2d: !!document.createElement('canvas').getContext('2d'),
    OffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    createImageBitmap: typeof createImageBitmap !== 'undefined',
    requestIdleCallback: typeof requestIdleCallback !== 'undefined'
  };
  var cases = [
    benchCase({
      name: 'initial-preview uint8 rgb downsample 12MP to 0.75MP',
      width: 4000,
      height: 3000,
      bands: 3,
      pixelType: 'uint8',
      outWidth: 1000,
      outHeight: 750,
      recipe: {type: 'rgb', scaling: 'none'}
    }),
    benchCase({
      name: 'initial-preview uint8 rgb downsample 12MP to 3MP',
      width: 4000,
      height: 3000,
      bands: 3,
      pixelType: 'uint8',
      outWidth: 2000,
      outHeight: 1500,
      recipe: {type: 'rgb', scaling: 'none'}
    }),
    benchCase({
      name: 'viewport uint8 rgb 3MP native-size render',
      width: 2000,
      height: 1500,
      bands: 3,
      pixelType: 'uint8',
      outWidth: 2000,
      outHeight: 1500,
      recipe: {type: 'rgb', scaling: 'none'}
    }),
    benchCase({
      name: 'viewport uint16 gray percentile 3MP to 0.75MP',
      width: 2000,
      height: 1500,
      bands: 1,
      pixelType: 'uint16',
      outWidth: 1000,
      outHeight: 750,
      recipe: {type: 'gray', scaling: 'percentile', percentileRange: [2, 98]}
    })
  ];

  return {
    userAgent: navigator.userAgent,
    supports: supports,
    cases: cases
  };

  function benchCase(params) {
    var grid = makeGrid(params);
    var preview = internal.renderRasterPreview(grid, params.recipe, params.outWidth, params.outHeight);
    var sourceRgbaResult = time(
      'JS build source-window RGBA',
      function() { return buildSourceRgba(grid).checksum; },
      getReps(grid.width * grid.height)
    );
    var sourceCanvas = makeCanvasFromPreview({
      width: grid.width,
      height: grid.height,
      pixels: buildSourceRgba(grid).pixels
    });
    var results = [
      time(
        'Mapshaper renderRasterPreview',
        function() {
          var p = internal.renderRasterPreview(grid, params.recipe, params.outWidth, params.outHeight);
          return checksumPixels(p.pixels);
        },
        getReps(params.outWidth * params.outHeight)
      ),
      sourceRgbaResult,
      time(
        'Canvas resize from prebuilt source, smoothing=false',
        function() { return canvasResize(sourceCanvas, params.outWidth, params.outHeight, false); },
        getReps(params.outWidth * params.outHeight)
      ),
      time(
        'Canvas resize from prebuilt source, smoothing=true low',
        function() { return canvasResize(sourceCanvas, params.outWidth, params.outHeight, true); },
        getReps(params.outWidth * params.outHeight)
      ),
      time(
        'Canvas full pipeline: source RGBA + upload + resize',
        function() {
          var source = buildSourceRgba(grid);
          var canvas = makeCanvasFromPreview({
            width: grid.width,
            height: grid.height,
            pixels: source.pixels
          });
          return canvasResize(canvas, params.outWidth, params.outHeight, false);
        },
        Math.min(5, getReps(grid.width * grid.height))
      ),
      time(
        'Canvas draw existing preview to output',
        function() {
          var canvas = makeCanvasFromPreview(preview);
          return canvasResize(canvas, params.outWidth, params.outHeight, false);
        },
        getReps(params.outWidth * params.outHeight)
      )
    ];

    return {
      name: params.name,
      sourcePixels: grid.width * grid.height,
      outputPixels: params.outWidth * params.outHeight,
      bands: grid.bands,
      pixelType: grid.pixelType,
      results: results
    };
  }

  function makeGrid(params) {
    var samples = makeSamples(params.width, params.height, params.bands, params.pixelType);
    return {
      width: params.width,
      height: params.height,
      bands: params.bands,
      pixelType: params.pixelType,
      samples: samples,
      nodata: null
    };
  }

  function makeSamples(width, height, bands, pixelType) {
    var Ctor = pixelType == 'uint16' ? Uint16Array : Uint8Array;
    var samples = new Ctor(width * height * bands);
    var max = pixelType == 'uint16' ? 65535 : 255;
    var val, i;
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        i = (y * width + x) * bands;
        val = (x + y) / (width + height - 2) * max;
        samples[i] = val;
        if (bands > 1) samples[i + 1] = x / (width - 1) * max;
        if (bands > 2) samples[i + 2] = y / (height - 1) * max;
        if (bands > 3) samples[i + 3] = max;
      }
    }
    return samples;
  }

  function buildSourceRgba(grid) {
    var pixels = new Uint8ClampedArray(grid.width * grid.height * 4);
    var sourceRange = grid.pixelType == 'uint16' ? 65535 : 255;
    var sample, src, dest;
    for (var i = 0, n = grid.width * grid.height; i < n; i++) {
      src = i * grid.bands;
      dest = i * 4;
      sample = grid.samples[src] / sourceRange * 255;
      pixels[dest] = sample;
      pixels[dest + 1] = grid.bands > 1 ? grid.samples[src + 1] / sourceRange * 255 : sample;
      pixels[dest + 2] = grid.bands > 2 ? grid.samples[src + 2] / sourceRange * 255 : sample;
      pixels[dest + 3] = grid.bands > 3 ? grid.samples[src + 3] / sourceRange * 255 : 255;
    }
    return {
      pixels: pixels,
      checksum: checksumPixels(pixels)
    };
  }

  function makeCanvasFromPreview(preview) {
    var canvas = makeCanvas(preview.width, preview.height);
    var ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(preview.pixels, preview.width, preview.height), 0, 0);
    return canvas;
  }

  function makeCanvas(width, height) {
    var canvas = supports.OffscreenCanvas ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function canvasResize(sourceCanvas, width, height, smoothing) {
    var canvas = makeCanvas(width, height);
    var ctx = canvas.getContext('2d', {desynchronized: true});
    var pixel;
    ctx.imageSmoothingEnabled = smoothing;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    pixel = ctx.getImageData(0, 0, 1, 1).data;
    return pixel[0] + pixel[1] + pixel[2] + pixel[3];
  }

  function time(label, fn, reps) {
    var times = [];
    var checksum = 0;
    for (var i = 0; i < reps; i++) {
      var start = performance.now();
      checksum += fn() || 0;
      times.push(performance.now() - start);
    }
    return {
      label: label,
      reps: reps,
      medianMs: round(median(times)),
      minMs: round(Math.min.apply(null, times)),
      maxMs: round(Math.max.apply(null, times)),
      checksum: checksum
    };
  }

  function getReps(pixelCount) {
    if (pixelCount >= 8e6) return 3;
    if (pixelCount >= 2e6) return 5;
    return 9;
  }

  function checksumPixels(pixels) {
    var n = pixels.length;
    return pixels[0] + pixels[1] + pixels[2] + pixels[3] +
      pixels[n - 4] + pixels[n - 3] + pixels[n - 2] + pixels[n - 1];
  }

  function median(arr) {
    var sorted = arr.slice().sort(function(a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)];
  }

  function round(num) {
    return Math.round(num * 100) / 100;
  }
}
