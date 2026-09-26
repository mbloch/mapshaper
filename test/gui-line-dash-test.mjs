import assert from 'assert';
import { getCanvasStrokeScale, scaleCanvasLineDash } from '../src/gui/gui-canvas';
import { wrapPatternAnchor } from '../src/gui/gui-canvas-patterns';

describe('preview line dashes', function() {
  it('uses the same scale as the stroke', function() {
    assert.equal(getCanvasStrokeScale(1, 1), 1);
    assert.equal(getCanvasStrokeScale(2, 1), 2);
    assert.equal(getCanvasStrokeScale(1, 2), 2);
    assert.equal(getCanvasStrokeScale(2, 1.5), 3);
  });

  it('leaves an authored pattern unchanged at scale 1', function() {
    assert.deepEqual(scaleCanvasLineDash('4 2', 1), ['4', '2']);
  });

  it('scales dash length and gap together', function() {
    assert.deepEqual(scaleCanvasLineDash('4 2', 2), [8, 4]);
    assert.deepEqual(scaleCanvasLineDash('5', 1.5), [7.5]);
    assert.deepEqual(scaleCanvasLineDash('1 2 3', 2), [2, 4, 6]);
  });
});

describe('pattern anchor', function() {
  var tile = {rotation: 0, sx: 2, sy: 2, w: 4, h: 5};

  function samePoint(a, b) {
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
  }

  it('keeps a point that is already inside the first tile', function() {
    samePoint(wrapPatternAnchor(3, 4, tile), {x: 3, y: 4});
  });

  it('folds a shift of whole tiles back to the same point', function() {
    // one tile is 8 by 10 canvas pixels (image 4 by 5, scaled by 2)
    samePoint(wrapPatternAnchor(3 + 8 * 3, 4 - 10 * 2, tile), {x: 3, y: 4});
  });

  it('folds a rotated tile the same way', function() {
    var rotated = {rotation: 45, sx: 2, sy: 3, w: 4, h: 6};
    var rad = 45 * Math.PI / 180;
    var c = Math.cos(rad), s = Math.sin(rad);
    // one repeat step along the pattern's x axis, in canvas pixels
    var step = 4 * 2;
    var shifted = wrapPatternAnchor(100 + c * step, 80 + s * step, rotated);
    var base = wrapPatternAnchor(100, 80, rotated);
    samePoint(shifted, base);
  });
});
