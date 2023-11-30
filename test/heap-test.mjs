import assert from 'assert';
import api from '../mapshaper.js';

var Heap = api.internal.Heap;

function heapSort(arr) {
  var heap = new Heap();
  var sorted = [];
  heap.init(arr);
  while (heap.size() > 0) {
    sorted.push(heap.popValue());
  }
  return sorted;
}

function referenceSort(arr) {
  arr = arr.concat();
  return arr.sort(function(a, b) {
    return a - b;
  });
}

function getUnsortedTestArray(n) {
  var arr = [], val;
  for (var i=0; i<n; i++) {
    // include plenty of dupes
    arr.push(Math.floor(Math.random() * n / 3));
  }
  return arr;
}

describe("mapshaper-heap.js", function() {

  describe("Heap", function() {

    it("heap pops value ids in sorted order, smallest first", function() {
      var heap = new Heap();
      heap.init([1.1, 3.3, -1.6, 5.1]);
      assert.equal(heap.size(), 4);
      assert.equal(heap.pop(), 2);
      assert.equal(heap.pop(), 0);
      assert.equal(heap.pop(), 1);
      assert.equal(heap.pop(), 3);
      assert.equal(heap.size(), 0);
    });

    it("heap updates correctly when values are changed", function() {
      var heap = new Heap();
      heap.init([1.1, 3.8, -1.1, 5.2, 43]);
      assert.equal(heap.pop(), 2);
      heap.updateValue(3, -0.2);
      assert.equal(heap.pop(), 3);
      heap.updateValue(0, 8.5);
      assert.equal(heap.pop(), 1);
      assert.equal(heap.pop(), 0);
      assert.equal(heap.pop(), 4);
      assert.equal(heap.size(), 0);
    });

    it("heap handles Infinity and ties", function() {
      var a, b;
      var heap = new Heap();
      heap.init([0, Infinity, -1.1, -1.1, 0, Infinity]);
      assert.equal(heap.size(), 6);
      a = heap.pop();
      b = heap.pop();
      assert(a == 2 && b == 3 || a == 3 && b == 2);
      a = heap.pop();
      b = heap.pop();
      assert(a == 0 && b == 4 || a == 4 && b == 0);
      a = heap.pop();
      b = heap.pop();
      assert(a == 1 && b == 5 || a == 5 && b == 1);
    });

    it("heap can be re-initialized", function() {
      var heap = new Heap();
      heap.init([1, 2]);
      assert.equal(heap.size(), 2);
      heap.init([6, 5, 4, 3, 2, 1]);
      assert.equal(heap.size(), 6);
      assert.equal(heap.pop(), 5);
    });

    it("randomized test", function() {
      var n = 10000;
      var unsorted1 = getUnsortedTestArray(n);
      var unsorted2 = unsorted1.concat();
      var sorted1 = heapSort(unsorted1);
      var sorted2 = referenceSort(unsorted2);
      assert.deepEqual(sorted1, sorted2);
    });

    it("popping from empty heap throws error", function() {
      var heap = new Heap();
      assert.throws(function() {
        heap.pop();
      });
      heap.init([]);
      assert.throws(function() {
        heap.pop();
      });
      heap.init([1]);
      heap.pop();
      assert.throws(function() {
        heap.pop();
      });
    })

  })
})