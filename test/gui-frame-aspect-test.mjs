import assert from 'assert';
import {
  applyAspectRatio,
  formatFrameAspectRatio,
  getCornerForRatio,
  parseFrameAspectRatio
} from '../src/gui/gui-frame-aspect';

function ratioOf(bbox) {
  return (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
}

function corner(handle) {
  return Object.assign({type: 'corner'}, handle);
}

describe('gui-frame-aspect', function() {
  describe('parseFrameAspectRatio()', function() {
    it('reads a colon pair and a bare number', function() {
      assert.equal(parseFrameAspectRatio('3:2'), 1.5);
      assert.equal(parseFrameAspectRatio(' 16 : 9 '), 16 / 9);
      assert.equal(parseFrameAspectRatio('1.5'), 1.5);
    });

    it('rejects junk and non-positive terms', function() {
      assert.ok(isNaN(parseFrameAspectRatio('wide')));
      assert.ok(isNaN(parseFrameAspectRatio('3:0')));
      assert.ok(isNaN(parseFrameAspectRatio('-3:2')));
      assert.ok(isNaN(parseFrameAspectRatio('1:2:3')));
    });
  });

  describe('formatFrameAspectRatio()', function() {
    it('names a common ratio and rounds an uncommon one', function() {
      assert.equal(formatFrameAspectRatio(1.5), '3:2');
      assert.equal(formatFrameAspectRatio(16 / 9), '16:9');
      assert.equal(formatFrameAspectRatio(1.618), '1.62');
    });
  });

  describe('getCornerForRatio()', function() {
    it('holds the ratio whichever way the pointer moves', function() {
      // Pointer well short of 2:1: height drives the width.
      assert.deepEqual(getCornerForRatio(0, 0, 50, 100, 2), [200, 100]);
      // Pointer past 2:1: width drives the height.
      assert.deepEqual(getCornerForRatio(0, 0, 400, 100, 2), [400, 200]);
    });

    it('keeps the direction of the drag', function() {
      assert.deepEqual(getCornerForRatio(100, 100, 50, 0, 2), [-100, 0]);
      assert.deepEqual(getCornerForRatio(100, 100, 150, 200, 2), [300, 200]);
    });

    it('never shrinks below the pointer on either axis', function() {
      var p = getCornerForRatio(0, 0, 300, 90, 16 / 9);
      assert.ok(Math.abs(p[0]) >= 300);
      assert.ok(Math.abs(p[1]) >= 90);
    });

    it('survives a zero-extent drag', function() {
      assert.deepEqual(getCornerForRatio(10, 10, 10, 10, 2), [10, 10]);
      // A purely horizontal drag still gets a height.
      assert.deepEqual(getCornerForRatio(0, 0, 100, 0, 2), [100, 50]);
      // ...and a purely vertical one still gets a width.
      assert.deepEqual(getCornerForRatio(0, 0, 0, 100, 2), [200, 100]);
    });
  });

  describe('applyAspectRatio()', function() {
    it('anchors a corner drag on the opposite corner', function() {
      var bbox = [0, 0, 100, 10]; // too wide for 2:1
      applyAspectRatio(bbox, corner({col: 'right', row: 'top'}), 2);
      assert.deepEqual(bbox, [0, 0, 100, 50]);
      assert.equal(ratioOf(bbox), 2);
    });

    it('holds the far corner when the near one is top-left', function() {
      var bbox = [0, 0, 100, 10];
      applyAspectRatio(bbox, corner({col: 'left', row: 'top'}), 2);
      // maxx and miny are the anchor and do not move.
      assert.deepEqual(bbox, [0, 0, 100, 50]);
    });

    it('grows the other axis from the centre for an edge drag', function() {
      var bbox = [0, 0, 100, 100];
      applyAspectRatio(bbox, {type: 'edge', col: 'right', row: 'center'}, 2);
      // Width drove the change; height shrinks around the centre, y = 50.
      assert.deepEqual(bbox, [0, 25, 100, 75]);
    });

    it('lets a vertical edge drag drive the width', function() {
      var bbox = [0, 0, 100, 100];
      applyAspectRatio(bbox, {type: 'edge', col: 'center', row: 'top'}, 2);
      assert.deepEqual(bbox, [-50, 0, 150, 100]);
    });

    it('leaves a move and an inverted box alone', function() {
      var moved = [0, 0, 100, 10];
      applyAspectRatio(moved, {type: 'center', col: 'center', row: 'center'}, 2);
      assert.deepEqual(moved, [0, 0, 100, 10]);
      var inverted = [100, 0, 0, 10];
      applyAspectRatio(inverted, corner({col: 'right', row: 'top'}), 2);
      assert.deepEqual(inverted, [100, 0, 0, 10]);
    });
  });
});
