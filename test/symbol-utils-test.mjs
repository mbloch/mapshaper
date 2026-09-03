
import {
  findArcCenter, toItemList, toNumberList, getSymbolBoundingRadius
} from '../src/symbols/mapshaper-symbol-utils';
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-symbol-utils.js', function () {

  describe('findArcCenter()', function () {
    it('tests', function () {
      findArcCenter([0, 0], [10, 0], 90 * Math.PI / 180);
    })
  })

  describe('getSymbolBoundingRadius()', function () {
    // a square of half-width 2, whose corners are the farthest points from the
    // symbol's point
    var square = {
      type: 'polygon',
      coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]
    };

    it('measures a circle', function () {
      assert.equal(getSymbolBoundingRadius({type: 'circle', r: 4}), 4);
    })

    it('adds half of a stroke, which is drawn outside the circle', function () {
      assert.equal(getSymbolBoundingRadius(
        {type: 'circle', r: 4, stroke: 'black', 'stroke-width': 3}), 5.5);
    })

    it('assumes the SVG default stroke width when none is given', function () {
      assert.equal(getSymbolBoundingRadius({type: 'circle', r: 4, stroke: 'black'}), 4.5);
    })

    it('ignores a stroke width without a stroke', function () {
      assert.equal(getSymbolBoundingRadius({type: 'circle', r: 4, 'stroke-width': 3}), 4);
      assert.equal(getSymbolBoundingRadius(
        {type: 'circle', r: 4, stroke: 'none', 'stroke-width': 3}), 4);
    })

    it('measures the farthest vertex of a polygon', function () {
      assert.equal(getSymbolBoundingRadius(square), Math.sqrt(8));
    })

    it('measures a group by its farthest part', function () {
      assert.equal(getSymbolBoundingRadius({type: 'group', parts: [
        {type: 'circle', r: 3},
        square,
        {type: 'circle', r: 6}
      ]}), 6);
    })

    it('measures nested groups', function () {
      assert.equal(getSymbolBoundingRadius({type: 'group', parts: [
        {type: 'group', parts: [{type: 'circle', r: 7}]}
      ]}), 7);
    })

    it('returns 0 for a symbol with nothing to measure', function () {
      assert.equal(getSymbolBoundingRadius({type: 'group', parts: []}), 0);
      assert.equal(getSymbolBoundingRadius({type: 'polygon', coordinates: []}), 0);
      assert.equal(getSymbolBoundingRadius({type: 'circle'}), 0);
      assert.equal(getSymbolBoundingRadius({type: 'circle', r: -4}), 0);
    })

    // A part that shifts the parts after it, or that isn't drawn around the
    // symbol's point, makes the whole symbol unmeasurable.
    it('returns null for a symbol it cannot measure', function () {
      assert.strictEqual(getSymbolBoundingRadius({type: 'polyline'}), null);
      assert.strictEqual(getSymbolBoundingRadius({type: 'label'}), null);
      assert.strictEqual(getSymbolBoundingRadius({type: 'image'}), null);
      assert.strictEqual(getSymbolBoundingRadius({}), null);
      assert.strictEqual(getSymbolBoundingRadius(null), null);
      assert.strictEqual(getSymbolBoundingRadius({type: 'group', parts: [
        {type: 'circle', r: 3},
        {type: 'offset', dx: 20, dy: 0}
      ]}), null);
    })
  })

  describe('toItemList()', function () {
    it('splits a whole list given as a string', function () {
      assert.deepEqual(toItemList('red,blue'), ['red', 'blue']);
    })

    it('leaves an already-split list alone', function () {
      assert.deepEqual(toItemList(['red', 'blue']), ['red', 'blue']);
    })

    it('does not split an item, so rgba() colors survive', function () {
      assert.deepEqual(toItemList(['rgba(0,0,0,0.5)', 'red']), ['rgba(0,0,0,0.5)', 'red']);
      assert.deepEqual(toItemList('rgba(0,0,0,0.5),red'), ['rgba(0,0,0,0.5)', 'red']);
    })

    it('flattens an item holding an array', function () {
      assert.deepEqual(toItemList([['red', 'blue'], 'green']), ['red', 'blue', 'green']);
    })

    it('wraps a lone value', function () {
      assert.deepEqual(toItemList('red'), ['red']);
      assert.deepEqual(toItemList(4), [4]);
    })
  })

  describe('toNumberList()', function () {
    it('converts a string, an array and a number', function () {
      assert.deepEqual(toNumberList('2,4.5'), [2, 4.5]);
      assert.deepEqual(toNumberList([2, '4.5']), [2, 4.5]);
      assert.deepEqual(toNumberList(4), [4]);
    })

    it('keeps negative values', function () {
      assert.deepEqual(toNumberList('30,-5'), [30, -5]);
    })

    it('flattens an item holding an array', function () {
      // e.g. radii='[R, R * 2]', which resolves to one item holding two numbers
      assert.deepEqual(toNumberList([[20, 40]]), [20, 40]);
    })

    it('splits an item holding a comma-separated string', function () {
      // e.g. radii=FIELD, where the field holds a value like "2,4"
      assert.deepEqual(toNumberList(['2,4']), [2, 4]);
    })

    it('returns NaN for values that are not numbers', function () {
      var list = toNumberList(['4', 'wide', undefined]);
      assert.equal(list[0], 4);
      assert.ok(Number.isNaN(list[1]));
      assert.ok(Number.isNaN(list[2]));
    })
  })
});
