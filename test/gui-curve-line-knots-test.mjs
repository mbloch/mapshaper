import assert from 'assert';
import api from '../mapshaper.js';
import {
  createKnotCache, addKnotVersion, findKnotVersion, getLinePathCoords,
  moveCurveKnot, curveKnotsAreClosed, getCurveFlattenTolerance,
  makeKnot, knotIsCorner, toggleCurveKnotCorner, getKnotCorners
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

describe('gui curve line corner knots', function() {
  var open = [[0, 0], [10, 0, true], [20, 5]];
  var closed = [[0, 0, true], [10, 0], [5, 5], [0, 0, true]];

  it('toggleCurveKnotCorner() switches a knot, and leaves the knots it was given alone', function() {
    assert.deepEqual(toggleCurveKnotCorner(open, 1), [[0, 0], [10, 0], [20, 5]]);
    assert.deepEqual(open, [[0, 0], [10, 0, true], [20, 5]]);
  });

  it('the ends of an open curve are not made corners', function() {
    assert.strictEqual(toggleCurveKnotCorner(open, 0), null);
    assert.strictEqual(toggleCurveKnotCorner(open, 2), null);
  });

  it('the first and last knots of a closed curve switch together', function() {
    assert.deepEqual(toggleCurveKnotCorner(closed, 3), [[0, 0], [10, 0], [5, 5], [0, 0]]);
    assert.deepEqual(toggleCurveKnotCorner(closed, 0), [[0, 0], [10, 0], [5, 5], [0, 0]]);
  });

  it('a moved corner is still a corner', function() {
    assert.deepEqual(moveCurveKnot(open, 1, [10, 3], 1), [[0, 0], [10, 3, true], [20, 5]]);
    assert.deepEqual(moveCurveKnot(closed, 0, [1, 0], 1), [[1, 0, true], [10, 0], [5, 5], [1, 0, true]]);
  });

  it('getKnotCorners()', function() {
    assert.deepEqual(getKnotCorners(open), [false, true, false]);
    assert.strictEqual(getKnotCorners([[0, 0], [1, 1]]), null);
  });

  it('the knot cache keeps corners', function() {
    var cache = createKnotCache();
    addKnotVersion(cache, open, [[0, 0], [1, 1]]);
    assert.deepEqual(findKnotVersion(cache, [[0, 0], [1, 1]]), open);
  });

  it('makeKnot() and knotIsCorner()', function() {
    assert.deepEqual(makeKnot([1, 2, true], false), [1, 2]);
    assert.deepEqual(makeKnot([1, 2], true), [1, 2, true]);
    assert(knotIsCorner([1, 2, true]));
    assert(!knotIsCorner([1, 2]));
  });
});
