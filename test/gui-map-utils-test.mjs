import api from '../mapshaper.js';
import assert from 'assert';
import { mapNeedsReset, mapNeedsResetFromCollapsedBounds, boundsAreCollapsed } from '../src/gui/gui-map-utils';

var Bounds = api.internal.Bounds;

// One point, padded as calcFullBounds() pads bounds with no area
function pointBounds(x, y) {
  var b = new Bounds(x, y, x, y);
  b.padBounds(1e-4, 1e-4, 1e-4, 1e-4);
  return b;
}

describe('gui-map-utils.mjs', function () {
  // A basemap-sized view, with a label at 100,100 and a second at 300,200
  var view = new Bounds(0, 0, 1000, 1000);
  var one = pointBounds(100, 100);
  var two = new Bounds(100, 100, 300, 200);

  describe('mapNeedsReset()', function () {
    it('takes a second point for a huge change of extent', function () {
      assert.equal(mapNeedsReset(two, one, view, {}), true);
    });
  });

  describe('mapNeedsResetFromCollapsedBounds()', function () {
    it('keeps the view when a second label arrives in it', function () {
      assert.equal(mapNeedsResetFromCollapsedBounds(two, view, {}), false);
    });

    it('keeps the view when the content is still far smaller than it', function () {
      assert.equal(mapNeedsResetFromCollapsedBounds(new Bounds(100, 100, 100.001, 100.001),
        view, {}), false);
    });

    it('resets when the content is out of view', function () {
      assert.equal(mapNeedsResetFromCollapsedBounds(new Bounds(2000, 2000, 2100, 2100),
        view, {}), true);
    });

    it('resets when the content has grown far beyond a view zoomed in to one point', function () {
      var tiny = pointBounds(100, 100);
      assert.equal(mapNeedsResetFromCollapsedBounds(new Bounds(0, 0, 1e6, 1e6), tiny, {}),
        true);
    });
  });

  describe('boundsAreCollapsed()', function () {
    it('is true for a point and for points in a line', function () {
      assert.equal(boundsAreCollapsed(new Bounds(5, 5, 5, 5)), true);
      assert.equal(boundsAreCollapsed(new Bounds(0, 5, 10, 5)), true);
      assert.equal(boundsAreCollapsed(new Bounds(5, 0, 5, 10)), true);
    });

    it('is true for two points a pixel-conversion rounding error apart in y', function () {
      // two symbols placed on the same row of pixels
      assert.equal(boundsAreCollapsed(new Bounds(15.03542, 44.11854418917004,
        17.28028, 44.11854418918919)), true);
    });

    it('is false for bounds with any real area', function () {
      assert.equal(boundsAreCollapsed(two), false);
      assert.equal(boundsAreCollapsed(new Bounds(0, 0, 10, 0.001)), false);
    });
  });
});
