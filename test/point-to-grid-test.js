
import { twoCircleIntersection } from '../src/commands/mapshaper-point-to-grid.js';
var assert = require('assert')

describe('mapshaper-point-to-grid.js', function () {

  describe('-point-to-grid', function() {

  })


  describe('twoCircleIntersection()', function () {
    it('overlapping', function() {
      var area = twoCircleIntersection([30, 0], 15, [30, 0], 20);
      assert.equal(area, Math.PI * 15 * 15);
    })
    it('disjoint', function() {
      var area = twoCircleIntersection([0, 0], 15, [35, 0], 20);
      assert.equal(area, 0);
    })
  })

})
