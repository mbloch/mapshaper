import api from '../mapshaper.js';
import assert from 'assert';
import { mapNeedsReset, mapNeedsResetFromCollapsedBounds } from '../src/gui/gui-map-utils';

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
});
