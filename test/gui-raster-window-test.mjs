import assert from 'assert';
import { cropRasterWindow, getRasterWindow } from '../src/gui/gui-raster-window.mjs';

describe('gui-raster-window.mjs', function () {
  // a 100 x 50 image covering 0-1000 by 0-500
  var BBOX = [0, 0, 1000, 500];

  it('gives the part of the image in view, if it is small enough', function () {
    var win = getRasterWindow(100, 50, BBOX, [200, 100, 400, 300], 1e6);
    assert.deepEqual(win, {x0: 20, y0: 20, x1: 40, y1: 40, framed: false, bbox: [200, 100, 400, 300]});
  });

  it('clips the view to the image, and is null if the image is out of view', function () {
    var win = getRasterWindow(100, 50, BBOX, [-500, -500, 105, 2000], 1e6);
    assert.deepEqual([win.x0, win.y0, win.x1, win.y1, win.framed], [0, 0, 11, 50, false]);
    assert.equal(getRasterWindow(100, 50, BBOX, [2000, 0, 3000, 500], 1e6), null);
  });

  it('gives a framed box of at most maxPixels in the middle of a larger view, with its shape', function () {
    var win = getRasterWindow(100, 50, BBOX, [0, 0, 1000, 500], 200);
    var w = win.x1 - win.x0, h = win.y1 - win.y0;
    assert(win.framed);
    assert(w * h <= 200);
    assert(Math.abs(w / h - 2) < 0.3);
    assert(Math.abs((win.x0 + win.x1) / 2 - 50) <= 1);
    assert(Math.abs((win.y0 + win.y1) / 2 - 25) <= 1);
    assert.deepEqual(win.bbox, [win.x0 * 10, 500 - win.y1 * 10, win.x1 * 10, 500 - win.y0 * 10]);
  });

  it('crops the window from an image with any number of bands', function () {
    var arr = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]); // 3 x 3
    var win = {x0: 1, y0: 1, x1: 3, y1: 3};
    assert.deepEqual(Array.from(cropRasterWindow(arr, 3, 1, win)), [5, 6, 8, 9]);
    var rgba = new Uint8Array(16).map(function(v, i) { return i; }); // 2 x 2
    assert.deepEqual(Array.from(cropRasterWindow(rgba, 2, 4, {x0: 1, y0: 0, x1: 2, y1: 2})),
      [4, 5, 6, 7, 12, 13, 14, 15]);
  });
});
