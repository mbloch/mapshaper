var assert = require('assert'),
    api = require("../");

describe("mapshaper-heap.js", function() {

  describe("Heap", function() {

    var heap = new api.Heap();

    it("heap pops value ids in sorted order, smallest first", function() {
      heap.addValues([1.1, 3.3, -1.6, 5.1]);
      assert.equal(heap.heapSize(), 4);
      assert.equal(heap.pop(), 2);
      assert.equal(heap.pop(), 0);
      assert.equal(heap.pop(), 1);
      assert.equal(heap.pop(), 3);
      assert.equal(heap.heapSize(), 0);
    });

    it("heap updates correctly when values are changed", function() {
      heap.addValues([1.1, 3.8, -1.1, 5.2]);
      assert.equal(heap.pop(), 2);
      heap.updateValue(3, -0.2);
      assert.equal(heap.pop(), 3);
      heap.updateValue(0, 8.5);
      assert.ok(heap.testHeapOrder())
      assert.equal(heap.pop(), 1);
      assert.equal(heap.pop(), 0);
      assert.equal(heap.heapSize(), 0);
    });

    it("heap accepts params for min and max value id", function() {
      heap.addValues([1.1, 3.8, -1.1, 5.2], 1, 2);
      assert.equal(heap.heapSize(), 2);
      assert.equal(heap.pop(), 2);
      assert.equal(heap.pop(), 1);
      assert.equal(heap.heapSize(), 0);
    });

    it("heap handles an empty range of values", function() {
      heap.addValues([1.1, 3.3], 1, 0);
      assert.equal(heap.heapSize(), 0);
    })

  })
})