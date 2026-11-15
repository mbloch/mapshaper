import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

describe('raster display bands', function () {

  it('defaults to the band-count rule', function () {
    function display(bands) {
      var o = internal.getRasterDisplayBands({bands: bands});
      return {color: o.color.concat(), alpha: o.alpha};
    }
    assert.deepEqual(display(1), {color: [0], alpha: -1});
    assert.deepEqual(display(2), {color: [0], alpha: -1});
    assert.deepEqual(display(3), {color: [0, 1, 2], alpha: -1});
    assert.deepEqual(display(4), {color: [0, 1, 2], alpha: 3});
    assert.deepEqual(display(5), {color: [0, 1, 2], alpha: -1});
  });

  it('renders the color bands named by displayBands', function () {
    var grid = makeGrid(5, new Uint8Array([1, 2, 3, 4, 5]), {color: [4, 2, 1], alpha: -1});
    var preview = internal.renderRasterPreview(grid, {type: 'rgb', scaling: 'none'}, 1, 1);
    assert.deepEqual(Array.from(preview.pixels), [5, 3, 2, 255]);
  });

  it('renders a gray band and an alpha band named by displayBands', function () {
    var grid = makeGrid(3, new Uint8Array([1, 200, 128]), {color: [1], alpha: 2});
    var preview = internal.renderRasterPreview(grid, {type: 'gray', scaling: 'none'}, 1, 1);
    assert.deepEqual(Array.from(preview.pixels), [200, 200, 200, 128]);
    grid.samples = new Float32Array([1, 200, 128]);
    grid.pixelType = 'float32';
    preview = internal.renderRasterPreview(grid, {type: 'gray', scaling: 'none'}, 1, 1);
    assert.deepEqual(Array.from(preview.pixels), [200, 200, 200, 128]);
  });

  it('renders scaled display bands', function () {
    var grid = makeGrid(2, new Float32Array([1000, 0, -1000, 10]), {color: [1], alpha: -1}, 2);
    var preview = internal.renderRasterPreview(grid, {type: 'gray', scaling: 'minmax'}, 2, 1);
    assert.deepEqual(Array.from(preview.pixels), [0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('shares RGB minmax scaling among the display bands only', function () {
    var grid = makeGrid(4, new Uint16Array([
      60000, 10, 20, 30,
      0, 110, 60, 10
    ]), {color: [1, 2, 3], alpha: -1}, 2);
    var preview = internal.renderRasterPreview(grid, {type: 'rgb', scaling: 'minmax'}, 2, 1);
    assert.deepEqual(Array.from(preview.pixels), [0, 26, 51, 255, 255, 128, 0, 255]);
  });

  it('lets the pixel readout label every band of a grid with displayBands', function () {
    var lyr = {raster: {grid: makeGrid(4, new Uint8Array([1, 2, 3, 4]), {color: [0], alpha: -1})}};
    var info = internal.getRasterPixelAtMapXY(lyr.raster, 0.5, 0.5);
    assert.equal(info.channels, null);
    assert.equal(info.isColor, false);
    delete lyr.raster.grid.displayBands;
    info = internal.getRasterPixelAtMapXY(lyr.raster, 0.5, 0.5);
    assert.equal(info.channels, 'rgba');
    assert.equal(info.isColor, true);
  });

  it('fills empty pixels of a grid with displayBands with nodata, not an alpha band', function () {
    var grid = makeGrid(3, new Uint8Array([1, 2, 3, 4, 5, 6]), {color: [2], alpha: -1}, 2);
    grid.coverage = new Uint8Array([1, 0]);
    internal.fillEmptyRasterPixels(grid, {grid: grid});
    assert.equal(grid.bands, 3);
    var v = grid.nodata;
    assert(v > 6);
    assert.deepEqual(Array.from(grid.samples), [1, 2, 3, v, v, v]);
  });

  it('paints nodata-color into the display bands', function () {
    var grid = makeGrid(5, new Uint8Array(10).fill(9), {color: [4, 3, 2], alpha: 0}, 2);
    grid.coverage = new Uint8Array([1, 0]);
    internal.fillEmptyRasterPixels(grid, {grid: grid}, {nodata_color: 'rgba(10,20,30,0.5)'});
    assert.deepEqual(Array.from(grid.samples), [9, 9, 9, 9, 9, 128, 9, 30, 20, 10]);
  });

  it('-info reports image stats from the display bands', function () {
    var grid = makeGrid(4, new Uint8Array([255, 255, 255, 0, 0, 0, 0, 255]),
      {color: [0, 1, 2], alpha: -1}, 2);
    var info = internal.getImageInfo(grid);
    assert.equal(info.has_alpha, false);
    assert.equal(info.transparent_count, 0);
    grid.displayBands = {color: [0], alpha: 3};
    info = internal.getImageInfo(grid);
    assert.equal(info.has_alpha, true);
    assert.equal(info.transparent_count, 1);
    assert.equal(info.chroma, null);
  });
});

function makeGrid(bands, samples, displayBands, width) {
  width = width || 1;
  return {
    width: width,
    height: 1,
    bands: bands,
    pixelType: samples instanceof Float32Array ? 'float32' :
      samples instanceof Uint16Array ? 'uint16' : 'uint8',
    samples: samples,
    nodata: null,
    displayBands: displayBands,
    bbox: [0, 0, width, 1],
    transform: [1, 0, 0, 0, -1, 1]
  };
}
