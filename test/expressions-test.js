var assert = require('assert'),
    api = require("../");


describe('mapshaper-expressions.js', function () {
  describe('removeExpressionSemicolons()', function () {
    it('removes semicolons at the end of an expression', function () {
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2;"), "NAME = NAME2")
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; "), "NAME = NAME2")
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2 ;;"), "NAME = NAME2")
    })

    it('converts interior semicolons to commas', function () {
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; console.log(RANK);"), "NAME = NAME2, console.log(RANK)")
      assert.equal(api.removeExpressionSemicolons("NAME = NAME2; console.log(RANK)"), "NAME = NAME2, console.log(RANK)")

    })
  })

})