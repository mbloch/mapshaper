import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import * as geotiff from 'geotiff';
import { readResampledGeoTIFFSamples } from '../src/geotiff/mapshaper-geotiff-resample.mjs';

describe('GeoTIFF reduced-resolution reading', function () {
  [
    'test/data/geotiff/lzw-float32-predictor-strips.tif',
    'test/data/geotiff/lzw-rgb-predictor-tiles.tif',
    'test/data/geotiff/lzw-uint16.tif',
    'test/data/geotiff/deflate-rgb-planar.tif',
    'test/data/geotiff/sedona-elev.tif'
  ].forEach(function(file) {
    it('samples the same pixels as geotiff.js: ' + file, async function () {
      var image = await openImage(file);
      var w = image.getWidth(), h = image.getHeight();
      var samples = image.getSamplesPerPixel() >= 3 ? [[0, 1, 2], [2], [1, 0]] : [[0]];
      var sizes = [[Math.ceil(w / 3), Math.ceil(h / 3)], [w - 1, h - 1], [7, 5], [1, 1]];
      for (var s of samples) {
        for (var size of sizes) {
          var expected = await image.readRasters({interleave: true, samples: s, width: size[0], height: size[1]});
          var actual = await readResampledGeoTIFFSamples(geotiff, image, s, size[0], size[1]);
          assert(actual, 'unsupported');
          assert.equal(actual.constructor, expected.constructor);
          assert.deepEqual(Array.from(actual), Array.from(expected), s + ' ' + size);
        }
      }
    });
  });

  it('leaves big-endian multibyte samples and JPEG compression to geotiff.js', async function () {
    var image = await openImage('test/data/geotiff/lzw-uint16-bigendian.tif');
    assert.strictEqual(await readResampledGeoTIFFSamples(geotiff, image, [0], 10, 10), null);
    image = await openImage('test/data/geotiff/sedona-naip.tif');
    assert.strictEqual(await readResampledGeoTIFFSamples(geotiff, image, [0, 1, 2], 10, 10), null);
  });

  it('imports a big-endian file at reduced resolution', async function () {
    var a = await api.internal.importFileAsync('test/data/geotiff/lzw-uint16-bigendian.tif', {resolution: 50});
    var b = await api.internal.importFileAsync('test/data/geotiff/lzw-uint16.tif', {resolution: 50});
    assert.equal(a.layers[0].raster.grid.width, 50);
    assert.deepEqual(Array.from(a.layers[0].raster.grid.samples), Array.from(b.layers[0].raster.grid.samples));
  });
});

async function openImage(file) {
  var bytes = fs.readFileSync(file);
  var tiff = await geotiff.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  return tiff.getImage();
}
