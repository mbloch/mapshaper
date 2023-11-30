import assert from 'assert';
import api from '../mapshaper.js';

var ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-polygon-mosaic.js', function () {
  return; // TODO: restore these tests
  describe('buildPolygonMosaic()', function () {
    it ('works for single ring', function() {
      var coords = [[[0, 0], [0, 1], [1, 0], [0, 0]]];
      var nodes = new NodeCollection(new ArcCollection(coords));
      var expect = [[0], [~0]];
      assert.deepEqual(api.internal.buildPolygonMosaic(nodes), expect);
    });

    it ('works for two adjacent rings', function() {
      //   b -- c
      //   | \  |
      //   |  \ |
      //   a -- d
      // arcs: [ab, bd, da, bcd]
      var coords = [[[0, 0], [0, 1]], [[0, 1], [1, 0]], [[1, 0], [0, 0]], [[0, 1], [1, 1], [1, 0]]];
      var nodes = new NodeCollection(new ArcCollection(coords));
      var expect = [[0, 1, 2], [~0, ~2, ~3], [~1, 3]];
      assert.deepEqual(api.internal.buildPolygonMosaic(nodes), expect);
    });

  });

});
