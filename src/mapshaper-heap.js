/* @requires core */

// A heap data structure used for computing Visvalingam simplification data.
//
function Heap() {
  var bufLen = 0,
      maxItems = 0,
      maxIdx, minIdx,
      itemsInHeap,
      poppedVal,
      heapArr, indexArr, valueArr;

  //
  // PUBLIC METHODS
  //

  this.addValues = function(values, start, len) {
    minIdx = start | 0;
    maxItems = len == null ? values.length : len | 0
    maxIdx = minIdx + maxItems - 1;
    valueArr = values;
    init(maxItems);
    for (var i=minIdx; i<=maxIdx; i++) {
      addValue(i, values[i]);
    }
  };


  this.heapSize = function() {
    return itemsInHeap;
  }


  // Update a single value and re-heap.
  //
  this.updateValue = function(valIdx, val) {
    if (valIdx < minIdx || valIdx > maxIdx) error("Out-of-range point index.");
    if (val < poppedVal) {
      // don't give updated values a lesser value than the last popped vertex...
      val = poppedVal;
    }
    valueArr[valIdx] = val;
    var heapIdx = indexArr[valIdx];
    if (heapIdx < 0 || heapIdx >= itemsInHeap) error("[updateValue()] out-of-range heap index.");
    reHeap(heapIdx);
  };


  this.testHeapOrder = function() {
    return checkNode(0, -Infinity);
  };


  // Return the idx of the lowest-value item in the heap
  //
  this.pop = function() {
    if (itemsInHeap <= 0) error("Tried to pop from an empty heap.");
    if (poppedVal === -Infinity) {
      if (itemsInHeap != maxItems) error("pop() called before heap is populated.");
    }
    // get min-val item from top of heap...
    var minIdx = heapArr[0],
        minVal = valueArr[minIdx],
        lastIdx;

    lastIdx = --itemsInHeap;
    if (itemsInHeap > 0) {
      heapArr[0] = heapArr[lastIdx]; // copy last item in heap into root position
      indexArr[heapArr[0]] = 0;
      reHeap(0);
    }

    if (minVal < poppedVal) error("[VisvalingamHeap.pop()] out-of-sequence value; prev:", poppedVal, "new:", minVal);
    poppedVal = minVal;
    return minIdx;
  };


  //
  // PRIVATE
  //

  // Prepare the heap for simplifying a new arc.
  //
  function init(size) {
    if (size > bufLen) {
      bufLen = Math.round(size * 1.2);
      heapArr = new Int32Array(bufLen);
      indexArr = new Int32Array(bufLen + 2); // requires larger...
    }
    itemsInHeap = 0;
    poppedVal = -Infinity;
  };

  // Add an item to the bottom of the heap and restore heap order.
  //
  function addValue(valIdx, val) {
    var heapIdx = itemsInHeap++;
    if (itemsInHeap > maxItems) error("Heap overflow.");
    if (valIdx < minIdx || valIdx > maxIdx) error("Out-of-bounds point index.");
    valueArr[valIdx] = val;
    heapArr[heapIdx] = valIdx
    indexArr[valIdx] = heapIdx;
    reHeap(heapIdx);
  };


  // Check that heap is ordered starting at a given node
  // (traverses heap recursively)
  //
  function checkNode(heapIdx, parentVal) {
    if (heapIdx >= itemsInHeap) {
      return;
    }
    var valIdx = heapArr[heapIdx];
    var val = valueArr[valIdx];
    if (parentVal > val)
      error("[checkNode()] heap is out-of-order at idx:", heapIdx, "-- parentVal:", parentVal, "nodeVal:", val);
    var childIdx = heapIdx * 2 + 1;
    checkNode(childIdx, val);
    checkNode(childIdx + 1, val);
    return true;
  }

  function getHeapValues() {
    var arr = [];
    for (var i=0; i<itemsInHeap; i++) {
      arr.push(valueArr[heapArr[i]]);
    }
    return arr;
  }

  // Function restores order to the heap (lesser values towards the top of the heap)
  // Receives the idx of a heap item that has just been changed or added.
  // (Assumes the rest of the heap is ordered, this item may be out-of-order)
  //
  function reHeap(currIdx) {
    var currValIdx,
        currVal,
        parentIdx,
        parentValIdx,
        parentVal;

    if (currIdx < 0 || currIdx >= itemsInHeap) error("Out-of-bounds heap idx passed to reHeap()");
    currValIdx = heapArr[currIdx];
    currVal = valueArr[currValIdx];

    // Bubbling phase:
    // Move item up in the heap until it's at the top or is heavier than its parent
    //
    while (currIdx > 0) {
      parentIdx = (currIdx - 1) >> 1; // integer division by two gives idx of parent
      parentValIdx = heapArr[parentIdx];
      parentVal = valueArr[parentValIdx];

      if (parentVal <= currVal) {
        break;
      }

      // out-of-order; swap child && parent
      indexArr[parentValIdx] = currIdx;
      indexArr[currValIdx] = parentIdx;
      heapArr[parentIdx] = currValIdx;
      heapArr[currIdx] = parentValIdx;
      currIdx = parentIdx;
      if (valueArr[heapArr[currIdx]] !== currVal) error("Lost value association");
    }

    // Percolating phase:
    // Item gets swapped with any lighter children
    //
    var childIdx = 2 * currIdx + 1,
        childValIdx, childVal,
        otherChildIdx, otherChildValIdx, otherChildVal;

    while (childIdx < itemsInHeap) {
      childValIdx = heapArr[childIdx];
      childVal = valueArr[childValIdx];

      otherChildIdx = childIdx + 1;
      if (otherChildIdx < itemsInHeap) {
        otherChildValIdx = heapArr[otherChildIdx];
        otherChildVal = valueArr[otherChildValIdx];
        if (otherChildVal < childVal) {
          childIdx = otherChildIdx;
          childValIdx = otherChildValIdx;
          childVal = otherChildVal;
        }
      }

      if (currVal <= childVal) {
        break;
      }

      // swap curr item and child w/ lesser value
      heapArr[childIdx] = currValIdx;
      heapArr[currIdx] = childValIdx;
      indexArr[childValIdx] = currIdx;
      indexArr[currValIdx] = childIdx;

      // descend in the heap:
      currIdx = childIdx;
      childIdx = 2 * currIdx + 1;
    }
  };
}