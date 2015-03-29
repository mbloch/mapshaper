/* @requires mapshaper-common */

MapShaper.Heap = Heap; // export for testing

// A minheap data structure used for computing Visvalingam simplification data.
//
function Heap() {
  var capacity = 0,
      itemsInHeap = 0,
      dataArr,
      heapArr,
      indexArr;

  this.init = function(values) {
    var i;
    dataArr = values;
    itemsInHeap = values.length;
    prepareHeap(itemsInHeap);
    for (i=0; i<itemsInHeap; i++) {
      insert(i, i);
    }
    for (i=(itemsInHeap-2) >> 1; i >= 0; i--) {
      downHeap(i);
    }
  };

  function prepareHeap(size) {
    if (size > capacity) {
      capacity = Math.ceil(size * 1.2);
      heapArr = new Int32Array(capacity);
      indexArr = new Int32Array(capacity);
    }
  }

  this.size = function() {
    return itemsInHeap;
  };

  // Update a single value and re-heap.
  this.updateValue = function(valId, val) {
    var heapIdx = indexArr[valId];
    dataArr[valId] = val;
    if (heapIdx < 0 || heapIdx >= itemsInHeap) {
      error("[heap] Out-of-range heap index.");
    }
    downHeap(upHeap(heapIdx));
  };

  this.testHeapOrder = function() {
    checkNode(0, -Infinity);
    return true;
  };

  // Return the idx of the lowest-value item in the heap
  //
  this.pop = function() {
    if (itemsInHeap <= 0) error("Tried to pop from an empty heap.");
    var minValId = heapArr[0],
        lastIdx = --itemsInHeap;
    if (itemsInHeap > 0) {
      insert(0, heapArr[lastIdx]); // copy last item in heap into root position
      downHeap(0);
    }
    return minValId;
  };

  // Associate a heap idx with the id of a value in valuesArr
  //
  function insert(heapIdx, valId) {
    indexArr[valId] = heapIdx;
    heapArr[heapIdx] = valId;
  }

  // Check that heap is ordered starting at a given node
  // (traverses heap recursively)
  //
  function checkNode(heapIdx, parentVal) {
    if (heapIdx >= itemsInHeap) {
      return;
    }
    var val = dataArr[heapArr[heapIdx]];
    if (parentVal > val) error("Heap is out-of-order");
    var childIdx = heapIdx * 2 + 1;
    checkNode(childIdx, val);
    checkNode(childIdx + 1, val);
  }

  function upHeap(currIdx) {
    var valId = heapArr[currIdx],
        currVal = dataArr[valId],
        parentIdx, parentValId;

    // Move item up in the heap until it's at the top or is heavier than its parent
    //
    while (currIdx > 0) {
      parentIdx = (currIdx - 1) >> 1; // integer division by two gives idx of parent
      parentValId = heapArr[parentIdx];
      if (dataArr[parentValId] <= currVal) {
        break;
      }
      // out-of-order; swap child && parent
      insert(currIdx, parentValId);
      insert(parentIdx, valId);
      currIdx = parentIdx;
    }
    return currIdx;
  }

  // Swap item at @idx with any lighter children
  function downHeap(startIdx) {
    var data = dataArr, heap = heapArr, n = itemsInHeap, // local vars, faster
        currIdx = startIdx,
        valId = heap[currIdx],
        currVal = data[valId],
        firstChildIdx = 2 * currIdx + 1,
        secondChildIdx, minChildIdx, childValId;

    while (firstChildIdx < n) {
      minChildIdx = firstChildIdx;
      secondChildIdx = firstChildIdx + 1;
      if (secondChildIdx < n && data[heap[firstChildIdx]] > data[heap[secondChildIdx]]) {
        minChildIdx = secondChildIdx;
      }
      childValId = heap[minChildIdx];
      if (currVal <= data[childValId]) {
        break;
      }
      insert(currIdx, childValId);
      insert(minChildIdx, valId);

      // descend in the heap:
      currIdx = minChildIdx;
      firstChildIdx = 2 * currIdx + 1;
    }
  }
}
