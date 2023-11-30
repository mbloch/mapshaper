
import {extendPolylinePart} from '../src/polylines/mapshaper-polyline-clean';
import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;

describe('mapshaper-polyline-clean.js', function () {
  describe('extendPolylinePart()', function () {

    it('head to tail', function() {
      var parts = [[0, 1], [2, 3]];
      extendPolylinePart(parts, 0, ~0, 1, 3);
      assert.deepEqual(parts[0], [2, 3, 0, 1]);
    });

    it('tail to tail', function() {
      var parts = [[0, 1], [2, 3]];
      extendPolylinePart(parts, 0, ~0, 1, ~2);
      assert.deepEqual(parts[0], [~3, ~2, 0, 1]);
    });

    it('head to head', function() {
      var parts = [[0, 1], [2, 3]];
      extendPolylinePart(parts, 0, 1, 1, 3);
      assert.deepEqual(parts[0], [0, 1, ~3, ~2]);
    })

    it('tail to head', function() {
      var parts = [[0, 1], [2, 3]];
      extendPolylinePart(parts, 0, 1, 1, ~2);
      assert.deepEqual(parts[0], [0, 1, 2, 3]);
    })
  })
})
