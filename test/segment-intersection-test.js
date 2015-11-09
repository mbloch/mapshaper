var assert = require('assert'),
    api = require("../"),
    internal = api.internal;

describe('mapshaper-segment-intersection.js', function () {

  describe('calcSegmentIntersectionStripeCount()', function () {
    it('Issue #49 test 1', function () {
      // collapsed islands
      var arcs = new internal.ArcCollection([
        [ [ -7162552.387146705, 731171.1486128338 ],
          [ -7162552.387146705, 731171.1486128338 ] ],
        [ [ -7152552.387146709, 736171.1486128359 ],
          [ -7152552.387146709, 736171.1486128359 ] ],
        [ [ -7152552.387146709, 736171.1486128359 ],
          [ -7152552.387146709, 736171.1486128359 ] ],
        [ [ -7156203.834442849, 758887.8997114667 ],
          [ -7156203.834442849, 758887.8997114667 ] ] ]);

      assert.equal(internal.calcSegmentIntersectionStripeCount(arcs), 1);
    })
  })

})
