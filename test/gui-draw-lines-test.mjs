import assert from 'assert';
import { getClosingAngleSnap } from '../src/gui/gui-draw-lines2';

describe('gui draw lines', function() {
  describe('getClosingAngleSnap()', function() {
    it('finds the missing corner of a rectangle', function() {
      assert.deepEqual(getClosingAngleSnap([3, 100], [100, 100], [0, 0], 8), [0, 100]);
    });

    it('finds a corner joined by diagonal segments', function() {
      assert.deepEqual(getClosingAngleSnap([52, 48], [100, 0], [0, 0], 8), [50, 50]);
    });

    it('does not snap beyond the pixel threshold', function() {
      assert.strictEqual(getClosingAngleSnap([12, 100], [100, 100], [0, 0], 8), null);
    });

    it('leaves the existing endpoints to their normal snap behavior', function() {
      assert.strictEqual(getClosingAngleSnap([1, 1], [100, 100], [0, 0], 8), null);
    });
  });
});
