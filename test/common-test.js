var api = require('../'),
  assert = require('assert');

describe('mapshaper-common.js', function () {

  describe('extendBuffer()', function () {
    it('extends a Float64 buffer', function () {
      var src = new Float64Array([1, 2, 3]);
      var ext = api.internal.extendBuffer(src, 4);
      assert.equal(ext.constructor, Float64Array);
      assert.deepEqual(Array.prototype.slice.call(ext), [1, 2, 3, 0]);
    })
    it('extends a Uint8 buffer', function () {
      var src = new Uint8Array([1, 2, 3]);
      var ext = api.internal.extendBuffer(src, 4);
      assert.equal(ext.constructor, Uint8Array);
    })
    it('third argument gives elements to copy', function () {
      var src = new Float64Array([1, 2, 3]);
      var ext = api.internal.extendBuffer(src, 4, 2);
      assert.deepEqual(Array.prototype.slice.call(ext), [1, 2, 0, 0]);
    })
    it('handles illogical params', function () {
      var src = new Float64Array([1, 2, 3]);
      var ext = api.internal.extendBuffer(src, 2, 4);
      assert.deepEqual(Array.prototype.slice.call(ext), [1, 2, 3]);
    })
  })

  describe('wildcardToRxp()', function () {
    var ex1 = "layer1"
    it(ex1, function () {
      assert.equal(api.utils.wildcardToRegExp(ex1).source, 'layer1');
    })

    var ex2 = "layer*";
    it(ex2, function() {
      assert.equal(api.utils.wildcardToRegExp(ex2).source, 'layer.*');
    })
  })


})
