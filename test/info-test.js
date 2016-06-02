var assert = require('assert'),
    api = require("../");

describe('mapshaper-info.js', function () {
  describe('formatTableItem()', function () {

    it('string field', function() {
      var target = "foo  'bar'";
      assert.equal(api.internal.formatTableItem('foo', 'bar', 5, 0), target);
    });

    it('decimal field', function() {
      var target = 'foo   -0.4';
      assert.equal(api.internal.formatTableItem('foo', -0.4, 4, 4), target);
    });

    it('integer field', function() {
      var target = 'foo 333';
      assert.equal(api.internal.formatTableItem('foo', 333, 4, 3), target);
    });

    it('object field', function() {
      var target = 'foo {"a":2}';
      assert.equal(api.internal.formatTableItem('foo', {a: 2}, 4, 0), target);
    });

    it('null value', function() {
      var target = 'foo  null';
      assert.equal(api.internal.formatTableItem('foo', null, 5, 0), target);
    });

  })

})