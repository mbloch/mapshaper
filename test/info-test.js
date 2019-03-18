var assert = require('assert'),
    api = require("../");

describe('mapshaper-info.js', function () {
  describe('formatTableValue()', function () {

    it('string field', function() {
      var target = "'bar'";
      assert.equal(api.internal.formatTableValue('bar', 0), target);
    });

    it('decimal field', function() {
      var target = '  -0.4';
      assert.equal(api.internal.formatTableValue(-0.4, 4), target);
    });

    it('integer field', function() {
      var target = '333';
      assert.equal(api.internal.formatTableValue(333, 3), target);
    });

    it('object field', function() {
      var target = '{"a":2}';
      assert.equal(api.internal.formatTableValue({a: 2}, 0), target);
    });

    it('null value', function() {
      var target = 'null';
      assert.equal(api.internal.formatTableValue(null, 0), target);
    });

  })

})