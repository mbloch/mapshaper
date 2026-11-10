import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import { fromArrayBuffer } from 'geotiff';
import GeoTIFFLZWDecoder from '../node_modules/geotiff/dist-module/compression/lzw.js';
import { decodeLZW } from '../src/geotiff/mapshaper-geotiff-lzw.mjs';
import { makeLZWTestGrids } from './_geotiff-lzw-grids.mjs';

var FIXTURES = {
  float32: 'test/data/geotiff/lzw-float32-predictor-strips.tif',
  rgb: 'test/data/geotiff/lzw-rgb-predictor-tiles.tif',
  uint16: 'test/data/geotiff/lzw-uint16.tif'
};

describe('GeoTIFF LZW decoding', function () {
  var grids = makeLZWTestGrids();

  Object.keys(FIXTURES).forEach(function(name) {
    it('imports ' + FIXTURES[name], async function () {
      var dataset = await api.internal.importFileAsync(FIXTURES[name], {});
      var grid = dataset.layers[0].raster.grid;
      assert.equal(grid.width, grids[name].width);
      assert.equal(grid.bands, grids[name].bands);
      assert.deepEqual(Array.from(grid.samples), Array.from(grids[name].samples));
    });

    it('decodes every block of ' + FIXTURES[name] + ' as geotiff.js does', async function () {
      var blocks = await readCompressedBlocks(FIXTURES[name]);
      var reference = new GeoTIFFLZWDecoder({});
      blocks.forEach(function(block) {
        var expected = new Uint8Array(reference.decodeBlock(block.buffer.slice(block.byteOffset, block.byteOffset + block.length)));
        assert.deepEqual(decodeLZW(block, expected.length), expected);
        // without a size hint, the output grows as needed
        assert.deepEqual(decodeLZW(block, 1), expected);
      });
    });
  });

  it('ends data that has no end code where the input ends', async function () {
    var block = (await readCompressedBlocks(FIXTURES.uint16))[0];
    var full = decodeLZW(block, 0);
    var truncated = decodeLZW(block.subarray(0, block.length >> 1), 0);
    assert(truncated.length > 0 && truncated.length < full.length);
    assert.deepEqual(truncated, full.subarray(0, truncated.length));
  });

  it('rejects a code that has not been defined', function () {
    // 9-bit codes: 65 ('A'), then 300, before code 258 is defined
    var bits = '001000001' + '100101100';
    var bytes = new Uint8Array(3);
    for (var i = 0; i < bits.length; i++) {
      if (bits[i] == '1') bytes[i >> 3] |= 128 >> (i & 7);
    }
    assert.throws(function() { decodeLZW(bytes, 0); }, /Invalid LZW code: 300/);
  });
});

async function readCompressedBlocks(file) {
  var bytes = fs.readFileSync(file);
  var tiff = await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  var image = await tiff.getImage();
  var dir = image.fileDirectory;
  var tiled = image.isTiled;
  var offsets = await dir.loadValue(tiled ? 'TileOffsets' : 'StripOffsets');
  var counts = await dir.loadValue(tiled ? 'TileByteCounts' : 'StripByteCounts');
  return Array.from(offsets).map(function(offset, i) {
    return new Uint8Array(bytes.subarray(offset, offset + counts[i]));
  });
}
