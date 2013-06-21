var api = require('../'),
  assert = require('assert'),
  Utils = api.Utils,
  Bounds = api.Bounds;

describe('bounds.js', function () {

  describe('Bounds#sameBounds()', function () {
    it('should return true if bounds are identical', function () {
      assert.ok(new Bounds(0, 0, 0, 0).sameBounds(new Bounds(0, 0, 0, 0)));
      assert.ok(new Bounds(0, 0, 1, 1).sameBounds(new Bounds(0, 0, 1, 1)));
    });

    it('should return false if bounds are not identical', function() {
      assert.equal(false, new Bounds(0, 0, 0, 0).sameBounds(new Bounds()));
      assert.equal(false, new Bounds(0, 0, 1, 1).sameBounds(new Bounds(0, 0, 1, 2)));
    })
  })

  describe('Bounds#fillOut()', function () {
    it("no expansion", function() {
      var b = new Bounds(0, 0, 1, 1);
      assert.ok(b.sameBounds(b.clone().fillOut(1)))
    })

    it("x-axis expansion", function() {
      var b = new Bounds(0, 0, 1, 1);
      assert.deepEqual(b.clone().fillOut(2), new Bounds(-0.5, 0, 1.5, 1));
      assert.deepEqual(b.clone().fillOut(2, 0, 0), new Bounds(-1, 0, 1, 1));
      assert.deepEqual(b.clone().fillOut(2, 1, 1), new Bounds(0, 0, 2, 1));
    })

    it("y-axis expansion", function() {
      var b = new Bounds(0, 0, 1, 1);
      assert.deepEqual(b.clone().fillOut(0.5), new Bounds(0, -0.5, 1, 1.5));
      assert.deepEqual(b.clone().fillOut(0.5, 0, 0), new Bounds(0, -1, 1, 1));
    })
  })
 
})