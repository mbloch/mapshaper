var assert = require('assert'),
    api = require("../");

describe('mapshaper-expressions.js', function () {
  describe('removeExpressionSemicolons()', function () {
    it('removes semicolons at the end of an expression', function () {
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2;"), "NAME = NAME2")
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; "), "NAME = NAME2")
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2 ;;"), "NAME = NAME2")
    })

    it('converts interior semicolons to commas', function () {
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; console.log(RANK);"), "NAME = NAME2, console.log(RANK)")
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; console.log(RANK)"), "NAME = NAME2, console.log(RANK)")
    })

    it('FIX: converts multiple interior semicolons to commas', function () {
      assert.equal(api.internal.removeExpressionSemicolons("NAME = NAME2; DUMMY='x'; console.log(RANK);"),
        "NAME = NAME2, DUMMY='x', console.log(RANK)")
    })
  })

  describe('getBaseContext()', function () {
    it('console is exposed', function () {
      var env = api.internal.getBaseContext();
      assert.strictEqual(env.console, console);
    })

    it('global properties are masked', function () {
      var env = api.internal.getBaseContext();
      assert.strictEqual(env.mapshaper, null);
      assert.strictEqual(env.global, null);
    })

    it('build-in functions and libraries are not masked', function () {
      var env = api.internal.getBaseContext();
      assert.strictEqual(env.Math, undefined);
      assert.strictEqual(env.parseInt, undefined);
      assert.strictEqual(env.String, undefined);
    })
  })


})
