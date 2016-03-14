/* @requires mapshaper-common */

// A minheap data structure used for computing Visvalingam simplification data.
//
function Heap() {
  var heapBuf = utils.expandoBuffer(Int32Array),
      indexBuf = utils.expandoBuffer(Int32Array),
      itemsInHeap = 0,
      dataArr,
      heapArr,
      indexArr;

  this.init = function(values) {
    var i;
    dataArr = values;
    itemsInHeap = values.length;
    heapArr = heapBuf(itemsInHeap);
    indexArr = indexBuf(itemsInHeap);
    for (i=0; i<itemsInHeap; i++) {
      insertValue(i, i);
    }
    // place non-leaf items
    for (i=(itemsInHeap-2) >> 1; i >= 0; i--) {
      downHeap(i);
    }
  };

  this.size = function() {
    return itemsInHeap;
  };

  // Update a single value and re-heap
  this.updateValue = function(valIdx, val) {
    var heapIdx = indexArr[valIdx];
    dataArr[valIdx] = val;
    if (!(heapIdx >= 0 && heapIdx < itemsInHeap)) {
      error("Out-of-range heap index.");
    }
    downHeap(upHeap(heapIdx));
  };

  this.popValue = function() {
    return dataArr[this.pop()];
  };

  // Return the idx of the lowest-value item in the heap
  this.pop = function() {
    var popIdx;
    if (itemsInHeap <= 0) {
      error("Tried to pop from an empty heap.");
    }
    popIdx = heapArr[0];
    insertValue(0, heapArr[--itemsInHeap]); // move last item in heap into root position
    downHeap(0);
    return popIdx;
  };

  function upHeap(idx) {
    var parentIdx;
    // Move item up in the heap until it's at the top or is not lighter than its parent
    while (idx > 0) {
      parentIdx = (idx - 1) >> 1;
      if (greaterThan(idx, parentIdx)) {
        break;
      }
      swapItems(idx, parentIdx);
      idx = parentIdx;
    }
    return idx;
  }

  // Swap item at @idx with any lighter children
  function downHeap(idx) {
    var minIdx = compareDown(idx);

    while (minIdx > idx) {
      swapItems(idx, minIdx);
      idx = minIdx; // descend in the heap
      minIdx = compareDown(idx);
    }
  }

  function swapItems(a, b) {
    var i = heapArr[a];
    insertValue(a, heapArr[b]);
    insertValue(b, i);
  }

  // Associate a heap idx with the index of a value in data arr
  function insertValue(heapIdx, valId) {
    indexArr[valId] = heapIdx;
    heapArr[heapIdx] = valId;
  }

  // @a, @b: Indexes in @heapArr
  function greaterThan(a, b) {
    var idx1 = heapArr[a],
        idx2 = heapArr[b],
        val1 = dataArr[idx1],
        val2 = dataArr[idx2];
    // If values are equal, compare array indexes.
    // This is not a requirement of the Visvalingam algorithm,
    // but it generates output that matches Mahes Visvalingam's
    // reference implementation.
    // See https://hydra.hull.ac.uk/assets/hull:10874/content
    return (val1 > val2 || val1 === val2 && idx1 > idx2);
  }

  function compareDown(idx) {
    var a = 2 * idx + 1,
        b = a + 1,
        n = itemsInHeap;
    if (a < n && greaterThan(idx, a)) {
      idx = a;
    }
    if (b < n && greaterThan(idx, b)) {
      idx = b;
    }
    return idx;
  }
}
