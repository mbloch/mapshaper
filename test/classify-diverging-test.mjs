import api from '../mapshaper.js';
import assert from 'assert';
import {
  getDivergingLayout,
  resolvePivot,
  parseClassCounts,
  splitClasses,
  getNiceStep
} from '../src/classification/mapshaper-diverging.mjs';
import { getDivergingClassValues } from '../src/classification/mapshaper-classify-ramps.mjs';

var data = [-12, -8, -5, -3, -1, 0, 0.5, 1, 2, 4, 6, 9, 14, 20, 25];

async function classify(values, opts) {
  var csv = 'v\n' + values.join('\n');
  var out = await api.applyCommands('-i data.csv -classify v ' + opts + ' save-as=c -o format=json', {'data.csv': csv});
  return JSON.parse(out['data.json']).map(d => d.c);
}

describe('mapshaper-diverging.mjs', function () {

  describe('resolvePivot()', function () {
    it('auto is 0 when the data has values on both sides of 0', function () {
      assert.equal(resolvePivot('auto', [-2, 1, 5]), 0);
      assert.equal(resolvePivot(undefined, [-2, 1, 5]), 0);
    });

    it('auto is the median when the data is all on one side of 0', function () {
      assert.equal(resolvePivot('auto', [1, 2, 10]), 2);
      assert.equal(resolvePivot('auto', [0, 2, 4, 10]), 3);
    });

    it('median, mean and numbers', function () {
      assert.equal(resolvePivot('median', [-2, 1, 5]), 1);
      assert.equal(resolvePivot('mean', [-2, 1, 7]), 2);
      assert.equal(resolvePivot('3.5', [-2, 1, 5]), 3.5);
      assert.equal(resolvePivot(-1, [-2, 1, 5]), -1);
    });

    it('defaults to the middle of pivot-range=', function () {
      assert.equal(resolvePivot(undefined, [-2, 1, 5], [2, 4]), 3);
    });

    it('rejects other values', function () {
      assert.throws(() => resolvePivot('middle', [1, 2]));
    });
  });

  describe('parseClassCounts()', function () {
    it('a total or the numbers below and above', function () {
      assert.deepEqual(parseClassCounts(7, true), {total: 7});
      assert.deepEqual(parseClassCounts([7], true), {total: 7});
      assert.deepEqual(parseClassCounts([2, 4], true), {below: 2, above: 4});
      assert.deepEqual(parseClassCounts([0, 3], false), {below: 0, above: 3});
    });

    it('rejects invalid counts', function () {
      assert.throws(() => parseClassCounts([1], true));
      assert.throws(() => parseClassCounts([0, 0], true));
      assert.throws(() => parseClassCounts([2, 2, 2], true));
      assert.throws(() => parseClassCounts([1.5, 2], true));
    });
  });

  describe('splitClasses()', function () {
    it('splits classes in proportion to the counts of features', function () {
      assert.equal(splitClasses(6, 5, 5), 3);
      assert.equal(splitClasses(6, 4, 8), 2);
    });

    it('gives each side that has features a class', function () {
      assert.equal(splitClasses(4, 1, 100), 1);
      assert.equal(splitClasses(4, 100, 1), 3);
      assert.equal(splitClasses(4, 0, 10), 0);
    });
  });

  describe('getNiceStep()', function () {
    it('rounds to 1, 2, 2.5 or 5 times a power of 10', function () {
      assert.equal(getNiceStep(2.2), 2);
      assert.equal(getNiceStep(2.4), 2.5);
      assert.equal(getNiceStep(0.042), 0.05);
      assert.equal(getNiceStep(780), 1000);
    });
  });

  describe('getDivergingLayout()', function () {
    it('equal-interval: both sides share one step, and the longer side gets more classes', function () {
      var layout = getDivergingLayout([-10, -4, 0, 5, 12, 20], 'equal-interval', {classes: 5, no_pivot_class: true, pivot: 0});
      assert.equal(layout.below, 2);
      assert.equal(layout.above, 3);
      assert.equal(layout.neutral, null);
      // step 20/3, the lower side truncated to two classes
      assert.deepEqual(layout.breaks, [-6.66666666667, 0, 6.66666666667, 13.3333333333]);
    });

    it('equal-interval: an automatic pivot class is one step wide', function () {
      var layout = getDivergingLayout([-10, 10], 'equal-interval', {classes: 5, pivot: 0});
      assert.equal(layout.below, 2);
      assert.equal(layout.above, 2);
      assert.deepEqual(layout.neutral, [-2, 2]);
      assert.deepEqual(layout.breaks, [-6, -2, 2, 6]);
    });

    it('equal-interval: pivot-range= sets the pivot class', function () {
      var layout = getDivergingLayout([-10, 10], 'equal-interval', {classes: 5, pivot_range: [-1, 1]});
      assert.equal(layout.pivot, 0);
      assert.deepEqual(layout.neutral, [-1, 1]);
      assert.deepEqual(layout.breaks, [-5.5, -1, 1, 5.5]);
    });

    it('equal-interval: classes= below,above sets each side', function () {
      var layout = getDivergingLayout([-6, 0, 10], 'equal-interval', {classes: [3, 2], pivot: 0, no_pivot_class: true});
      assert.equal(layout.below, 3);
      assert.equal(layout.above, 2);
      assert.deepEqual(layout.breaks, [-4, -2, 0, 5]);
    });

    it('nice: steps are nice numbers', function () {
      var layout = getDivergingLayout([-10, 10], 'nice', {classes: 4, pivot: 0, no_pivot_class: true});
      assert.deepEqual(layout.breaks, [-5, 0, 5]);
    });

    it('quantile: an automatic pivot class holds the values nearest the pivot', function () {
      var layout = getDivergingLayout(data, 'quantile', {classes: 7, pivot: 0});
      // 15 values / 7 classes: the two nearest 0 (0 and 0.5)
      assert.deepEqual(layout.neutral, [-0.75, 0.75]);
      assert.equal(layout.below, 2);
      assert.equal(layout.above, 4);
    });

    it('quantile: ties at the pivot go to the upper side', function () {
      var layout = getDivergingLayout([-2, -1, 0, 0, 1, 2], 'quantile', {classes: 2, pivot: 0, no_pivot_class: true});
      assert.deepEqual(layout.breaks, [0]);
    });

    it('breaks=: a pivot inside a class makes it the pivot class', function () {
      var layout = getDivergingLayout(data, 'breaks', {breaks: [-5, 0, 5, 10], pivot: 1});
      assert.deepEqual(layout.neutral, [0, 5]);
      assert.equal(layout.below, 2);
      assert.equal(layout.above, 2);
    });

    it('breaks=: a pivot at a break divides the classes', function () {
      var layout = getDivergingLayout(data, 'breaks', {breaks: [-5, 0, 5, 10], pivot: 0});
      assert.equal(layout.neutral, null);
      assert.equal(layout.below, 2);
      assert.equal(layout.above, 3);
    });

    it('rejects a pivot outside pivot-range=', function () {
      assert.throws(() => getDivergingLayout(data, 'quantile', {pivot: 5, pivot_range: [-1, 1]}));
    });
  });

  describe('getDivergingClassValues()', function () {
    it('the shorter side uses the colors nearest the center', function () {
      var layout = {below: 1, above: 3, neutral: [-1, 1]};
      var colors = getDivergingClassValues(layout, {colors: ['RdBu']});
      // RdBu with 7 colors: #b2182b,#ef8a62,#fddbc7,#f7f7f7,#d1e5ef,#67a9cf,#2166ac
      assert.deepEqual(colors, ['#fddbc7', '#f7f7f7', '#d1e5f0', '#67a9cf', '#2166ac']);
    });

    it('without a pivot class', function () {
      var layout = {below: 2, above: 1, neutral: null};
      var values = getDivergingClassValues(layout, {values: ['-3', '0', '3']});
      assert.deepEqual(values, [-3, -1.5, 1.5]);
    });

    it('an even list interpolates the center value', function () {
      var layout = {below: 1, above: 1, neutral: [-1, 1]};
      var values = getDivergingClassValues(layout, {values: ['-4', '-2', '2', '4']});
      assert.deepEqual(values, [-4, 0, 4]);
    });

    it('invert swaps the sides', function () {
      var layout = {below: 1, above: 2, neutral: null};
      var values = getDivergingClassValues(layout, {values: ['-2', '0', '2'], invert: true});
      assert.deepEqual(values, [1, -1, -2]);
    });

    it('a list with one value per class is used as given with classes= below,above', function () {
      var layout = {below: 1, above: 2, neutral: null};
      var values = getDivergingClassValues(layout, {values: ['a', 'b', 'c'], classes: [1, 2]});
      assert.deepEqual(values, ['a', 'b', 'c']);
    });
  });

  describe('-classify pivot=', function () {
    it('quantile classes on either side of an automatic pivot class', async function () {
      var classes = await classify(data, 'pivot=0');
      assert.deepEqual(classes, [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    });

    it('no-pivot-class', async function () {
      var classes = await classify([-2, -1, 0, 1, 2, 3], 'pivot=0 classes=2 no-pivot-class');
      assert.deepEqual(classes, [0, 0, 1, 1, 1, 1]);
    });

    it('colors are assigned outward from the pivot', async function () {
      var classes = await classify([-1, 0, 1, 2, 3], 'pivot=0 pivot-range=-0.5,0.5 classes=1,2 colors=red,white,blue equal-interval');
      // the lower side's one class gets the color one step out from white
      assert.deepEqual(classes, ['rgb(255, 128, 128)', 'white', 'rgb(128, 128, 255)', 'blue', 'blue']);
    });

    it('missing values get the null value', async function () {
      var csv = 'v\n-1\n\n1';
      var out = await api.applyCommands('-i data.csv -classify v pivot=0 no-pivot-class colors=red,blue -o format=json', {'data.csv': csv});
      assert.deepEqual(JSON.parse(out['data.json']).map(d => d.fill), ['red', '#eee', 'blue']);
    });

    it('rejects continuous and categorical classes', async function () {
      await assert.rejects(() => classify(data, 'pivot=0 continuous'));
      await assert.rejects(() => classify(data, 'pivot=0 categorical'));
    });

    it('classes= takes two numbers only with pivot=', async function () {
      await assert.rejects(() => classify(data, 'classes=2,3'));
    });

    it('no-pivot-class requires pivot=', async function () {
      await assert.rejects(() => classify(data, 'no-pivot-class'));
    });

    it('precision= with breaks= (regression)', async function () {
      var classes = await classify([0.12, 0.26], 'breaks=0.2 precision=0.1');
      assert.deepEqual(classes, [0, 1]);
    });
  });
});
