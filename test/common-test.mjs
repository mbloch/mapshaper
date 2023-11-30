import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


describe('mapshaper-common.js', function () {

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
