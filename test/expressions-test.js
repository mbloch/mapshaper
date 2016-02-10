var assert = require('assert'),
    api = require("../");

describe('mapshaper-expressions.js', function () {

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
