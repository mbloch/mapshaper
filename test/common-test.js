var api = require('../'),
  internal = api.internal,
  assert = require('assert');

describe('mapshaper-common.js', function () {

  describe('extendBuffer()', function () {
    it('extends a Float64 buffer', function () {
      var src = new Float64Array([1, 2, 3]);
      var ext = api.utils.extendBuffer(src, 4);
      assert.equal(ext.constructor, Float64Array);
      assert.deepEqual(Array.prototype.slice.call(ext), [1, 2, 3, 0]);
    })
    it('extends a Uint8 buffer', function () {
      var src = new Uint8Array([1, 2, 3]);
      var ext = api.utils.extendBuffer(src, 4);
      assert.equal(ext.constructor, Uint8Array);
    })
    it('third argument gives elements to copy', function () {
      var src = new Float64Array([1, 2, 3]);
      var ext = api.utils.extendBuffer(src, 4, 2);
      assert.deepEqual(Array.prototype.slice.call(ext), [1, 2, 0, 0]);
    })
    it('handles illogical params', function () {
      var src = new Float64Array([1, 2, 3]);
      var ext = api.utils.extendBuffer(src, 2, 4);
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

  describe('layerHasPoints()', function () {
    it('false if no shapes', function () {
      var lyr = {
        geometry_type: 'point',
        shapes: []
      };
      assert.equal(internal.layerHasPoints(lyr), false);
    });

    it('false if only null shapes', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [null]
      }
      assert.equal(internal.layerHasPoints(lyr), false);
    })

    it('false if non-point type', function() {
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0]]]
      }
      assert.equal(internal.layerHasPoints(lyr), false);
    })

    it('true if layer contains a point', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[0, 0]]]
      }
      assert.equal(internal.layerHasPoints(lyr), true);
    })
  })

  describe('layerHasPaths()', function () {
    it('false if no shapes', function () {
      var lyr = {
        geometry_type: 'polygon',
        shapes: []
      };
      assert.equal(internal.layerHasPaths(lyr), false);
    });

    it('false if only null shapes', function() {
      var lyr = {
        geometry_type: 'polygon',
        shapes: [null]
      }
      assert.equal(internal.layerHasPaths(lyr), false);
    })

    it('true if polygon layer with a shape', function() {
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0]]]
      };
      assert.equal(internal.layerHasPaths(lyr), true);
    })

    it('true if polyline layer with a shape', function() {
      var lyr = {
        geometry_type: 'polyline',
        shapes: [[[0]]]
      };
      assert.equal(internal.layerHasPaths(lyr), true);
    })

  })


})
