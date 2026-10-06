import assert from 'assert';
import api from '../mapshaper.js';
import { boundsCanBeProjected } from '../src/gui/gui-projection-utils';

var internal = api.internal;
var Bounds = internal.Bounds;

describe('gui-projection-utils', function() {
  describe('boundsCanBeProjected()', function() {
    var wgs84 = internal.parseCrsString('wgs84');
    var ortho = internal.parseCrsString('+proj=ortho +lon_0=118.2 +lat_0=50.9');
    var transform = internal.getProjTransform2(wgs84, ortho);

    it('is true for world bounds when the bounds center is on the far side of an ortho globe', function() {
      var bounds = new Bounds(-180, -90, 180, 84);
      assert.equal(transform(bounds.centerX(), bounds.centerY()), null);
      assert.equal(boundsCanBeProjected(bounds, transform), true);
    });

    it('is false when no part of the bounds is visible', function() {
      var bounds = new Bounds(-70, -50, -60, -40);
      assert.equal(boundsCanBeProjected(bounds, transform), false);
    });

    it('is true for bounds near the projection center', function() {
      var bounds = new Bounds(110, 45, 125, 55);
      assert.equal(boundsCanBeProjected(bounds, transform), true);
    });
  });
});
