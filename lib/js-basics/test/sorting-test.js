var api = require('../'),
  assert = require('assert'),
  Utils = api.Utils;

describe('sorting.js', function () {

  describe('Utils.sortOn()', function () {
    var a1, a1Asc, a1Desc,
        a2, a2AscDesc, a2DescAsc;

    beforeEach(function() {
      a1 = [{v:4}, {v:5}, {v:0}, {v:-1}],
      a1Asc = [{v:-1}, {v:0}, {v:4}, {v:5}],
      a1Desc = [{v:5}, {v:4}, {v:0}, {v:-1}],
      a2 = [{a:'z', b:3}, {a:'x', b:2}, {a:'z', b:2}, {a:'y', b:2}, {a:'x', b:9}],
      a2AscDesc = [{a:'x', b:9}, {a:'x', b:2}, {a:'y', b:2}, {a:'z', b:3}, {a:'z', b:2}],
      a2DescAsc = [{a:'z', b:2}, {a:'z', b:3}, {a:'y', b:2}, {a:'x', b:2},  {a:'x', b:9}];
    });

    it('should default to ascending search', function () {
      assert.deepEqual(a1Asc, Utils.sortOn(a1, 'v'));
      assert.deepEqual(a2DescAsc, Utils.sortOn(a2, 'a', false, 'b'));
    })

    it('should sort on two criteria', function () {
      assert.deepEqual(a2DescAsc, Utils.sortOn(a2, 'a', false, 'b', true));
      assert.deepEqual(a2AscDesc, Utils.sortOn(a2, 'a', true, 'b', false));
    })

    it('should sort in descending order', function() {
      assert.deepEqual(a1Desc, Utils.sortOn(a1, 'v', false));
    })

    it('should throw an error if key not found', function() {
      assert.throws(function() {Utils.sortOn(a1, 'missingKey', false)});
    })
  })

  describe('Utils.quicksort', function () {
    it('should sort a random array in ascending order', function () {
      var sorted = Utils.quicksort(getRandomArrayWithDupes(1000));
      assert.ok(numbersAreSorted(sorted))
    })

    it('should sort a random array in descending order', function () {
      var sorted = Utils.quicksort(getRandomArrayWithDupes(1000), false);
      assert.ok(numbersAreSorted(sorted))
    })
  })
})

function getRandomArrayWithDupes(len) {
  var arr = Utils.range(len);
  Utils.forEach(Utils.range(len / 2), function(el, i) {
    arr[i] = arr[Math.random() * len | 0];
  });
  Utils.randomizeArray(arr);
  return arr;
}

function numbersAreSorted(arr, asc) {
  asc = asc !== false;
  var prev = asc ? -Infinity : Infinity;
  for (var i=0, n=arr.length; i<n; i++) {
    var val = arr[i];
    if (isNaN(val) || asc && val < prev || !asc && val > prev) return false;
  }
  return true;
}
