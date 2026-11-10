// The grids that the LZW GeoTIFF fixtures in test/data/geotiff/lzw-*.tif were
// made from, with GDAL: smooth areas, which compress into long codes, and
// noise, which fills the code table until it is cleared.

export function makeLZWTestGrids() {
  return {
    float32: makeGrid(160, 100, 1, Float32Array, function(x, y, b, rand) {
      return x < 80 ? Math.sin(x / 9) * Math.cos(y / 7) * 1000 : rand() * 1e6 - 5e5;
    }),
    rgb: makeGrid(150, 90, 3, Uint8Array, function(x, y, b, rand) {
      return y < 45 ? (x * (b + 1) + y) & 255 : rand() * 256;
    }),
    uint16: makeGrid(200, 120, 1, Uint16Array, function(x, y, b, rand) {
      return y % 40 < 20 ? 1000 + (x >> 3) : rand() * 65536;
    })
  };
}

function makeGrid(width, height, bands, ArrayType, f) {
  var samples = new ArrayType(width * height * bands);
  var rand = makeRandom(1);
  var i = 0;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      for (var b = 0; b < bands; b++) {
        samples[i++] = f(x, y, b, rand);
      }
    }
  }
  return {
    width: width,
    height: height,
    bands: bands,
    samples: samples,
    nodata: null,
    bbox: [0, 0, width / 100, height / 100],
    transform: [0.01, 0, 0, 0, -0.01, height / 100]
  };
}

function makeRandom(seed) {
  var s = seed;
  return function() {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
