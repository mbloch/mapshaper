import assert from 'assert';
import api from '../mapshaper.js';
import {
  countMultiPartFeatures,
  requireSinglePointLayer,
  layerIsRectangle,
  layerOnlyHasRectangles
} from '../src/dataset/mapshaper-layer-utils';

// A layer of one multi-point feature
var multiPointLayer = {
  geometry_type: 'point',
  shapes: [[[0, 0], [1, 1]]]
};

var singlePointLayer = {
  geometry_type: 'point',
  shapes: [[[0, 0]], [[1, 1]]]
};

function importGeoJSON(geojson) {
  var dataset = api.internal.importGeoJSON(geojson, {});
  return {layer: dataset.layers[0], arcs: dataset.arcs};
}

describe('mapshaper-layer-utils.js', function () {

  describe('countMultiPartFeatures()', function () {
    it('counts shapes with more than one part', function () {
      assert.equal(countMultiPartFeatures(multiPointLayer.shapes), 1);
      assert.equal(countMultiPartFeatures(singlePointLayer.shapes), 0);
    });

    it('tolerates a missing shapes array', function () {
      assert.equal(countMultiPartFeatures(null), 0);
      assert.equal(countMultiPartFeatures(undefined), 0);
    });

    it('ignores null shapes', function () {
      assert.equal(countMultiPartFeatures([null, [[0, 0]], null]), 0);
    });

    // Passing a layer used to read .length off the layer object, yielding 0 and
    // silently disabling every check that relies on this function.
    it('rejects being passed a layer instead of a shapes array', function () {
      assert.throws(function() {
        countMultiPartFeatures(multiPointLayer);
      }, /expects an array of shapes/);
    });
  });

  describe('requireSinglePointLayer()', function () {
    it('accepts a layer of single points', function () {
      assert.doesNotThrow(function() {
        requireSinglePointLayer(singlePointLayer);
      });
    });

    it('rejects a layer with multi-point features', function () {
      assert.throws(function() {
        requireSinglePointLayer(multiPointLayer);
      }, /multi-point features/);
    });

    it('uses a caller-supplied message', function () {
      assert.throws(function() {
        requireSinglePointLayer(multiPointLayer, 'no multipoints here');
      }, /no multipoints here/);
    });

    it('rejects a non-point layer', function () {
      assert.throws(function() {
        requireSinglePointLayer({geometry_type: 'polygon', shapes: [[[0]]]});
      }, /Expected a point layer/);
    });
  });

  describe('layerOnlyHasRectangles()', function () {
    it('accepts a layer of rectangles', function () {
      var o = importGeoJSON({
        type: 'GeometryCollection',
        geometries: [
          {type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]},
          {type: 'Polygon', coordinates: [[[3, 0], [3, 1], [4, 1], [4, 0], [3, 0]]]}
        ]
      });
      assert.ok(layerOnlyHasRectangles(o.layer, o.arcs));
    });

    it('accepts a multi-part shape whose every part is a rectangle', function () {
      var o = importGeoJSON({
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
          [[[3, 0], [3, 1], [4, 1], [4, 0], [3, 0]]]
        ]
      });
      assert.ok(layerOnlyHasRectangles(o.layer, o.arcs));
    });

    // Previously only the first part of each shape was tested, so a shape that
    // opened with a rectangle passed regardless of what followed.
    it('rejects a multi-part shape with a non-rectangular part', function () {
      var o = importGeoJSON({
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
          [[[3, 0], [3, 1], [4, 2], [4, 0], [3, 0]]]
        ]
      });
      assert.ok(!layerOnlyHasRectangles(o.layer, o.arcs));
    });

    it('rejects a point layer', function () {
      assert.ok(!layerOnlyHasRectangles(singlePointLayer, null));
    });
  });

  describe('layerIsRectangle()', function () {
    it('accepts a single rectangle', function () {
      var o = importGeoJSON({
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
      });
      assert.ok(layerIsRectangle(o.layer, o.arcs));
    });

    it('rejects a layer holding two rectangles', function () {
      var o = importGeoJSON({
        type: 'GeometryCollection',
        geometries: [
          {type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]},
          {type: 'Polygon', coordinates: [[[3, 0], [3, 1], [4, 1], [4, 0], [3, 0]]]}
        ]
      });
      assert.ok(!layerIsRectangle(o.layer, o.arcs));
    });
  });
});
