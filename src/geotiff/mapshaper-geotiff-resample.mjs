// Reads a GeoTIFF image one row of strips or tiles at a time: at a reduced
// size, keeping only the pixels that the reduced grid samples, or a range of
// rows at full resolution. geotiff.js's readRasters() instead assembles the
// whole full-size image before resampling it, which took more than 4 GB for a
// 24795 x 21762 float32 image. Pixels are picked as readRasters() picks them
// for nearest-neighbor resampling, so the result is the same.

// Compressions whose geotiff.js decoders need only the parameters below
var SUPPORTED_COMPRESSIONS = [1, 5, 8, 32773, 32946, 50000];

// Returns pixel-interleaved samples, or null if the image is stored in a way
// that this reader doesn't handle (the caller then uses readRasters())
// geotiff: the geotiff.js module
export async function readResampledGeoTIFFSamples(geotiff, image, samples, width, height) {
  var reader = await getGeoTIFFBlockReader(geotiff, image, samples);
  if (!reader) return null;
  return reader.read(getSourceIndexes(image.getHeight(), height), getSourceIndexes(image.getWidth(), width));
}

// Returns a function for reading full-resolution rows [r0, r1) of an image as
// pixel-interleaved samples. Reads a file's blocks directly where possible,
// else through readRasters().
export async function getGeoTIFFRowReader(geotiff, image, samples) {
  var reader = await getGeoTIFFBlockReader(geotiff, image, samples);
  var cols = getIndexRange(0, image.getWidth());
  return function(r0, r1) {
    if (reader) return reader.read(getIndexRange(r0, r1), cols);
    return image.readRasters({window: [0, r0, image.getWidth(), r1], samples: samples, interleave: true});
  };
}

// Returns {read(srcRows, srcCols)}, which reads the source pixels at the
// given rows and columns, or null if the image is stored in a way that this
// reader doesn't handle
async function getGeoTIFFBlockReader(geotiff, image, samples) {
  var layout = getSampleLayout(image, samples);
  var compression = image.fileDirectory.getValue('Compression') || 1;
  var decoder;
  if (!layout || SUPPORTED_COMPRESSIONS.indexOf(compression) == -1 || !geotiff.getDecoder) return null;
  decoder = await geotiff.getDecoder(compression, await getDecoderParameters(image));
  return {
    read: function(srcRows, srcCols) {
      return readBlocks(image, decoder, layout, srcRows, srcCols);
    }
  };
}

function getIndexRange(start, end) {
  var idx = new Uint32Array(end - start);
  for (var i = 0; i < idx.length; i++) idx[i] = start + i;
  return idx;
}

// The parameters of geotiff.js's default decoder parameter function
async function getDecoderParameters(image) {
  var dir = image.fileDirectory;
  var tiled = !dir.hasTag('StripOffsets');
  return {
    tileWidth: tiled ? await dir.loadValue('TileWidth') : await dir.loadValue('ImageWidth'),
    tileHeight: tiled ? await dir.loadValue('TileLength') :
      (await dir.loadValue('RowsPerStrip') || await dir.loadValue('ImageLength')),
    planarConfiguration: await dir.loadValue('PlanarConfiguration'),
    bitsPerSample: await dir.loadValue('BitsPerSample'),
    predictor: await dir.loadValue('Predictor') || 1
  };
}

// How to find each requested sample in a decoded block, or null if the samples
// aren't all of one whole-byte type
function getSampleLayout(image, samples) {
  var dir = image.fileDirectory;
  var bits = Array.from(dir.getValue('BitsPerSample') || []);
  var formats = Array.from(dir.getValue('SampleFormat') || []);
  var samplesPerPixel = image.getSamplesPerPixel();
  var planar = image.planarConfiguration == 2;
  var size = bits[0], format = formats[0] || 1;
  var ArrayType;
  if (bits.length != samplesPerPixel || bits.some(function(b) { return b != size; }) ||
      formats.some(function(f) { return f != format; })) return null;
  ArrayType = getArrayType(format, size);
  if (!ArrayType || !platformIsLittleEndian() || !image.littleEndian && size > 8) return null;
  return {
    ArrayType: ArrayType,
    planar: planar,
    samples: samples,
    // samples per pixel in a decoded block
    stride: planar ? 1 : samplesPerPixel
  };
}

function getArrayType(format, bits) {
  if (format == 1) return {8: Uint8Array, 16: Uint16Array, 32: Uint32Array}[bits] || null;
  if (format == 2) return {8: Int8Array, 16: Int16Array, 32: Int32Array}[bits] || null;
  if (format == 3) return {32: Float32Array, 64: Float64Array}[bits] || null;
  return null;
}

function platformIsLittleEndian() {
  return new Uint8Array(new Uint16Array([1]).buffer)[0] == 1;
}

// @srcRows, @srcCols: for each output row and column, the source row or column
// (both nondecreasing)
async function readBlocks(image, decoder, layout, srcRows, srcCols) {
  var width = srcCols.length;
  var bands = layout.samples.length;
  var out = new layout.ArrayType(width * srcRows.length * bands);
  var colRanges = getBlockRanges(srcCols, image.getTileWidth());
  var rowRanges = getBlockRanges(srcRows, image.getTileHeight());
  for (var r = 0; r < rowRanges.length; r++) {
    await Promise.all(colRanges.map(function(cols) {
      return copyBlockSamples(image, decoder, layout, out, rowRanges[r], cols, srcRows, srcCols, width);
    }));
  }
  return out;
}

// For each output row (or column), the source row it takes its pixels from,
// as in geotiff.js's resampleNearestInterleaved()
function getSourceIndexes(srcSize, size) {
  var rel = srcSize / size;
  var idx = new Uint32Array(size);
  for (var i = 0; i < size; i++) {
    idx[i] = Math.min(Math.round(rel * i), srcSize - 1);
  }
  return idx;
}

// Groups consecutive output indexes by the block that their source pixels
// fall in. Blocks that no output pixel samples are left out, so they are never
// decoded.
function getBlockRanges(srcIndexes, blockSize) {
  var ranges = [], block, range;
  for (var i = 0; i < srcIndexes.length; i++) {
    block = Math.floor(srcIndexes[i] / blockSize);
    if (!range || range.block != block) {
      range = {block: block, start: i, end: i};
      ranges.push(range);
    }
    range.end = i + 1;
  }
  return ranges;
}

async function copyBlockSamples(image, decoder, layout, out, rows, cols, srcRows, srcCols, width) {
  var bands = layout.samples.length;
  var blockWidth = image.getTileWidth(), blockHeight = image.getTileHeight();
  var rowOffset = rows.block * blockHeight;
  var colOffset = cols.block * blockWidth;
  var blocks = await Promise.all(layout.planar ? layout.samples.map(function(sample) {
    return image.getTileOrStrip(cols.block, rows.block, sample, decoder);
  }) : [image.getTileOrStrip(cols.block, rows.block, 0, decoder)]);
  var views = blocks.map(function(block) {
    var bytes = layout.ArrayType.BYTES_PER_ELEMENT;
    return new layout.ArrayType(block.data, 0, Math.floor(block.data.byteLength / bytes));
  });
  var stride = layout.stride;
  var y, x, b, src, dest, view, offset;
  for (b = 0; b < bands; b++) {
    view = layout.planar ? views[b] : views[0];
    offset = layout.planar ? 0 : layout.samples[b];
    for (y = rows.start; y < rows.end; y++) {
      src = (srcRows[y] - rowOffset) * blockWidth;
      dest = y * width;
      for (x = cols.start; x < cols.end; x++) {
        out[(dest + x) * bands + b] = view[(src + srcCols[x] - colOffset) * stride + offset];
      }
    }
  }
}
