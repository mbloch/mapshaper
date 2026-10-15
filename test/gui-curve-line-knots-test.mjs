import assert from 'assert';
import api from '../mapshaper.js';
import {
  createKnotCache, addKnotVersion, findKnotVersion, getLinePathCoords,
  moveCurveKnot, curveKnotsAreClosed, getCurveFlattenTolerance
} from '../src/gui/gui-curve-line-knots';
import { getUpdateLineCommand } from '../src/gui/gui-draw-commands';

var internal = api.internal;

describe('gui curve line knots', function() {

  describe('knot cache', function() {
    it('finds knots by the exact path they produced', function() {
      var cache = createKnotCache();
      addKnotVersion(cache, [[0, 0], [5, 5], [10, 0]], [[0, 0], [2, 3], [5, 5], [10, 0]]);
      assert.deepEqual(findKnotVersion(cache, [[0, 0], [2, 3], [5, 5], [10, 0]]),
        [[0, 0], [5, 5], [10, 0]]);
      assert.equal(findKnotVersion(cache, [[0, 0], [2, 3.0001], [5, 5], [10, 0]]), null);
      assert.equal(findKnotVersion(cache, [[0, 0], [2, 3], [5, 5]]), null);
      assert.equal(findKnotVersion(cache, null), null);
    });

    it('returns the latest knots for a path drawn twice', function() {
      var cache = createKnotCache();
      var path = [[0, 0], [1, 1]];
      addKnotVersion(cache, [[0, 0], [1, 1]], path);
      addKnotVersion(cache, [[0, 0], [0.5, 0.5], [1, 1]], path);
      assert.equal(findKnotVersion(cache, path).length, 3);
    });

    it('returns copies, so that a drag can not change the stored knots', function() {
      var cache = createKnotCache();
      var path = [[0, 0], [1, 1]];
      var knots = [[0, 0], [1, 1]];
      addKnotVersion(cache, knots, path);
      knots[0][0] = 9;
      findKnotVersion(cache, path)[1][0] = 9;
      assert.deepEqual(findKnotVersion(cache, path), [[0, 0], [1, 1]]);
    });

    it('keeps the knots of a previous path, which undo can restore', function() {
      var cache = createKnotCache();
      addKnotVersion(cache, [[0, 0], [1, 1]], [[0, 0], [1, 1]]);
      addKnotVersion(cache, [[0, 0], [2, 2]], [[0, 0], [2, 2]]);
      assert.deepEqual(findKnotVersion(cache, [[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
    });
  });

  describe('getLinePathCoords()', function() {
    var arcs = new internal.ArcCollection([[[0, 0], [1, 1]], [[1, 1], [2, 0]]]);

    it('reads the vertices of a single-part line', function() {
      assert.deepEqual(getLinePathCoords([[0, 1]], arcs), [[0, 0], [1, 1], [2, 0]]);
      assert.deepEqual(getLinePathCoords([[~1]], arcs), [[2, 0], [1, 1]]);
    });

    it('a line with more than one part, or none, has no path', function() {
      assert.equal(getLinePathCoords([[0], [1]], arcs), null);
      assert.equal(getLinePathCoords(null, arcs), null);
    });
  });

  describe('moveCurveKnot()', function() {
    it('moves a knot, leaving the original knots alone', function() {
      var knots = [[0, 0], [5, 5], [10, 0]];
      assert.deepEqual(moveCurveKnot(knots, 1, [5, 8], 1), [[0, 0], [5, 8], [10, 0]]);
      assert.deepEqual(knots, [[0, 0], [5, 5], [10, 0]]);
    });

    it('refuses a move onto another knot', function() {
      assert.equal(moveCurveKnot([[0, 0], [5, 5], [10, 0]], 1, [9.5, 0], 1), null);
    });

    it('moves the first and last knots of a closed curve together', function() {
      var knots = [[0, 0], [10, 0], [5, 5], [0, 0]];
      assert.deepEqual(moveCurveKnot(knots, 0, [0, -2], 1), [[0, -2], [10, 0], [5, 5], [0, -2]]);
      assert.deepEqual(moveCurveKnot(knots, 3, [0, -2], 1), [[0, -2], [10, 0], [5, 5], [0, -2]]);
    });

    it('a small move of a closed curve\'s first knot is not a collision with itself', function() {
      var knots = [[0, 0], [10, 0], [5, 5], [0, 0]];
      assert.deepEqual(moveCurveKnot(knots, 0, [0.1, 0], 1), [[0.1, 0], [10, 0], [5, 5], [0.1, 0]]);
    });
  });

  it('curveKnotsAreClosed()', function() {
    assert(curveKnotsAreClosed([[0, 0], [10, 0], [5, 5], [0, 0]]));
    assert(!curveKnotsAreClosed([[0, 0], [10, 0], [0, 0]]));
    assert(!curveKnotsAreClosed([[0, 0], [10, 0], [5, 5]]));
  });

  it('getCurveFlattenTolerance() is relative to the size of the curve', function() {
    assert.equal(getCurveFlattenTolerance([[0, 0], [100, 20]]), 0.05);
    assert.equal(getCurveFlattenTolerance([[0, 0], [0, 0]]), 0);
  });

  it('getUpdateLineCommand() writes coordinates at full precision', function() {
    assert.equal(getUpdateLineCommand([[0.5, 1.25], [3.1234567891, -2]], 4),
      '-update-line ids=4 coordinates=0.5,1.25,3.1234567891,-2');
  });
});
