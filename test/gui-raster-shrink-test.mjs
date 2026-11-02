import assert from 'assert';
import { getShrinkFactor, shrinkRgbaPixels } from '../src/gui/gui-raster-shrink.mjs';

describe('gui-raster-shrink.mjs', function () {
  it('getShrinkFactor() finds the smallest whole-number factor that fits', function () {
    assert.equal(getShrinkFactor(1000, 1000, 1e6), 1);
    assert.equal(getShrinkFactor(2000, 2000, 1e6), 2);
    assert.equal(getShrinkFactor(2001, 2000, 1e6), 3);
    assert.equal(getShrinkFactor(3000, 1000, 1e6), 2);
  })

  it('averages blocks, including partial blocks at the edges', function () {
    var px = new Uint8ClampedArray([
      0, 0, 0, 255,     100, 100, 100, 255,   50, 60, 70, 255,
      200, 200, 200, 255, 100, 100, 100, 255, 50, 60, 70, 255
    ]);
    var out = shrinkRgbaPixels(px, 3, 2, 2);
    assert.equal(out.width, 2);
    assert.equal(out.height, 1);
    assert.equal(out.coverWidth, 1.5); // the partial block is half a pixel
    assert.equal(out.coverHeight, 1);
    assert.deepEqual(Array.from(out.pixels), [100, 100, 100, 255, 50, 60, 70, 255]);
  })

  it('weights colors by alpha, so transparent pixels do not darken', function () {
    var px = new Uint8ClampedArray([
      200, 100, 50, 255, 0, 0, 0, 0,
      0, 0, 0, 0,        0, 0, 0, 0
    ]);
    var out = shrinkRgbaPixels(px, 2, 2, 2);
    assert.deepEqual(Array.from(out.pixels), [200, 100, 50, 64]);
    out = shrinkRgbaPixels(new Uint8ClampedArray(16), 2, 2, 2);
    assert.deepEqual(Array.from(out.pixels), [0, 0, 0, 0]);
  })
})
