import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var ArcCollection = internal.ArcCollection;

describe('mapshaper-point-clipping.js', function () {

  describe('Fig 1', function () {
    //
    //  a --------- b
    //  |           |
    //  |   e - f   |
    //  |   |   |   |
    //  |   h - g   |
    //  |           |
    //  d --------- c
    //
    var coords = [[[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]],  // abcda
          [[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]];         // efghe

    it('clip points on vertices of simple polygon', function () {
      var clipShapes = [[[0]]];
      var arcs = new ArcCollection(coords);
      var points = [[[1, 1]], [[1, 4]], [[4, 4]], [[4, 1]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'clip');
      assert.deepEqual(clipped, points);
    })

    it('clip points on edges of simple polygon', function () {
      var clipShapes = [[[0]]];
      var arcs = new ArcCollection(coords);
      var points = [[[1, 1.2]], [[1.5, 1]], [[4, 3.4]], [[3.4, 4]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'clip');
      assert.deepEqual(clipped, points);
    })

    it('clip points outside filled donut', function () {
      var clipShapes = [[[0], [~1]], [[1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[0, 0]], [[5, 5]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'clip');
      assert.deepEqual(clipped, [null, null]);
    })

    it('erase points outside filled donut', function () {
      var clipShapes = [[[0], [~1]], [[1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[0, 0]], [[5, 5]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'erase');
      assert.deepEqual(clipped, points);
    })

    it('clip points inside filled donut', function () {
      var clipShapes = [[[0], [~1]], [[1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[1.5, 1.5]], [[2.5, 2.5]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'clip');
      assert.deepEqual(clipped, points);
    })

    it('erase points inside filled donut', function () {
      var clipShapes = [[[0], [~1]], [[1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[1.5, 1.5]], [[2.5, 2.5]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'erase');
      assert.deepEqual(clipped, [null, null]);
    })

    it('clip points on boundary of filled donut', function () {
      var clipShapes = [[[0], [~1]], [[1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[1, 1]], [[2, 1]], [[2, 2]], [[2.5, 2]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'clip');
      assert.deepEqual(clipped, points);
    })

    it('erase points on boundaries of filled donut', function () {
      var clipShapes = [[[0], [~1]], [[1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[1, 1]], [[2, 1]], [[2, 2]], [[2.5, 2]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'erase');
      assert.deepEqual(clipped, [null, null, null, null]);
    })

    it('clip points inside donut hole', function () {
      var clipShapes = [[[0], [~1]]];
      var arcs = new ArcCollection(coords);
      var points = [[[2.5, 2.5]]];
      var clipped = internal.clipPoints(points, clipShapes, arcs, 'clip');
      assert.deepEqual(clipped, [null]);
    })

  })

});